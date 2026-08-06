from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from backend.admin_console.store import get_admin_console_store
from backend.affiliates import payout_batches as affiliate_payout_batches
from backend.affiliates.payout_ops_summary import list_payout_batch_summaries
from backend.config.deployment_runtime import claw_environment
from backend.economics.store import get_economics_store
from backend.integrations.webhook_dispatch import retry_delivery
from backend.integrations import webhook_store
from backend.ops.break_glass_audit import BreakGlassAction, log_break_glass_event
from backend.security.commercial_auth import correlation_id_from_request
from backend.security.operator_principal import (
    ROLE_SUPPORT_OPERATOR,
    OperatorPrincipal,
    require_nonempty_reason,
)
from backend.security.privileged_ops import (
    PERM_MUTATE_ADMIN,
    PERM_MUTATE_FINANCIAL,
    PERM_MUTATE_SUPPORT,
    PERM_READ_OPS,
    require_privileged_operator,
)
from backend.security.supabase_jwt import require_supabase_user_id
from backend.services.agreement_draft_store import list_draft_admin_metadata_newest_first
from backend.usage_economics.store import get_usage_economics_store

router = APIRouter(prefix="/v1/admin", tags=["admin-v1"])


class UserStatusBody(BaseModel):
    disabled: bool
    reason: str = Field(..., min_length=3, max_length=500)


class RefreshEntitlementBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class GenesisEntitlementGrantBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    expires_at: Optional[str] = Field(default=None, max_length=64)
    allowance_override: Optional[int] = Field(default=None, ge=1, le=100)


class GenesisEntitlementRevokeBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class GenesisUsageReconcileBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    mode: str = Field(default="reset_month_to_zero", pattern="^reset_month_to_zero$")
    dry_run: bool = False


class GenesisLegacyMigrationBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    dry_run: bool = False


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


class OperatorBootstrapBody(BaseModel):
    """One-shot staging bootstrap — reason only; operator id is JWT ``sub`` exclusively."""

    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=3, max_length=500)


def _operator_bootstrap_allowed() -> bool:
    """Staging + explicit flag only. Production and unset env never allow."""
    if claw_environment() != "staging":
        return False
    return os.getenv("CLAW_ALLOW_OPERATOR_BOOTSTRAP", "").strip() == "1"


def _require_admin_secret_for_bootstrap(request: Request) -> None:
    """Second factor — always required for bootstrap (no relaxed-env bypass)."""
    import secrets as _secrets

    secret = os.getenv("CLAW_ADMIN_SECRET", "").strip()
    presented = (request.headers.get("x-claw-admin-secret") or "").strip()
    if not secret:
        raise HTTPException(
            status_code=403,
            detail={"code": "admin_secret_required", "message": "Operator secret not configured."},
        )
    if not presented or not _secrets.compare_digest(secret, presented):
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "Invalid operator secret."},
        )


@router.get("/operators/me")
def operator_session_capability(request: Request) -> Dict[str, Any]:
    """
    Read-only capability probe for Admin Console nav.

    Authenticated principal only (JWT / relaxed test auth). Does **not** require
    the admin secret and does **not** grant mutate permissions — grant/revoke still
    go through ``_privileged`` / ``ops:mutate_support``.
    """
    from backend.security.operator_principal import OPERATOR_ROLES, ROLE_SUPPORT_OPERATOR

    user_id = require_supabase_user_id(request)
    store = get_admin_console_store()
    store.init_schema()
    row = store.get_admin_user(user_id)
    if not row or not int(row.get("is_active") or 0):
        return {"ok": True, "authorized": False, "role": None, "user_id": user_id}
    role = str(row.get("role") or "").strip().lower()
    if role == "operator":
        role = ROLE_SUPPORT_OPERATOR
    if role not in OPERATOR_ROLES:
        return {"ok": True, "authorized": False, "role": None, "user_id": user_id}
    return {
        "ok": True,
        "authorized": True,
        "role": role,
        "user_id": user_id,
    }


