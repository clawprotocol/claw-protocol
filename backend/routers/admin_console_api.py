from __future__ import annotations

import json
import os
import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from backend.admin_console.store import get_admin_console_store
from backend.affiliates import payout_batches as affiliate_payout_batches
from backend.affiliates.payout_ops_summary import list_payout_batch_summaries
from backend.economics.store import get_economics_store
from backend.integrations.webhook_dispatch import retry_delivery
from backend.integrations import webhook_store
from backend.ops.break_glass_audit import BreakGlassAction, log_break_glass_event
from backend.security.operator_principal import (
    PERM_MUTATE_ADMIN,
    PERM_MUTATE_FINANCIAL,
    PERM_MUTATE_SUPPORT,
    PERM_READ_OPS,
    OperatorPrincipal,
    require_nonempty_reason,
    resolve_operator_principal,
)
from backend.services.agreement_draft_store import list_draft_admin_metadata_newest_first
from backend.usage_economics.store import get_usage_economics_store

router = APIRouter(prefix="/v1/admin", tags=["admin-v1"])


class UserStatusBody(BaseModel):
    disabled: bool
    reason: str = Field(..., min_length=3, max_length=500)


class RefreshEntitlementBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class AgreementFlagBody(BaseModel):
    flagged: bool = True
    reason: str = Field(..., min_length=3, max_length=500)


class ResendDeliveryBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class AffiliateStatusBody(BaseModel):
    status: str = Field(..., pattern="^(active|disabled|hold)$")
    reason: str = Field(..., min_length=3, max_length=500)


class AffiliatePayoutActionBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    tx_hash: Optional[str] = Field(default=None, max_length=256)
    network: str = Field(default="base", max_length=64)


def _operator(
    request: Request,
    *,
    permission: str = PERM_READ_OPS,
) -> OperatorPrincipal:
    principal = resolve_operator_principal(request, require_permission=permission)
    try:
        log_break_glass_event(
            request,
            BreakGlassAction.ADMIN_RUNTIME_SUMMARY,
            auth_channel="operator_principal",
            extra={"actor": principal.user_id, "role": principal.role},
        )
    except Exception:
        pass
    return principal


def _audit(
    principal: OperatorPrincipal,
    *,
    action_type: str,
    target_type: str,
    target_id: str,
    reason: str,
    before: Any = None,
    after: Any = None,
) -> str:
    return get_admin_console_store().append_admin_action_audit(
        admin_user_id=principal.user_id,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        before_snapshot_json=json.dumps(before, default=str) if before is not None else None,
        after_snapshot_json=json.dumps(after, default=str) if after is not None else None,
        actor_role=principal.role,
        correlation_id=principal.correlation_id or None,
    )


def _parse_subject_email(subject_ref: str) -> Optional[str]:
    s = (subject_ref or "").strip()
    return s if "@" in s else None


def _safe_bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return int(v) != 0
    if isinstance(v, str):
        return v.strip().lower() in ("1", "true", "yes", "on")
    return False


