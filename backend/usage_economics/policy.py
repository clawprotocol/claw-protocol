"""Free / paid enforcement and internal metering — UI must never mention Keys."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import Request

from backend.billing import subscriptions as subs
from backend.economics.store import EconomicsStore, get_economics_store
from backend.usage_economics import constants as uc
from backend.usage_economics.store import UsageEconomicsStore, get_usage_economics_store
from backend.utils.enforce import resolve_subject_from_request

log = logging.getLogger(__name__)


def _notify_paywall_integration_webhook(subject_ref: str, payload: Dict[str, Any]) -> None:
    try:
        from backend.integrations.hooks_emit import claw_emit_integration_event_from_subject
        from backend.utils.enforce import org_id_from_subject

        oid = (org_id_from_subject(subject_ref) or "").strip()
        if not oid:
            return
        claw_emit_integration_event_from_subject(
            subject_ref, "paywall.triggered", "workspace", oid, payload
        )
    except Exception:
        log.exception("integration paywall webhook failed")


def usage_economics_enabled() -> bool:
    return os.getenv("CLAW_USAGE_ECONOMICS_ENABLED", "1").strip().lower() not in ("0", "false", "no")


def _relaxed_draft_limits_in_dev() -> bool:
    """
    Local/dev/test: do not enforce the free-tier active-draft cap unless explicitly strict.

    Production-like CLAW_ENVIRONMENT still enforces limits. Abuse-flag checks always apply.
    Opt-in strictness: CLAW_USAGE_ECONOMICS_STRICT_IN_DEV=1.
    """
    env = os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()
    if env not in ("local", "dev", "test"):
        return False
    strict = os.getenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "0").strip().lower()
    return strict not in ("1", "true", "yes")


_PRO_ENTITLED_PLAN_CODES = frozenset({"pro", "enterprise", "team", "institutional", "business"})

SUBSCRIPTION_REQUIRED_DETAIL: Dict[str, Any] = {
    "code": "subscription_required",
    "message": "This workspace needs an active Pro subscription.",
}


def _subscription_row_is_pro_entitled(row: Optional[Dict[str, Any]]) -> bool:
    from backend.billing.subscription_authority import is_subscription_entitled

    if not is_subscription_entitled(row):
        return False
    code = str(row.get("plan_code") or "").strip().lower()
    if not code or code in ("free", "trial", "starter", "standard"):
        return False
    return code in _PRO_ENTITLED_PLAN_CODES


def subject_has_paid_plan(subject_ref: str, economics: Optional[EconomicsStore] = None) -> bool:
    from backend.billing.subscription_authority import is_subscription_entitled
    from backend.billing.workspace_billing_migration import migrate_entitled_subscription_to_org
    from backend.utils.enforce import org_id_from_subject

    oid = org_id_from_subject(subject_ref)
    if not oid:
        return False
    eco = economics or get_economics_store()
    eco.init_schema()
    row = subs.get_subscription_for_org(eco, oid)
    if is_subscription_entitled(row):
        return True
    if oid.startswith("user-"):
        uid = oid[5:].strip()
        if uid:
            by_user = eco.get_subscription_by_user_id(uid)
            if is_subscription_entitled(by_user):
                sub_org = str(by_user.get("org_id") or "").strip()
                if sub_org and sub_org != oid and sub_uid_matches(by_user, uid):
                    try:
                        migrate_entitled_subscription_to_org(
                            eco,
                            from_org_id=sub_org,
                            to_org_id=oid,
                            user_id=uid,
                        )
                    except Exception:
                        log.exception("lazy workspace billing migration failed org=%s user=%s", oid, uid)
                return True
    return False


def sub_uid_matches(row: Optional[Dict[str, Any]], user_id: str) -> bool:
    uid = (user_id or "").strip()
    if not uid:
        return False
    sub_uid = str((row or {}).get("user_id") or "").strip()
    if not sub_uid:
        return False
    return sub_uid == uid


def subject_has_pro_entitlement(subject_ref: str, economics: Optional[EconomicsStore] = None) -> bool:
    from backend.billing.workspace_billing_migration import migrate_entitled_subscription_to_org
    from backend.utils.enforce import org_id_from_subject

    oid = org_id_from_subject(subject_ref)
    if not oid:
        return False
    eco = economics or get_economics_store()
    eco.init_schema()
    row = subs.get_subscription_for_org(eco, oid)
    if _subscription_row_is_pro_entitled(row):
        return True
    if oid.startswith("user-"):
        uid = oid[5:].strip()
        if uid:
            by_user = eco.get_subscription_by_user_id(uid)
            if _subscription_row_is_pro_entitled(by_user) and sub_uid_matches(by_user, uid):
                sub_org = str(by_user.get("org_id") or "").strip()
                if sub_org and sub_org != oid:
                    try:
                        migrate_entitled_subscription_to_org(
                            eco,
                            from_org_id=sub_org,
                            to_org_id=oid,
                            user_id=uid,
                        )
                    except Exception:
                        log.exception("lazy pro workspace billing migration failed org=%s user=%s", oid, uid)
                return True
    return False


def assert_pro_entitled_for_request(
    request: Request,
    *,
    agreement_id: Optional[str] = None,
) -> str:
    """
    Canonical Paid Pro gate — server identity + authoritative subscription row only.
  """
    from fastapi import HTTPException
    from backend.security.workspace_identity import assert_agreement_accessible

    maybe_repair_workspace_entitlement_from_request(request)

    if agreement_id:
        subject, _org_id = assert_agreement_accessible(request, agreement_id.strip())
    else:
        from backend.security.request_identity import resolve_workspace_identity

        subject = resolve_workspace_identity(request).subject_ref

    if not subject_has_pro_entitlement(subject):
        raise HTTPException(status_code=403, detail=dict(SUBSCRIPTION_REQUIRED_DETAIL))
    return subject


def maybe_repair_workspace_entitlement_from_request(request: Request) -> bool:
    """
    Repair orphaned subscriptions for bound ``user-{id}`` workspaces using server-derived
    source org candidates only (never client repair headers).
    """
    from backend.billing.workspace_billing_migration import (
        derive_server_migration_source_orgs,
        repair_bound_user_workspace_entitlement,
    )
    from backend.utils.enforce import org_id_from_subject, resolve_subject_from_request

    subject = resolve_subject_from_request(request)
    oid = org_id_from_subject(subject)
    if not oid or not oid.startswith("user-"):
        return False
    uid = oid[5:].strip()
    if not uid:
        return False
    eco = get_economics_store()
    ustore = get_usage_economics_store()
    candidates = derive_server_migration_source_orgs(
        bound_org_id=oid,
        user_id=uid,
        usage_store=ustore,
    )
    if not candidates:
        return False
    return repair_bound_user_workspace_entitlement(
        eco,
        user_id=uid,
        bound_org_id=oid,
        candidate_source_org_ids=candidates,
        usage_store=ustore,
    )


def _maybe_flag_abuse(*, subject_ref: str, ip: str, store: UsageEconomicsStore) -> None:
    try:
        n = store.record_ip_subject(ip=ip, subject_ref=subject_ref)
        if n > uc.MAX_DISTINCT_SUBJECTS_PER_IP_PER_DAY:
            store.set_abuse_flag(subject_ref, 1)
            store.emit_event(
                subject_ref=subject_ref,
                event_type="user_flagged",
                payload={"reason": "many_subjects_per_ip", "ip": ip, "distinct_subjects": n},
            )
    except Exception:
        log.exception("usage_economics abuse heuristic failed")


REVIEW_FIRST_PERSIST_REQUEST_HEADER = "X-Claw-Review-First-Persist"
PAID_PRO_REVIEW_FIRST_MIN_PURPOSE_LEN = 500


def review_first_paid_pro_persist_bypass(*, request: Request, purpose: str) -> bool:
    """
    Paid Pro review-first handoff persists a long frozen corpus as a new draft row.
    Frontend QA bypass does not register backend billing; allow this narrow path when
    the client signals review-first persist with substantial Pro corpus text.
    """
    hdr = (request.headers.get(REVIEW_FIRST_PERSIST_REQUEST_HEADER) or "").strip().lower()
    if hdr not in ("1", "true", "yes"):
        return False
    return len((purpose or "").strip()) >= PAID_PRO_REVIEW_FIRST_MIN_PURPOSE_LEN


def assert_can_create_draft(*, subject_ref: str, request_ip: str) -> None:
    """
    Raises HTTPException 403 with detail dict when blocked.
    """
    from fastapi import HTTPException

    if not usage_economics_enabled():
        return

    store = get_usage_economics_store()
    store.init_schema()

    row = store.get_subject_row(subject_ref)
    if row and int(row.get("abuse_flag") or 0):
        store.emit_event(
            subject_ref=subject_ref,
            event_type="paywall_triggered",
            payload={"surface": "draft_create", "reason": "abuse_flag"},
        )
        _notify_paywall_integration_webhook(subject_ref, {"surface": "draft_create", "reason": "abuse_flag"})
        raise HTTPException(
            status_code=403,
            detail={
                "code": "usage_restricted",
                "message": "This workspace needs verification or an upgrade to create new drafts.",
                "paywall": True,
            },
        )

    paid = subject_has_paid_plan(subject_ref)
    if not paid:
        incomplete = store.count_incomplete_agreements(subject_ref)
        if incomplete >= uc.FREE_MAX_ACTIVE_DRAFTS and not _relaxed_draft_limits_in_dev():
            store.emit_event(
                subject_ref=subject_ref,
                event_type="paywall_triggered",
                payload={"surface": "draft_create", "reason": "draft_limit"},
            )
            _notify_paywall_integration_webhook(subject_ref, {"surface": "draft_create", "reason": "draft_limit"})
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "draft_limit_reached",
                    "message": "Free workspaces can have up to 2 active drafts. Finish or upgrade to add another.",
                    "paywall": True,
                    "drafts_remaining": 0,
                },
            )

    _maybe_flag_abuse(subject_ref=subject_ref, ip=request_ip, store=store)


def assert_can_complete_agreement(*, agreement_id: str) -> Optional[str]:
    """
    Call before recording final signature on a newly fully-executed agreement.
    Returns subject_ref when the agreement is registered for economics; None for legacy drafts (no enforcement).
    """
    from fastapi import HTTPException

    if not usage_economics_enabled():
        return None

    store = get_usage_economics_store()
    store.init_schema()
    subject_ref = store.owner_subject_for_agreement(agreement_id)
    if not subject_ref:
        return None

    row = store.get_subject_row(subject_ref)
    if row and int(row.get("abuse_flag") or 0):
        store.emit_event(
            subject_ref=subject_ref,
            event_type="paywall_triggered",
            payload={"surface": "finalize", "reason": "abuse_flag"},
        )
        _notify_paywall_integration_webhook(
            subject_ref, {"surface": "finalize", "reason": "abuse_flag", "agreement_id": agreement_id}
        )
        raise HTTPException(
            status_code=403,
            detail={
                "code": "usage_restricted",
                "message": "This workspace needs verification or an upgrade to finalize agreements.",
                "paywall": True,
            },
        )

    paid = subject_has_paid_plan(subject_ref)
    if paid:
        return subject_ref

    completed = store.count_completed_agreements(subject_ref)
    if completed >= uc.FREE_MAX_COMPLETED_AGREEMENTS:
        store.emit_event(
            subject_ref=subject_ref,
            event_type="paywall_triggered",
            payload={"surface": "finalize", "reason": "completed_limit", "agreement_id": agreement_id},
        )
        _notify_paywall_integration_webhook(
            subject_ref,
            {"surface": "finalize", "reason": "completed_limit", "agreement_id": agreement_id},
        )
        raise HTTPException(
            status_code=403,
            detail={
                "code": "completed_agreement_limit",
                "message": "Free workspaces can complete one agreement. Upgrade to finalize more.",
                "paywall": True,
                "agreements_remaining": 0,
            },
        )
    return subject_ref


def record_draft_created(*, agreement_id: str, subject_ref: str, request_ip: str) -> None:
    if not usage_economics_enabled():
        return
    store = get_usage_economics_store()
    store.init_schema()
    store.insert_agreement_owner(
        agreement_id=agreement_id,
        subject_ref=subject_ref,
        internal_keys_draft=uc.KEY_COST_AGREEMENT_DRAFT,
    )
    store.emit_event(
        subject_ref=subject_ref,
        event_type="agreement_created",
        payload={"agreement_id": agreement_id},
    )
    store.emit_event(
        subject_ref=subject_ref,
        event_type="keys_consumed",
        payload={"agreement_id": agreement_id, "internal_keys": uc.KEY_COST_AGREEMENT_DRAFT, "phase": "draft"},
    )
    if not subject_has_paid_plan(subject_ref):
        store.append_ip_draft_create_event(request_ip)
        burst_n = store.count_recent_draft_creates_from_ip(request_ip, uc.IP_AGREEMENT_BURST_WINDOW_SECONDS)
        if burst_n > uc.IP_AGREEMENT_BURST_MAX_CREATES:
            store.set_soft_throttle(subject_ref, 1)
            store.emit_event(
                subject_ref=subject_ref,
                event_type="user_flagged",
                payload={
                    "reason": "rapid_drafts_from_ip",
                    "ip": request_ip,
                    "window_sec": uc.IP_AGREEMENT_BURST_WINDOW_SECONDS,
                    "burst_count": burst_n,
                },
            )
    _paid_soft_throttle_maybe(subject_ref)


def record_agreement_finalized(*, agreement_id: str, subject_ref: Optional[str] = None) -> None:
    if not usage_economics_enabled():
        return
    store = get_usage_economics_store()
    store.init_schema()
    sub = subject_ref or store.owner_subject_for_agreement(agreement_id)
    if not sub:
        return
    ok = store.mark_agreement_completed(
        agreement_id=agreement_id,
        subject_ref=sub,
        internal_keys_finalize=uc.KEY_COST_AGREEMENT_FINALIZATION,
    )
    if not ok:
        return
    store.emit_event(
        subject_ref=sub,
        event_type="agreement_finalized",
        payload={"agreement_id": agreement_id},
    )
    store.emit_event(
        subject_ref=sub,
        event_type="keys_consumed",
        payload={
            "agreement_id": agreement_id,
            "internal_keys": uc.KEY_COST_AGREEMENT_FINALIZATION,
            "phase": "finalize",
        },
    )
    _paid_soft_throttle_maybe(subject_ref)


def _paid_soft_throttle_maybe(subject_ref: str) -> None:
    if not subject_has_paid_plan(subject_ref):
        return
    store = get_usage_economics_store()
    monthly = store.agreements_created_this_utc_month(subject_ref)
    if monthly > uc.PAID_SOFT_MONTHLY_AGREEMENTS_CAP:
        store.set_soft_throttle(subject_ref, 1)
        store.emit_event(
            subject_ref=subject_ref,
            event_type="user_flagged",
            payload={"reason": "soft_monthly_agreement_cap", "monthly_created": monthly},
        )


def record_ai_call(*, subject_ref: str, request_ip: str) -> None:
    """Hook for LLM routes — applies light anomaly logging (extend with real throttling)."""
    if not usage_economics_enabled():
        return
    store = get_usage_economics_store()
    store.init_schema()
    store.incr_ai_calls(subject_ref, 1)
    row = store.get_subject_row(subject_ref)
    n = int((row or {}).get("ai_calls_count") or 0)
    if n > 5000:
        store.emit_event(
            subject_ref=subject_ref,
            event_type="user_flagged",
            payload={"reason": "high_ai_volume", "ai_calls_count": n, "ip": request_ip},
        )


def usage_summary_for_subject(subject_ref: str) -> Dict[str, Any]:
    """User-safe fields only — no internal Keys."""
    store = get_usage_economics_store()
    store.init_schema()
    paid = subject_has_paid_plan(subject_ref)
    incomplete = store.count_incomplete_agreements(subject_ref)
    completed = store.count_completed_agreements(subject_ref)
    row = store.get_subject_row(subject_ref) or {}
    abuse = bool(int(row.get("abuse_flag") or 0))
    throttle = bool(int(row.get("soft_throttle_flag") or 0))
    created_total = int(row.get("agreements_created") or 0)

    from backend.agreement_memory.access import agreement_memory_tier_for_subject

    mem_tier = agreement_memory_tier_for_subject(subject_ref)
    agreement_memory_block = {
        "tier": mem_tier,
        "semantic_search": mem_tier != "none",
        "relationship_view": mem_tier == "full",
    }

    if paid:
        return {
            "tier": "paid",
            "agreements_created": created_total,
            "agreements_completed": completed,
            "drafts_active": incomplete,
            "agreements_remaining": None,
            "drafts_remaining": None,
            "watermark_required": False,
            "storage_persistent": True,
            "paywall_required": abuse,
            "soft_throttle": throttle,
            "draft_ttl_hours": None,
            "temporary_storage_note": None,
            "agreement_memory": agreement_memory_block,
        }

    drafts_remaining = max(0, uc.FREE_MAX_ACTIVE_DRAFTS - incomplete)
    agreements_remaining = max(0, uc.FREE_MAX_COMPLETED_AGREEMENTS - completed)

    ttl_h = max(1, int(uc.FREE_DRAFT_TTL_SECONDS // 3600))
    return {
        "tier": "free",
        "agreements_created": created_total,
        "agreements_completed": completed,
        "drafts_active": incomplete,
        "agreements_remaining": agreements_remaining,
        "drafts_remaining": drafts_remaining,
        "watermark_required": True,
        "storage_persistent": False,
        "paywall_required": abuse or agreements_remaining == 0,
        "soft_throttle": throttle,
        "draft_ttl_hours": ttl_h,
        "temporary_storage_note": f"Drafts expire after {ttl_h} hours unless you upgrade.",
        "agreement_memory": agreement_memory_block,
    }


def org_header_required() -> bool:
    return os.getenv("CLAW_REQUIRE_ORG_ID_HEADER", "1").strip().lower() not in ("0", "false", "no")


def _raw_org_id_from_request(request: Request) -> str:
    from fastapi import HTTPException

    if not org_header_required():
        return (request.headers.get("x-claw-org-id") or "").strip()
    oid = (request.headers.get("x-claw-org-id") or "").strip()
    if not oid:
        try:
            store = get_usage_economics_store()
            store.init_schema()
            store.emit_event(
                subject_ref=None,
                event_type="org_header_missing",
                payload={"path": getattr(getattr(request, "url", None), "path", "") or ""},
            )
        except Exception:
            log.exception("emit org_header_missing failed")
        raise HTTPException(
            status_code=401,
            detail={
                "code": "org_header_required",
                "message": "X-Claw-Org-Id header is required for this workspace.",
            },
        )
    return oid


def require_claw_org_id_header(request: Request) -> str:
    from backend.security.workspace_identity import require_verified_org_id

    return require_verified_org_id(request)


def assert_registered_owner_matches(request: Request, agreement_id: str) -> str:
    from fastapi import HTTPException

    from backend.security.request_identity import resolve_verified_subject_from_request

    if not usage_economics_enabled():
        return resolve_subject_from_request(request)
    subj = resolve_verified_subject_from_request(request)
    store = get_usage_economics_store()
    store.init_schema()
    owner = store.owner_subject_for_agreement(agreement_id)
    if not owner:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "ownership_not_registered",
                "message": "Agreement ownership is not registered.",
            },
        )
    if subj != owner:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "workspace_mismatch",
                "message": "This agreement belongs to a different workspace.",
            },
        )
    return subj


def _parse_utc_iso_z(value: str) -> datetime:
    s = (value or "").strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def economics_overlay_for_agreement(agreement_id: str) -> Dict[str, Any]:
    if not usage_economics_enabled():
        return {
            "watermark_required": False,
            "free_draft_expires_at": None,
            "free_draft_expired": False,
            "tier": "unknown",
        }
    store = get_usage_economics_store()
    store.init_schema()
    row = store.get_agreement_owner_row(agreement_id)
    if not row:
        return {
            "watermark_required": False,
            "free_draft_expires_at": None,
            "free_draft_expired": False,
            "tier": "unknown",
        }
    subj = str(row.get("subject_ref") or "")
    paid = subject_has_paid_plan(subj)
    tier: str = "paid" if paid else "free"
    watermark = not paid
    expires_at: Optional[str] = None
    expired = False
    if not paid and not row.get("completed_at"):
        try:
            created = _parse_utc_iso_z(str(row.get("created_at") or ""))
            exp = created + timedelta(seconds=uc.FREE_DRAFT_TTL_SECONDS)
            expires_at = exp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            expired = datetime.now(timezone.utc) > exp
        except Exception:
            log.exception("economics_overlay parse created_at failed for %s", agreement_id)
    return {
        "watermark_required": watermark,
        "free_draft_expires_at": expires_at,
        "free_draft_expired": expired,
        "tier": tier,
    }


def assert_free_incomplete_draft_not_expired(agreement_id: str, *, surface: str) -> None:
    from fastapi import HTTPException

    overlay = economics_overlay_for_agreement(agreement_id)
    if not overlay.get("free_draft_expired"):
        return
    store = get_usage_economics_store()
    store.init_schema()
    subj = store.owner_subject_for_agreement(agreement_id)
    try:
        store.emit_event(
            subject_ref=subj,
            event_type="draft_expired",
            payload={"agreement_id": agreement_id, "surface": surface},
        )
    except Exception:
        log.exception("emit draft_expired failed")
    try:
        if subj:
            from backend.integrations.hooks_emit import claw_emit_integration_event_from_subject

            claw_emit_integration_event_from_subject(
                subj,
                "agreement.expired",
                "agreement",
                agreement_id,
                {"surface": surface, "reason": "free_draft_expired"},
            )
    except Exception:
        log.exception("agreement.expired webhook failed")
    raise HTTPException(
        status_code=403,
        detail={
            "code": "draft_expired",
            "message": "This draft has expired on the free plan. Upgrade to restore access and finalize agreements.",
            "paywall": True,
        },
    )


def workspace_lists_agreement_for_subject(agreement_id: str, subject_ref: str) -> bool:
    if not usage_economics_enabled():
        return True
    store = get_usage_economics_store()
    store.init_schema()
    owner = store.owner_subject_for_agreement(agreement_id)
    if owner is None:
        return False
    return owner == subject_ref