@router.post("/operators/bootstrap")
def bootstrap_first_operator(request: Request, body: OperatorBootstrapBody) -> Dict[str, Any]:
    """
    One-shot first ``support_operator`` for empty staging registries.

    Requires: CLAW_ENVIRONMENT=staging, CLAW_ALLOW_OPERATOR_BOOTSTRAP=1,
    valid Supabase Bearer JWT (sub → operator id), x-claw-admin-secret, reason.
    Test-auth cannot satisfy staging. Never accepts a client-supplied target user id.
    """
    if not _operator_bootstrap_allowed():
        raise HTTPException(
            status_code=403,
            detail={
                "code": "operator_bootstrap_disabled",
                "message": "Operator bootstrap is disabled for this environment.",
            },
        )
    _require_admin_secret_for_bootstrap(request)
    # Staging: JWT only — test-auth headers are unavailable when CLAW_ENVIRONMENT=staging.
    user_id = require_supabase_user_id(request)
    reason = require_nonempty_reason(body.reason)
    store = get_admin_console_store()
    result = store.bootstrap_first_support_operator(
        admin_user_id=user_id,
        reason=reason,
        correlation_id=correlation_id_from_request(request),
    )
    if not result.get("ok"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": result.get("code") or "operator_bootstrap_already_done",
                "message": "An active operator already exists; bootstrap is one-shot.",
            },
        )
    return {
        "ok": True,
        "user_id": result["user_id"],
        "role": ROLE_SUPPORT_OPERATOR,
        "audit_id": result["audit_id"],
        "created": bool(result.get("created")),
    }


def _privileged(
    request: Request,
    *,
    permission: str,
    action_type: str,
    target_type: str = "admin_console",
    target_id: str = "global",
    reason: Optional[str] = None,
) -> OperatorPrincipal:
    """Unified gate: principal + permission + nonempty reason + audit (+ secret 2FA)."""
    principal = require_privileged_operator(
        request,
        permission=permission,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
    )
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
    """Mutation detail audit with before/after snapshots (gate audit already recorded)."""
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


def _user_id_from_subject_ref(subject_ref: str, subscription: Optional[Dict[str, Any]] = None) -> Optional[str]:
    if subscription:
        sid = str(subscription.get("user_id") or "").strip()
        if sid:
            return sid
    s = (subject_ref or "").strip()
    if s.startswith("org:user-"):
        return s[len("org:user-") :].strip() or None
    if s.startswith("user-"):
        return s[5:].strip() or None
    return None


def _access_type_from_commercial_state(state: str) -> str:
    s = str(state or "").strip().lower()
    if s == "genesis":
        return "genesis_dog"
    if s == "pro":
        return "paid_pro"
    if s == "pending_genesis":
        return "pending_genesis"
    if s == "guest":
        return "guest"
    return "free"