def _admin_metadata_row(
    aid: str,
    d: Dict[str, Any],
    *,
    owner_map: Dict[str, Optional[str]],
    flags_map: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    parties = d.get("parties") if isinstance(d.get("parties"), list) else []
    recipient_count = sum(1 for p in parties if str((p or {}).get("role") or "").strip())
    recipient_emails_present = any(str((p or {}).get("email") or "").strip() for p in parties)
    review_sent = str(d.get("review_sent_at") or "").strip()
    signed = any(
        isinstance(e, dict) and str(e.get("event_type") or "") == "signed"
        for e in (d.get("audit_log") or [])
    )
    owner_ref = owner_map.get(aid) or ""
    fg = flags_map.get(aid) or {}
    versions = d.get("versions") if isinstance(d.get("versions"), list) else []
    return {
        "agreement_id": aid,
        "owner_user_id": owner_ref or None,
        "owner_email": _parse_subject_email(owner_ref),
        "created_at": str(d.get("created_at") or ""),
        "updated_at": str(d.get("updated_at") or d.get("created_at") or ""),
        "product_tier": "premium" if recipient_count > 1 else "free",
        "flow_type": "signature" if signed else "review_send",
        "current_phase": "signed" if signed else ("sent" if review_sent else "draft"),
        "agreement_title": str(d.get("title") or "").strip() or "Untitled agreement",
        "party_count": len(parties),
        "recipient_count": recipient_count,
        "recipient_emails_present": bool(recipient_emails_present),
        "delivery_state": "sent" if review_sent else "pending",
        "proof_state": "signed" if signed else "pending",
        "last_event_at": review_sent or str(d.get("updated_at") or ""),
        "last_error_code": None,
        "last_error_at": None,
        "has_active_link": bool(review_sent),
        "version_count": len(versions),
        "is_flagged_abuse": bool(int(fg.get("is_flagged_abuse") or 0)),
    }


def _load_agreements_metadata(limit: int = 200) -> List[Dict[str, Any]]:
    cap = max(1, min(limit, 500))
    ustore = get_usage_economics_store()
    ustore.init_schema()
    draft_slices = list_draft_admin_metadata_newest_first(limit=cap)
    ids = [str(d.get("id") or "").strip() for d in draft_slices if str(d.get("id") or "").strip()]
    owner_map = ustore.owner_subjects_for_agreement_ids(ids)
    flags_map = get_admin_console_store().get_agreement_flags_map(ids)
    return [
        _admin_metadata_row(
            aid,
            d,
            owner_map=owner_map,
            flags_map=flags_map,
        )
        for aid, d in ((str(x.get("id") or "").strip(), x) for x in draft_slices)
        if aid
    ]


@router.get("/overview")
def admin_overview(request: Request) -> Dict[str, Any]:
    _operator(request, permission=PERM_READ_OPS)
    ustore = get_usage_economics_store()
    ustore.init_schema()
    eco = get_economics_store()
    eco.init_schema()
    subjects = ustore.admin_aggregate_subjects()
    agreements = _load_agreements_metadata(limit=250)
    alerts = eco.list_operator_alerts(limit=25)
    payout_batches = list_payout_batch_summaries(limit=50)
    pending_batches = [b for b in payout_batches if str(b.get("status") or "") in ("draft", "exported")]
    return {
        "active_users": sum(1 for s in subjects if not _safe_bool(s.get("abuse_flag"))),
        "new_agreements": sum(1 for a in agreements if str(a.get("current_phase")) == "draft"),
        "premium_unlock_failures": 0,
        "delivery_failures": 0,
        "collaboration_sends": sum(1 for a in agreements if str(a.get("flow_type")) == "review_send"),
        "signature_sends": sum(1 for a in agreements if str(a.get("flow_type")) == "signature"),
        "pending_affiliate_payouts": len(pending_batches),
        "top_recent_errors_by_flow_stage": [
            {
                "event_type": str(a.get("event_type") or "unknown"),
                "severity": str(a.get("severity") or "info"),
                "at": str(a.get("created_at") or ""),
            }
            for a in alerts[:10]
        ],
    }


@router.get("/users")
def admin_users(request: Request, limit: int = Query(default=200, ge=1, le=500)) -> Dict[str, Any]:
    _operator(request, permission=PERM_READ_OPS)
    ustore = get_usage_economics_store()
    ustore.init_schema()
    eco = get_economics_store()
    eco.init_schema()
    subjects = ustore.admin_aggregate_subjects()[:limit]
    subs_by_org: Dict[str, Dict[str, Any]] = {}
    with eco._conn() as con:
        rows = con.execute(
            "SELECT org_id, user_id, plan_code, status, started_at, expires_at FROM subscriptions ORDER BY datetime(created_at) DESC"
        ).fetchall()
        for r in rows:
            d = dict(r)
            oid = str(d.get("org_id") or "")
            if oid and oid not in subs_by_org:
                subs_by_org[oid] = d
    users: List[Dict[str, Any]] = []
    for s in subjects:
        ref = str(s.get("subject_ref") or "").strip()
        sub = subs_by_org.get(ref)
        users.append(
            {
                "id": ref,
                "email": _parse_subject_email(ref),
                "created_at": str(s.get("updated_at") or ""),
                "last_active_at": str(s.get("updated_at") or ""),
                "account_status": "disabled" if _safe_bool(s.get("abuse_flag")) else "active",
                "plan_type": str((sub or {}).get("plan_code") or "free"),
                "premium_active": str((sub or {}).get("status") or "") == "active",
                "entitlement_source": "subscription" if sub else "none",
                "entitlement_started_at": (sub or {}).get("started_at"),
                "entitlement_expires_at": (sub or {}).get("expires_at"),
                "affiliate_code_used": None,
                "referred_by_affiliate_id": None,
                "agreement_count": int(s.get("agreements_created") or 0),
                "last_error_code": None,
            }
        )
    return {"users": users}


@router.post("/users/{subject_ref}/status")
def admin_set_user_status(subject_ref: str, body: UserStatusBody, request: Request) -> Dict[str, Any]:
    principal = _operator(request, permission=PERM_MUTATE_ADMIN)
    reason = require_nonempty_reason(body.reason)
    ustore = get_usage_economics_store()
    ustore.init_schema()
    before = ustore.get_subject_row(subject_ref) or {}
    ustore.set_abuse_flag(subject_ref, 1 if body.disabled else 0)
    ustore.set_soft_throttle(subject_ref, 1 if body.disabled else 0)
    after = ustore.get_subject_row(subject_ref) or {}
    audit_id = _audit(
        principal,
        action_type="set_user_status",
        target_type="user",
        target_id=subject_ref,
        reason=reason,
        before=before,
        after=after,
    )
    return {
        "ok": True,
        "subject_ref": subject_ref,
        "disabled": body.disabled,
        "audit_id": audit_id,
        "actor": principal.user_id,
        "actor_role": principal.role,
    }


@router.post("/users/{subject_ref}/refresh-entitlement")
def admin_refresh_entitlement(subject_ref: str, body: RefreshEntitlementBody, request: Request) -> Dict[str, Any]:
    principal = _operator(request, permission=PERM_MUTATE_SUPPORT)
    reason = require_nonempty_reason(body.reason)
    eco = get_economics_store()
    eco.init_schema()
    with eco._conn() as con:
        row = con.execute(
            "SELECT org_id, user_id, plan_code, status, started_at, expires_at FROM subscriptions WHERE org_id = ? ORDER BY datetime(created_at) DESC LIMIT 1",
            (subject_ref,),
        ).fetchone()
    out = dict(row) if row else None
    audit_id = _audit(
        principal,
        action_type="refresh_entitlement",
        target_type="user",
        target_id=subject_ref,
        reason=reason,
        after=out or {"entitlement": "none"},
    )
    return {
        "ok": True,
        "subject_ref": subject_ref,
        "entitlement": out,
        "audit_id": audit_id,
        "actor": principal.user_id,
        "actor_role": principal.role,
    }


@router.get("/agreements")
def admin_agreements(request: Request, limit: int = Query(default=200, ge=1, le=500)) -> Dict[str, Any]:
    _operator(request, permission=PERM_READ_OPS)
    return {"agreements": _load_agreements_metadata(limit=limit)}


@router.post("/agreements/{agreement_id}/flag")
def admin_flag_agreement(agreement_id: str, body: AgreementFlagBody, request: Request) -> Dict[str, Any]:
    principal = _operator(request, permission=PERM_MUTATE_SUPPORT)
    reason = require_nonempty_reason(body.reason)
    store = get_admin_console_store()
    before = store.get_agreement_flags_map([agreement_id]).get(agreement_id) or {}
    after = store.set_agreement_flag(
        agreement_id=agreement_id,
        flagged=body.flagged,
        reason=reason,
        admin_user_id=principal.user_id,
    )
    audit_id = _audit(
        principal,
        action_type="flag_agreement",
        target_type="agreement",
        target_id=agreement_id,
        reason=reason,
        before=before,
        after=after,
    )
    return {
        "ok": True,
        "agreement_id": agreement_id,
        "is_flagged_abuse": bool(after.get("is_flagged_abuse")),
        "audit_id": audit_id,
        "actor": principal.user_id,
        "actor_role": principal.role,
    }


@router.get("/deliveries")
def admin_deliveries(request: Request, limit: int = Query(default=200, ge=1, le=500)) -> Dict[str, Any]:
    _operator(request, permission=PERM_READ_OPS)
    out: List[Dict[str, Any]] = []
    for row in webhook_store.list_all_org_deliveries(limit=limit):
        out.append(
            {
                "id": row.get("delivery_id"),
                "agreement_id": row.get("object_id"),
                "user_id": row.get("org_id"),
                "event_type": row.get("event_type"),
                "recipient_email": None,
                "provider": "webhook",
                "provider_ref": row.get("hook_id"),
                "status": row.get("status"),
                "error_code": row.get("last_error"),
                "error_message_safe": row.get("error_summary"),
                "created_at": row.get("created_at"),
                "org_id": row.get("org_id"),
                "delivery_id": row.get("delivery_id"),
            }
        )
    return {"events": out}


@router.post("/deliveries/{org_id}/{delivery_id}/resend")
def admin_resend_delivery(org_id: str, delivery_id: str, body: ResendDeliveryBody, request: Request) -> Dict[str, Any]:
    principal = _operator(request, permission=PERM_MUTATE_SUPPORT)
    reason = require_nonempty_reason(body.reason)
    ok = retry_delivery(org_id, delivery_id)
    if not ok:
        raise HTTPException(status_code=404, detail="delivery_not_found")
    audit_id = _audit(
        principal,
        action_type="resend_delivery",
        target_type="delivery",
        target_id=f"{org_id}:{delivery_id}",
        reason=reason,
        after={"queued": True},
    )
    return {"ok": True, "queued": True, "audit_id": audit_id, "actor": principal.user_id}


@router.get("/affiliates")
def admin_affiliates(request: Request, limit: int = Query(default=200, ge=1, le=500)) -> Dict[str, Any]:
    _operator(request, permission=PERM_READ_OPS)
    eco = get_economics_store()
    eco.init_schema()
    return {"affiliates": eco.list_admin_affiliate_summaries(limit=limit)}


@router.get("/affiliate-payout-batches")
def admin_affiliate_payout_batches(
    request: Request, limit: int = Query(default=100, ge=1, le=500)
) -> Dict[str, Any]:
    _operator(request, permission=PERM_READ_OPS)
    return {"batches": list_payout_batch_summaries(limit=limit)}


@router.post("/affiliates/{affiliate_id}/status")
def admin_set_affiliate_status(
    affiliate_id: str, body: AffiliateStatusBody, request: Request
) -> Dict[str, Any]:
    principal = _operator(request, permission=PERM_MUTATE_FINANCIAL)
    reason = require_nonempty_reason(body.reason)
    eco = get_economics_store()
    eco.init_schema()
    with eco._conn() as con:
        before = con.execute("SELECT * FROM affiliates WHERE id = ?", (affiliate_id,)).fetchone()
        if not before:
            raise HTTPException(status_code=404, detail="not_found")
        con.execute("UPDATE affiliates SET status = ? WHERE id = ?", (body.status, affiliate_id))
        after = con.execute("SELECT * FROM affiliates WHERE id = ?", (affiliate_id,)).fetchone()
    audit_id = _audit(
        principal,
        action_type="set_affiliate_status",
        target_type="affiliate",
        target_id=affiliate_id,
        reason=reason,
        before=dict(before) if before else None,
        after=dict(after) if after else None,
    )
    return {
        "ok": True,
        "affiliate_id": affiliate_id,
        "status": body.status,
        "audit_id": audit_id,
        "actor": principal.user_id,
        "actor_role": principal.role,
    }


@router.post("/affiliates/payout-batches/{batch_id}/action")
def admin_affiliate_payout_batch_action(
    batch_id: str, body: AffiliatePayoutActionBody, request: Request, action: str = Query(...),
) -> Dict[str, Any]:
    principal = _operator(request, permission=PERM_MUTATE_FINANCIAL)
    reason = require_nonempty_reason(body.reason)
    action_norm = (action or "").strip().lower()
    if action_norm not in ("approve", "hold", "mark_paid"):
        raise HTTPException(status_code=400, detail="invalid_action")
    if action_norm == "mark_paid":
        out = affiliate_payout_batches.mark_batch_paid(batch_id=batch_id, tx_hash=body.tx_hash, network=body.network)
    elif action_norm == "approve":
        out = affiliate_payout_batches.mark_batch_exported(batch_id=batch_id)
    else:
        out = affiliate_payout_batches.cancel_draft_batch(batch_id=batch_id)
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("error", "failed"))
    audit_id = _audit(
        principal,
        action_type=f"affiliate_payout_{action_norm}",
        target_type="affiliate_payout_batch",
        target_id=batch_id,
        reason=reason,
        after=out,
    )
    out = {**out, "audit_id": audit_id, "actor": principal.user_id, "actor_role": principal.role}
    return out


@router.get("/audit")
def admin_audit(request: Request, limit: int = Query(default=200, ge=1, le=1000)) -> Dict[str, Any]:
    _operator(request, permission=PERM_READ_OPS)
    rows = get_admin_console_store().list_admin_action_audit(limit=limit)
    return {"actions": rows}