def _enrich_user_commercial_access(user: Dict[str, Any]) -> Dict[str, Any]:
    """Attach commercial access fields so Admin Users can distinguish Genesis vs Paid Pro."""
    from backend.usage_economics.commercial_entitlement import resolve_commercial_entitlement

    ref = str(user.get("org_id") or user.get("id") or "").strip()
    if not ref:
        user["access_type"] = "free"
        user["commercial_state"] = "none"
        user["commercial_grant_source"] = None
        user["agreement_allowance"] = 0
        user["agreements_used"] = int(user.get("agreement_count") or 0)
        user["agreements_remaining"] = 0
        user["period_ends_at"] = None
        user["can_create_persisted_agreement"] = False
        return user
    decision = resolve_commercial_entitlement(ref)
    state = str(decision.get("state") or "none")
    used = decision.get("agreements_used")
    if used is None:
        used = int(user.get("agreement_count") or 0)
    user["access_type"] = _access_type_from_commercial_state(state)
    user["commercial_state"] = state
    user["commercial_grant_source"] = decision.get("grant_source")
    user["agreement_allowance"] = decision.get("agreement_allowance")
    user["agreements_used"] = int(used or 0)
    user["agreements_remaining"] = decision.get("agreements_remaining")
    user["period_ends_at"] = decision.get("period_ends_at")
    user["can_create_persisted_agreement"] = bool(decision.get("can_create_persisted_agreement"))
    # Keep agreement_count aligned with the commercial meter when available.
    user["agreement_count"] = int(used or 0)
    return user


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
    _privileged(
        request,
        permission=PERM_READ_OPS,
        action_type="admin_overview",
        target_id="overview",
    )
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
    _privileged(
        request,
        permission=PERM_READ_OPS,
        action_type="admin_users",
        target_id="users",
    )
    ustore = get_usage_economics_store()
    ustore.init_schema()
    eco = get_economics_store()
    eco.init_schema()
    admin_store = get_admin_console_store()
    admin_store.init_schema()
    subjects = ustore.admin_aggregate_subjects()[:limit]
    from backend.usage_economics.commercial_entitlement import utc_month_period_bounds

    period_start, _period_end = utc_month_period_bounds()
    subs_by_org: Dict[str, Dict[str, Any]] = {}
    affiliate_display_by_user: Dict[str, str] = {}
    with eco._conn() as con:
        rows = con.execute(
            "SELECT org_id, user_id, plan_code, status, started_at, expires_at FROM subscriptions ORDER BY datetime(created_at) DESC"
        ).fetchall()
        for r in rows:
            d = dict(r)
            oid = str(d.get("org_id") or "")
            if oid and oid not in subs_by_org:
                subs_by_org[oid] = d
        try:
            aff_rows = con.execute(
                "SELECT user_id, display_name FROM genesis_affiliates ORDER BY datetime(created_at) DESC"
            ).fetchall()
            for ar in aff_rows:
                ad = dict(ar)
                uid = str(ad.get("user_id") or "").strip()
                name = str(ad.get("display_name") or "").strip()
                if uid and name and uid not in affiliate_display_by_user:
                    affiliate_display_by_user[uid] = name[:160]
        except Exception:
            # Older DBs may not have genesis_affiliates in this connection.
            pass

    admin_email_by_user: Dict[str, str] = {}
    admin_identity_rows = admin_store.list_admin_user_identity_rows(limit=500)
    for row in admin_identity_rows:
        uid = str(row.get("id") or "").strip()
        email = str(row.get("email") or "").strip()
        if uid and email and "@" in email:
            admin_email_by_user[uid] = email

    # Customer identities persisted at bind/finalize (preferred over operator registry).
    workspace_identity_by_user: Dict[str, Dict[str, Any]] = {}
    workspace_identity_rows = admin_store.list_workspace_user_identities(limit=2000)
    for row in workspace_identity_rows:
        uid = str(row.get("user_id") or "").strip()
        if uid:
            workspace_identity_by_user[uid] = row

    users: List[Dict[str, Any]] = []
    seen_user_ids: set[str] = set()
    for s in subjects:
        ref = str(s.get("subject_ref") or "").strip()
        sub = subs_by_org.get(ref)
        uid = _user_id_from_subject_ref(ref, sub)
        if uid:
            seen_user_ids.add(uid)
        ident = workspace_identity_by_user.get(uid) if uid else None
        ident_email = str((ident or {}).get("email") or "").strip() or None
        if ident_email and "@" not in ident_email:
            ident_email = None
        ident_display = str((ident or {}).get("display_name") or "").strip() or None
        email = (
            ident_email
            or _parse_subject_email(ref)
            or (admin_email_by_user.get(uid) if uid else None)
        )
        display_name = ident_display or (affiliate_display_by_user.get(uid) if uid else None)
        # Align with customer Genesis meter (agreement_owner count this UTC month), not lifetime counters.
        monthly_used = int(ustore.agreements_created_since(ref, period_start))
        users.append(
            {
                "id": ref,
                "org_id": ref,
                "user_id": uid,
                "email": email,
                "display_name": display_name,
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
                "agreement_count": monthly_used,
                "last_error_code": None,
            }
        )

    # Authenticated customers with identity but no usage subject yet.
    for row in workspace_identity_rows:
        uid = str(row.get("user_id") or "").strip()
        if not uid or uid in seen_user_ids:
            continue
        if len(users) >= limit:
            break
        email = str(row.get("email") or "").strip() or None
        if email and "@" not in email:
            email = None
        oid_raw = str(row.get("org_id") or "").strip()
        if oid_raw.startswith("org:"):
            org_ref = oid_raw
        elif oid_raw:
            org_ref = f"org:{oid_raw}"
        else:
            org_ref = f"org:user-{uid}"
        users.append(
            {
                "id": org_ref,
                "org_id": org_ref,
                "user_id": uid,
                "email": email,
                "display_name": str(row.get("display_name") or "").strip()
                or affiliate_display_by_user.get(uid),
                "created_at": str(row.get("created_at") or ""),
                "last_active_at": str(row.get("updated_at") or row.get("created_at") or ""),
                "account_status": "active",
                "plan_type": "free",
                "premium_active": False,
                "entitlement_source": "none",
                "entitlement_started_at": None,
                "entitlement_expires_at": None,
                "affiliate_code_used": None,
                "referred_by_affiliate_id": None,
                "agreement_count": 0,
                "last_error_code": None,
            }
        )
        seen_user_ids.add(uid)

    # Include operator registry identities not already present (safe email/user_id lookup).
    for row in admin_identity_rows:
        uid = str(row.get("id") or "").strip()
        if not uid or uid in seen_user_ids:
            continue
        if len(users) >= limit:
            break
        email = str(row.get("email") or "").strip() or None
        if email and "@" not in email:
            email = None
        users.append(
            {
                "id": f"org:user-{uid}",
                "org_id": f"org:user-{uid}",
                "user_id": uid,
                "email": email,
                "display_name": affiliate_display_by_user.get(uid),
                "created_at": str(row.get("created_at") or ""),
                "last_active_at": str(row.get("last_login_at") or row.get("created_at") or ""),
                "account_status": "active" if int(row.get("is_active") or 0) else "disabled",
                "plan_type": "free",
                "premium_active": False,
                "entitlement_source": "none",
                "entitlement_started_at": None,
                "entitlement_expires_at": None,
                "affiliate_code_used": None,
                "referred_by_affiliate_id": None,
                "agreement_count": 0,
                "last_error_code": None,
            }
        )
        seen_user_ids.add(uid)
    users = [_enrich_user_commercial_access(u) for u in users[:limit]]
    return {"users": users}


@router.post("/users/{subject_ref}/status")
def admin_set_user_status(subject_ref: str, body: UserStatusBody, request: Request) -> Dict[str, Any]:
    principal = _privileged(
        request,
        permission=PERM_MUTATE_ADMIN,
        action_type="set_user_status",
        target_type="user",
        target_id=subject_ref,
        reason=body.reason,
    )
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
        reason=(body.reason or "").strip(),
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
    principal = _privileged(
        request,
        permission=PERM_MUTATE_SUPPORT,
        action_type="refresh_entitlement",
        target_type="user",
        target_id=subject_ref,
        reason=body.reason,
    )
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
        reason=(body.reason or "").strip(),
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


def _user_id_from_admin_path(user_id: str) -> str:
    uid = (user_id or "").strip()
    if uid.startswith("user-"):
        uid = uid[5:].strip()
    if uid.startswith("org:user-"):
        uid = uid[len("org:user-") :].strip()
    if not uid:
        raise HTTPException(status_code=400, detail={"code": "user_id_required"})
    return uid


def _user_action_history_target_ids(uid: str) -> List[str]:
    """Match audit rows written against raw user id or org:user-* subject refs."""
    clean = (uid or "").strip()
    if not clean:
        return []
    return [clean, f"org:user-{clean}", f"user-{clean}"]


def _parse_audit_snapshot(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _summarize_user_action_history_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Safe operator-facing audit row (reason + commercial meter deltas; no agreement bodies)."""
    before = _parse_audit_snapshot(row.get("before_snapshot_json"))
    after = _parse_audit_snapshot(row.get("after_snapshot_json"))
    action = str(row.get("action_type") or "").strip()
    summary: Dict[str, Any] = {
        "id": row.get("id"),
        "action_type": action,
        "target_type": row.get("target_type"),
        "target_id": row.get("target_id"),
        "reason": row.get("reason"),
        "admin_user_id": row.get("admin_user_id"),
        "actor_role": row.get("actor_role"),
        "created_at": row.get("created_at"),
        "correlation_id": row.get("correlation_id"),
    }
    if action == "genesis_usage_reconcile":
        summary["agreements_used_before"] = before.get("agreements_used")
        summary["agreements_used_after"] = after.get("agreements_used")
        refunded = after.get("refunded_agreement_ids")
        if isinstance(refunded, list):
            summary["refunded_count"] = len(refunded)
        summary["dry_run"] = bool(after.get("dry_run") if "dry_run" in after else before.get("dry_run"))
    elif action in ("genesis_entitlement_grant", "genesis_entitlement_revoke"):
        summary["entitlement_before_active"] = (
            before.get("active") if "active" in before else before.get("status")
        )
        summary["entitlement_after_active"] = (
            after.get("active") if "active" in after else after.get("status")
        )
    elif action == "set_user_status":
        summary["disabled_before"] = before.get("abuse_flag")
        summary["disabled_after"] = after.get("abuse_flag")
    return summary


@router.post("/users/{user_id}/genesis-entitlement/grant")
def admin_grant_genesis_entitlement(
    user_id: str, body: GenesisEntitlementGrantBody, request: Request
) -> Dict[str, Any]:
    """Grant Genesis Dog commercial access. Writes only genesis_dog_entitlements (+ audit)."""
    from backend.usage_economics.commercial_entitlement import resolve_commercial_entitlement
    from backend.usage_economics.genesis_dog_entitlement import (
        GRANT_SOURCE_ADMIN,
        get_entitlement,
        grant_entitlement,
    )

    uid = _user_id_from_admin_path(user_id)
    principal = _privileged(
        request,
        permission=PERM_MUTATE_SUPPORT,
        action_type="genesis_entitlement_grant",
        target_type="genesis_dog_entitlement",
        target_id=uid,
        reason=body.reason,
    )
    before = get_entitlement(uid)
    after = grant_entitlement(
        user_id=uid,
        granted_by=principal.user_id,
        grant_source=GRANT_SOURCE_ADMIN,
        expires_at=(body.expires_at or "").strip() or None,
        allowance_override=body.allowance_override,
    )
    audit_id = _audit(
        principal,
        action_type="genesis_entitlement_grant",
        target_type="genesis_dog_entitlement",
        target_id=uid,
        reason=(body.reason or "").strip(),
        before=before,
        after=after,
    )
    decision = resolve_commercial_entitlement(f"org:user-{uid}")
    return {
        "ok": True,
        "user_id": uid,
        "entitlement": after,
        "commercial": decision,
        "audit_id": audit_id,
        "actor": principal.user_id,
        "actor_role": principal.role,
    }


@router.post("/users/{user_id}/genesis-entitlement/revoke")
def admin_revoke_genesis_entitlement(
    user_id: str, body: GenesisEntitlementRevokeBody, request: Request
) -> Dict[str, Any]:
    """Revoke Genesis Dog commercial access. Writes only genesis_dog_entitlements (+ audit)."""
    from backend.usage_economics.commercial_entitlement import resolve_commercial_entitlement
    from backend.usage_economics.genesis_dog_entitlement import get_entitlement, revoke_entitlement

    uid = _user_id_from_admin_path(user_id)
    principal = _privileged(
        request,
        permission=PERM_MUTATE_SUPPORT,
        action_type="genesis_entitlement_revoke",
        target_type="genesis_dog_entitlement",
        target_id=uid,
        reason=body.reason,
    )
    before = get_entitlement(uid)
    after = revoke_entitlement(
        user_id=uid,
        revoked_by=principal.user_id,
        reason=body.reason,
    )
    audit_id = _audit(
        principal,
        action_type="genesis_entitlement_revoke",
        target_type="genesis_dog_entitlement",
        target_id=uid,
        reason=(body.reason or "").strip(),
        before=before,
        after=after,
    )
    decision = resolve_commercial_entitlement(f"org:user-{uid}")
    return {
        "ok": True,
        "user_id": uid,
        "entitlement": after,
        "commercial": decision,
        "audit_id": audit_id,
        "actor": principal.user_id,
        "actor_role": principal.role,
    }


@router.get("/users/{user_id}/genesis-entitlement")
def admin_get_genesis_entitlement(user_id: str, request: Request) -> Dict[str, Any]:
    from backend.usage_economics.commercial_entitlement import resolve_commercial_entitlement
    from backend.usage_economics.genesis_dog_entitlement import get_entitlement

    uid = _user_id_from_admin_path(user_id)
    _privileged(
        request,
        permission=PERM_READ_OPS,
        action_type="genesis_entitlement_get",
        target_type="genesis_dog_entitlement",
        target_id=uid,
        reason="admin_console_read",
    )
    row = get_entitlement(uid)
    decision = resolve_commercial_entitlement(f"org:user-{uid}")
    store = get_admin_console_store()
    related = store.list_admin_action_audit_for_targets(
        target_ids=_user_action_history_target_ids(uid),
        limit=20,
        action_type_prefixes=["genesis_entitlement_", "genesis_usage_"],
    )
    return {
        "ok": True,
        "user_id": uid,
        "entitlement": row,
        "commercial": {
            "state": decision.get("state"),
            "grant_source": decision.get("grant_source"),
            "agreement_allowance": decision.get("agreement_allowance"),
            "agreements_used": decision.get("agreements_used"),
            "agreements_remaining": decision.get("agreements_remaining"),
            "period_ends_at": decision.get("period_ends_at"),
            "can_create_persisted_agreement": decision.get("can_create_persisted_agreement"),
        },
        "audit": [_summarize_user_action_history_row(a) for a in related],
    }


@router.get("/users/{user_id}/action-history")
def admin_user_action_history(
    user_id: str,
    request: Request,
    limit: int = Query(default=40, ge=1, le=100),
) -> Dict[str, Any]:
    """Per-user admin action history (Genesis grant/revoke/reset, account status, entitlement refresh)."""
    uid = _user_id_from_admin_path(user_id)
    _privileged(
        request,
        permission=PERM_READ_OPS,
        action_type="admin_user_action_history",
        target_type="user",
        target_id=uid,
        reason="admin_console_read",
    )
    rows = get_admin_console_store().list_admin_action_audit_for_targets(
        target_ids=_user_action_history_target_ids(uid),
        limit=limit,
        action_types=["set_user_status", "refresh_entitlement"],
        action_type_prefixes=["genesis_entitlement_", "genesis_usage_"],
    )
    return {
        "ok": True,
        "user_id": uid,
        "actions": [_summarize_user_action_history_row(a) for a in rows],
    }


@router.get("/users/{user_id}/genesis-usage")
def admin_get_genesis_usage(user_id: str, request: Request) -> Dict[str, Any]:
    """Trace Genesis monthly meter rows for support (no agreement bodies / tokens)."""
    from backend.services.agreement_draft_store import draft_exists
    from backend.usage_economics.commercial_entitlement import (
        resolve_commercial_entitlement,
        utc_month_period_bounds,
    )

    uid = _user_id_from_admin_path(user_id)
    _privileged(
        request,
        permission=PERM_READ_OPS,
        action_type="genesis_usage_get",
        target_type="genesis_dog_usage",
        target_id=uid,
        reason="admin_console_read",
    )
    subject = f"org:user-{uid}"
    period_start, period_end = utc_month_period_bounds()
    ustore = get_usage_economics_store()
    ustore.init_schema()
    decision = resolve_commercial_entitlement(subject)
    rows = ustore.list_agreement_owner_rows_for_subject(subject, since_iso=period_start, limit=100)
    events = [
        e
        for e in ustore.list_recent_events(limit=300)
        if str(e.get("subject_ref") or "") == subject
        and str(e.get("event_type") or "")
        in ("agreement_created", "keys_consumed", "paywall_triggered")
    ][:50]
    records = []
    for r in rows:
        aid = str(r.get("agreement_id") or "").strip()
        records.append(
            {
                "event_type": "agreement_owner_meter",
                "agreement_id": aid,
                "idempotency_key": r.get("idempotency_key"),
                "created_at": r.get("created_at"),
                "guest_temp": bool(int(r.get("guest_temp") or 0)),
                "internal_keys_draft": int(r.get("internal_keys_draft") or 0),
                "persisted_draft_exists": bool(aid and draft_exists(aid)),
            }
        )
    return {
        "ok": True,
        "user_id": uid,
        "subject_ref": subject,
        "period_start": period_start,
        "period_end": period_end,
        "commercial": {
            "state": decision.get("state"),
            "agreements_used": decision.get("agreements_used"),
            "agreements_remaining": decision.get("agreements_remaining"),
            "agreement_allowance": decision.get("agreement_allowance"),
            "period_ends_at": decision.get("period_ends_at"),
        },
        "meter_records": records,
        "recent_events": [
            {
                "event_type": e.get("event_type"),
                "created_at": e.get("created_at"),
                "payload": (
                    e.get("payload")
                    if isinstance(e.get("payload"), dict)
                    else (
                        json.loads(e["payload_json"])
                        if isinstance(e.get("payload_json"), str) and e.get("payload_json")
                        else None
                    )
                ),
            }
            for e in events
        ],
    }


@router.post("/users/{user_id}/genesis-usage/reconcile")
def admin_reconcile_genesis_usage(
    user_id: str, body: GenesisUsageReconcileBody, request: Request
) -> Dict[str, Any]:
    """
    Reset this user's Genesis monthly meter to 0 (audited support action).

    Refunds agreement_owner rows for the current UTC month and reverses
    subject_counters charges. Requires PERM_MUTATE_SUPPORT + audit reason.
    """
    from backend.usage_economics.commercial_entitlement import (
        resolve_commercial_entitlement,
        utc_month_period_bounds,
    )

    uid = _user_id_from_admin_path(user_id)
    principal = _privileged(
        request,
        permission=PERM_MUTATE_SUPPORT,
        action_type="genesis_usage_reconcile",
        target_type="genesis_dog_usage",
        target_id=uid,
        reason=body.reason,
    )
    subject = f"org:user-{uid}"
    period_start, period_end = utc_month_period_bounds()
    ustore = get_usage_economics_store()
    ustore.init_schema()
    before = resolve_commercial_entitlement(subject)
    rows = ustore.list_agreement_owner_rows_for_subject(subject, since_iso=period_start, limit=500)
    candidate_ids = [
        str(r.get("agreement_id") or "").strip()
        for r in rows
        if str(r.get("agreement_id") or "").strip() and not int(r.get("guest_temp") or 0)
    ]
    refunded: List[str] = []
    if not body.dry_run:
        refunded = ustore.refund_agreement_owners_since(
            subject_ref=subject, period_start_iso=period_start
        )
        ustore.emit_event(
            subject_ref=subject,
            event_type="genesis_usage_reconciled",
            payload={
                "mode": body.mode,
                "period_start": period_start,
                "period_end": period_end,
                "refunded_agreement_ids": refunded,
                "actor": principal.user_id,
                "reason": (body.reason or "").strip(),
            },
        )
    after = resolve_commercial_entitlement(subject)
    audit_id = _audit(
        principal,
        action_type="genesis_usage_reconcile",
        target_type="genesis_dog_usage",
        target_id=uid,
        reason=(body.reason or "").strip(),
        before={
            "agreements_used": before.get("agreements_used"),
            "candidate_ids": candidate_ids,
            "dry_run": bool(body.dry_run),
        },
        after={
            "agreements_used": after.get("agreements_used"),
            "refunded_agreement_ids": refunded if not body.dry_run else candidate_ids,
            "dry_run": bool(body.dry_run),
        },
    )
    return {
        "ok": True,
        "user_id": uid,
        "subject_ref": subject,
        "mode": body.mode,
        "dry_run": bool(body.dry_run),
        "period_start": period_start,
        "period_end": period_end,
        "refunded_agreement_ids": refunded if not body.dry_run else [],
        "candidate_agreement_ids": candidate_ids,
        "commercial_before": {
            "agreements_used": before.get("agreements_used"),
            "agreements_remaining": before.get("agreements_remaining"),
        },
        "commercial_after": {
            "agreements_used": after.get("agreements_used"),
            "agreements_remaining": after.get("agreements_remaining"),
        },
        "audit_id": audit_id,
        "actor": principal.user_id,
        "actor_role": principal.role,
    }


@router.post("/genesis-entitlement/migrate-legacy-affiliates")
def admin_migrate_legacy_genesis_affiliates(
    body: GenesisLegacyMigrationBody, request: Request
) -> Dict[str, Any]:
    """Backfill active genesis_affiliates into genesis_dog_entitlements (legacy_migration)."""
    from backend.usage_economics.genesis_dog_entitlement import backfill_legacy_affiliate_grants

    principal = _privileged(
        request,
        permission=PERM_MUTATE_ADMIN,
        action_type="genesis_entitlement_legacy_migration",
        target_type="genesis_dog_entitlement",
        target_id="legacy_migration",
        reason=body.reason,
    )
    counts = backfill_legacy_affiliate_grants(
        granted_by=principal.user_id,
        dry_run=bool(body.dry_run),
    )
    audit_id = None
    if not body.dry_run:
        audit_id = _audit(
            principal,
            action_type="genesis_entitlement_legacy_migration",
            target_type="genesis_dog_entitlement",
            target_id="legacy_migration",
            reason=(body.reason or "").strip(),
            after=counts,
        )
    return {
        "ok": True,
        "dry_run": bool(body.dry_run),
        "counts": counts,
        "audit_id": audit_id,
        "actor": principal.user_id,
        "actor_role": principal.role,
    }


@router.get("/agreements")
def admin_agreements(request: Request, limit: int = Query(default=200, ge=1, le=500)) -> Dict[str, Any]:
    _privileged(
        request,
        permission=PERM_READ_OPS,
        action_type="admin_agreements",
        target_id="agreements",
    )
    return {"agreements": _load_agreements_metadata(limit=limit)}


@router.post("/agreements/{agreement_id}/flag")
def admin_flag_agreement(agreement_id: str, body: AgreementFlagBody, request: Request) -> Dict[str, Any]:
    principal = _privileged(
        request,
        permission=PERM_MUTATE_SUPPORT,
        action_type="flag_agreement",
        target_type="agreement",
        target_id=agreement_id,
        reason=body.reason,
    )
    store = get_admin_console_store()
    before = store.get_agreement_flags_map([agreement_id]).get(agreement_id) or {}
    after = store.set_agreement_flag(
        agreement_id=agreement_id,
        flagged=body.flagged,
        reason=(body.reason or "").strip(),
        admin_user_id=principal.user_id,
    )
    audit_id = _audit(
        principal,
        action_type="flag_agreement",
        target_type="agreement",
        target_id=agreement_id,
        reason=(body.reason or "").strip(),
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
    _privileged(
        request,
        permission=PERM_READ_OPS,
        action_type="admin_deliveries",
        target_id="deliveries",
    )
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
    principal = _privileged(
        request,
        permission=PERM_MUTATE_SUPPORT,
        action_type="resend_delivery",
        target_type="delivery",
        target_id=f"{org_id}:{delivery_id}",
        reason=body.reason,
    )
    ok = retry_delivery(org_id, delivery_id)
    if not ok:
        raise HTTPException(status_code=404, detail="delivery_not_found")
    audit_id = _audit(
        principal,
        action_type="resend_delivery",
        target_type="delivery",
        target_id=f"{org_id}:{delivery_id}",
        reason=(body.reason or "").strip(),
        after={"queued": True},
    )
    return {"ok": True, "queued": True, "audit_id": audit_id, "actor": principal.user_id}


@router.get("/affiliates")
def admin_affiliates(request: Request, limit: int = Query(default=200, ge=1, le=500)) -> Dict[str, Any]:
    _privileged(
        request,
        permission=PERM_READ_OPS,
        action_type="admin_affiliates",
        target_id="affiliates",
    )
    eco = get_economics_store()
    eco.init_schema()
    return {"affiliates": eco.list_admin_affiliate_summaries(limit=limit)}


@router.get("/affiliate-payout-batches")
def admin_affiliate_payout_batches(
    request: Request, limit: int = Query(default=100, ge=1, le=500)
) -> Dict[str, Any]:
    _privileged(
        request,
        permission=PERM_READ_OPS,
        action_type="admin_affiliate_payout_batches",
        target_id="affiliate_payout_batches",
    )
    return {"batches": list_payout_batch_summaries(limit=limit)}


@router.post("/affiliates/{affiliate_id}/status")
def admin_set_affiliate_status(
    affiliate_id: str, body: AffiliateStatusBody, request: Request
) -> Dict[str, Any]:
    principal = _privileged(
        request,
        permission=PERM_MUTATE_FINANCIAL,
        action_type="set_affiliate_status",
        target_type="affiliate",
        target_id=affiliate_id,
        reason=body.reason,
    )
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
        reason=(body.reason or "").strip(),
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
    principal = _privileged(
        request,
        permission=PERM_MUTATE_FINANCIAL,
        action_type="affiliate_payout_batch_action",
        target_type="affiliate_payout_batch",
        target_id=batch_id,
        reason=body.reason,
    )
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
        reason=(body.reason or "").strip(),
        after=out,
    )
    out = {**out, "audit_id": audit_id, "actor": principal.user_id, "actor_role": principal.role}
    return out


@router.get("/audit")
def admin_audit(request: Request, limit: int = Query(default=200, ge=1, le=1000)) -> Dict[str, Any]:
    _privileged(
        request,
        permission=PERM_READ_OPS,
        action_type="admin_audit",
        target_id="audit",
    )
    rows = get_admin_console_store().list_admin_action_audit(limit=limit)
    return {"actions": rows}
