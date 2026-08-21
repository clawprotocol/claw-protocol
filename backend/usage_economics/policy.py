"""Free / paid enforcement and internal metering — UI must never mention Keys."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import Request

from backend.billing import subscriptions as subs
from backend.config.deployment_runtime import claw_environment
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
    env = claw_environment()
    if env not in ("local", "dev", "test"):
        return False
    strict = os.getenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "0").strip().lower()
    return strict not in ("1", "true", "yes")


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
                if sub_org and sub_org != oid:
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


def maybe_repair_workspace_entitlement_from_request(request: Request) -> bool:
    """
    Repair orphaned subscriptions for bound ``user-{id}`` workspaces when the client
    supplies explicit repair org candidate(s). Returns True when a migration occurred.
    """
    from backend.billing.workspace_billing_migration import (
        entitlement_repair_candidates_from_header,
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
    candidates = entitlement_repair_candidates_from_header(request)
    client_signal = bool(candidates)
    if not candidates:
        candidates = ["local-org"]
    eco = get_economics_store()
    ustore = get_usage_economics_store()
    return repair_bound_user_workspace_entitlement(
        eco,
        user_id=uid,
        bound_org_id=oid,
        candidate_source_org_ids=candidates,
        usage_store=ustore,
        require_client_repair_signal=client_signal,
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


def assert_can_create_draft(
    *, subject_ref: str, request_ip: str, request: "Request | None" = None
) -> None:
    """
    Raises HTTPException 403 with detail dict when blocked.

    Authority: ``resolve_commercial_entitlement`` (guest / pro / none).
    Guest may create one temporary draft; persisted creates require Pro.
    Genesis affiliate status never grants create.

    Demo checkout sessions (simulated POS) are allowed through even when
    they've already used their guest draft allowance. This enables the
    post-payment flow where the demo user's Pro agreement is persisted.
    """
    from fastapi import HTTPException

    from backend.usage_economics.commercial_entitlement import (
        STATE_GUEST,
        STATE_PRO,
        resolve_commercial_entitlement,
    )

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

    decision = resolve_commercial_entitlement(subject_ref)
    state = str(decision.get("state") or "")

    if state == STATE_GUEST:
        # Demo checkout sessions (simulated POS) are allowed to create additional
        # drafts even when they've exhausted their guest draft allowance. This
        # enables the post-payment flow where the demo user saves their Pro agreement.
        if not decision.get("can_save_guest_draft"):
            if request is not None:
                from backend.security.commercial_auth import _is_demo_checkout_session

                if _is_demo_checkout_session(request):
                    _maybe_flag_abuse(subject_ref=subject_ref, ip=request_ip, store=store)
                    return

            store.emit_event(
                subject_ref=subject_ref,
                event_type="paywall_triggered",
                payload={"surface": "draft_create", "reason": uc.GUEST_DRAFT_LIMIT},
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "code": uc.GUEST_DRAFT_LIMIT,
                    "message": (
                        "You've used your guest draft. Choose LawDog Pro "
                        "to save agreements, or start a new guest draft after clearing the current one."
                    ),
                    "paywall": True,
                    "commercial": decision,
                },
            )
        _maybe_flag_abuse(subject_ref=subject_ref, ip=request_ip, store=store)
        return

    if state == STATE_PRO:
        if not decision.get("can_create_persisted_agreement"):
            pa = decision.get("pro_allowance") or {}
            store.emit_event(
                subject_ref=subject_ref,
                event_type="paywall_triggered",
                payload={
                    "surface": "draft_create",
                    "reason": uc.PRO_BILLING_PERIOD_ALLOWANCE_EXHAUSTED,
                    "limit": pa.get("limit"),
                    "used": pa.get("used"),
                },
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "code": uc.PRO_BILLING_PERIOD_ALLOWANCE_EXHAUSTED,
                    "message": (
                        "You've used this billing period's Pro finalized-agreement allowance "
                        "(10 successfully finalized premium agreements). "
                        "Your allowance renews at the end of the current Stripe period."
                    ),
                    "paywall": True,
                    "commercial": decision,
                },
            )
        _maybe_flag_abuse(subject_ref=subject_ref, ip=request_ip, store=store)
        return

    # Authenticated without Pro — Genesis affiliate is not a create tier.
    store.emit_event(
        subject_ref=subject_ref,
        event_type="paywall_triggered",
        payload={"surface": "draft_create", "reason": uc.ENTITLEMENT_REQUIRED},
    )
    _notify_paywall_integration_webhook(
        subject_ref, {"surface": "draft_create", "reason": uc.ENTITLEMENT_REQUIRED}
    )
    raise HTTPException(
        status_code=403,
        detail={
            "code": uc.ENTITLEMENT_REQUIRED,
            "message": (
                "Choose LawDog Pro to save agreements, invite review, "
                "prepare signatures, and keep a proof record."
            ),
            "paywall": True,
            "commercial": decision,
        },
    )


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

    from backend.usage_economics.commercial_entitlement import (
        STATE_PRO,
        resolve_commercial_entitlement,
        subject_is_guest,
    )

    if subject_is_guest(subject_ref):
        store.emit_event(
            subject_ref=subject_ref,
            event_type="paywall_triggered",
            payload={"surface": "finalize", "reason": uc.GUEST_WORKFLOW_DENIED, "agreement_id": agreement_id},
        )
        raise HTTPException(
            status_code=403,
            detail={
                "code": uc.GUEST_WORKFLOW_DENIED,
                "message": (
                    "Guest drafts cannot be signed. Choose LawDog Pro "
                    "to prepare signatures and keep a proof record."
                ),
                "paywall": True,
            },
        )

    decision = resolve_commercial_entitlement(subject_ref)
    state = str(decision.get("state") or "")
    # Pro keeps finalize rights for agreements already created.
    if state == STATE_PRO:
        return subject_ref

    store.emit_event(
        subject_ref=subject_ref,
        event_type="paywall_triggered",
        payload={"surface": "finalize", "reason": uc.ENTITLEMENT_REQUIRED, "agreement_id": agreement_id},
    )
    _notify_paywall_integration_webhook(
        subject_ref,
        {"surface": "finalize", "reason": uc.ENTITLEMENT_REQUIRED, "agreement_id": agreement_id},
    )
    raise HTTPException(
        status_code=403,
        detail={
            "code": uc.ENTITLEMENT_REQUIRED,
            "message": "Choose LawDog Pro to finalize agreements.",
            "paywall": True,
            "commercial": decision,
        },
    )


def record_draft_created(
    *,
    agreement_id: str,
    subject_ref: str,
    request_ip: str,
    idempotency_key: Optional[str] = None,
) -> str:
    """
    Register agreement ownership (and optionally meter draft keys) after a successful persist.

    Ownership is stamped whenever commercial mode is enforced *or* usage economics
    metering is enabled — never skip the ownership row because metering is off.
    Key/IP metering events remain economics-gated.

    Idempotent on agreement_id and optional idempotency_key. Genesis monthly create
    caps are retired — only guest temp vs Pro persist paths remain.

    Returns ``inserted`` | ``duplicate`` | ``idempotent_hit`` | ``skipped``.
    """
    from fastapi import HTTPException

    from backend.security.commercial_auth import commercial_mode_enforced
    from backend.usage_economics.commercial_entitlement import (
        STATE_GUEST,
        STATE_PRO,
        resolve_commercial_entitlement,
    )

    economics = usage_economics_enabled()
    commercial = commercial_mode_enforced()
    if not economics and not commercial:
        return "skipped"
    store = get_usage_economics_store()
    store.init_schema()

    monthly_cap: Optional[int] = None
    period_start = ""
    guest_temp = False
    cap_code = uc.ENTITLEMENT_REQUIRED
    cap_message = "Choose LawDog Pro to create persisted agreements."
    if economics:
        decision = resolve_commercial_entitlement(subject_ref)
        state = str(decision.get("state") or "")
        if state == STATE_GUEST:
            guest_temp = True
            monthly_cap = None
        elif state == STATE_PRO:
            # Pro 25 meters finalizations, not creates. Still deny new persisted creates
            # when finalize quota is exhausted so workflows cannot outrun the period cap.
            pa = decision.get("pro_allowance") or {}
            remaining = int(pa.get("remaining") if pa.get("remaining") is not None else 0)
            monthly_cap = None
            period_start = ""
            if remaining <= 0:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": uc.PRO_BILLING_PERIOD_ALLOWANCE_EXHAUSTED,
                        "message": (
                            "You've used this billing period's Pro finalized-agreement allowance "
                            "(10 successfully finalized premium agreements). "
                            "Your allowance renews at the end of the current Stripe period."
                        ),
                        "paywall": True,
                    },
                )
        else:
            # Authenticated none — fail closed (should already be blocked by assert_can_create_draft).
            raise HTTPException(
                status_code=403,
                detail={
                    "code": uc.ENTITLEMENT_REQUIRED,
                    "message": cap_message,
                    "paywall": True,
                    "commercial": decision,
                },
            )

    insert_result = store.try_insert_agreement_owner_with_monthly_cap(
        agreement_id=agreement_id,
        subject_ref=subject_ref,
        internal_keys_draft=uc.KEY_COST_AGREEMENT_DRAFT if economics and not guest_temp else 0,
        monthly_cap=monthly_cap,
        period_start_iso=period_start,
        guest_temp=guest_temp,
        idempotency_key=idempotency_key,
    )
    if insert_result == "cap_exceeded":
        raise HTTPException(
            status_code=403,
            detail={
                "code": cap_code,
                "message": cap_message,
                "paywall": True,
            },
        )
    if insert_result in ("duplicate", "idempotent_hit"):
        return insert_result
    if not economics:
        return insert_result
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
    return insert_result


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
    """User-safe fields only — no internal Keys. Includes commercial entitlement authority."""
    from backend.usage_economics.commercial_entitlement import (
        STATE_GUEST,
        STATE_PRO,
        resolve_commercial_entitlement,
    )

    store = get_usage_economics_store()
    store.init_schema()
    decision = resolve_commercial_entitlement(subject_ref)
    state = str(decision.get("state") or "")
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

    commercial = {
        "state": decision.get("state"),
        "grant_source": decision.get("grant_source"),
        "agreement_allowance": decision.get("agreement_allowance"),
        "agreements_used": decision.get("agreements_used"),
        "agreements_remaining": decision.get("agreements_remaining"),
        "period_ends_at": decision.get("period_ends_at"),
        "can_create_persisted_agreement": decision.get("can_create_persisted_agreement"),
        "can_save_guest_draft": decision.get("can_save_guest_draft"),
        "entitlement": decision.get("entitlement"),
        "create_allowed": bool(decision.get("create_allowed")),
        "upgrade_required": bool(decision.get("upgrade_required")),
        "reason": decision.get("reason"),
        "affiliate_status": decision.get("affiliate_status"),
        "genesis_allowance": None,
        "pro_allowance": decision.get("pro_allowance"),
        "free_allowance": None,
        "legacy_genesis_create_grant": decision.get("legacy_genesis_create_grant"),
    }

    remaining = decision.get("agreements_remaining")
    ttl_h = max(1, int(uc.GUEST_DRAFT_TTL_SECONDS // 3600))

    if state == STATE_PRO:
        return {
            "tier": "paid",
            "state": STATE_PRO,
            "grant_source": decision.get("grant_source"),
            "agreement_allowance": decision.get("agreement_allowance"),
            "agreements_used": decision.get("agreements_used"),
            "agreements_remaining": remaining,
            "period_ends_at": decision.get("period_ends_at"),
            "can_create_persisted_agreement": decision.get("can_create_persisted_agreement"),
            "can_save_guest_draft": False,
            "agreements_created": created_total,
            "agreements_completed": completed,
            "drafts_active": incomplete,
            "drafts_remaining": remaining,
            "watermark_required": False,
            "storage_persistent": True,
            "paywall_required": abuse or not bool(decision.get("can_create_persisted_agreement")),
            "soft_throttle": throttle,
            "draft_ttl_hours": None,
            "temporary_storage_note": None,
            "agreement_memory": agreement_memory_block,
            "commercial": commercial,
        }

    if state == STATE_GUEST:
        return {
            "tier": "guest",
            "state": STATE_GUEST,
            "grant_source": decision.get("grant_source"),
            "agreement_allowance": decision.get("agreement_allowance"),
            "agreements_used": decision.get("agreements_used"),
            "agreements_remaining": remaining,
            "period_ends_at": None,
            "can_create_persisted_agreement": False,
            "can_save_guest_draft": decision.get("can_save_guest_draft"),
            "agreements_created": created_total,
            "agreements_completed": completed,
            "drafts_active": incomplete,
            "drafts_remaining": remaining,
            "watermark_required": True,
            "storage_persistent": False,
            "paywall_required": abuse or not bool(decision.get("can_save_guest_draft")),
            "soft_throttle": throttle,
            "draft_ttl_hours": ttl_h,
            "temporary_storage_note": (
                f"Guest drafts may be retained for up to {ttl_h} hours. "
                "Choose LawDog Pro to save your draft."
            ),
            "agreement_memory": {**agreement_memory_block, "tier": "none", "semantic_search": False, "relationship_view": False},
            "commercial": commercial,
        }

    return {
        "tier": "none",
        "state": state or "none",
        "grant_source": decision.get("grant_source"),
        "agreement_allowance": decision.get("agreement_allowance"),
        "agreements_used": decision.get("agreements_used"),
        "agreements_remaining": remaining,
        "period_ends_at": decision.get("period_ends_at"),
        "can_create_persisted_agreement": False,
        "can_save_guest_draft": False,
        "agreements_created": created_total,
        "agreements_completed": completed,
        "drafts_active": incomplete,
        "drafts_remaining": 0,
        "watermark_required": True,
        "storage_persistent": False,
        "paywall_required": True,
        "soft_throttle": throttle,
        "draft_ttl_hours": None,
        "temporary_storage_note": None,
        "agreement_memory": agreement_memory_block,
        "commercial": commercial,
    }


def assert_guest_workflow_denied(
    *, subject_ref: str, surface: str, request: "Request | None" = None
) -> None:
    """Block guest subjects from save/share/sign/proof/history workflows.

    Demo checkout sessions (simulated POS) are allowed through even though they are
    technically guest subjects (anon-* orgs). This enables the post-payment flow.
    """
    from fastapi import HTTPException

    from backend.usage_economics.commercial_entitlement import subject_is_guest

    if not subject_is_guest(subject_ref):
        return

    if request is not None:
        from backend.security.commercial_auth import _is_demo_checkout_session

        if _is_demo_checkout_session(request):
            return

    raise HTTPException(
        status_code=403,
        detail={
            "code": uc.GUEST_WORKFLOW_DENIED,
            "message": (
                "Guest drafts cannot save to a workspace, share, sign, prove, or open history. "
                "Choose LawDog Pro to continue."
            ),
            "paywall": True,
            "surface": surface,
        },
    )


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


def try_repair_missing_agreement_ownership(agreement_id: str, verified_subject: str) -> bool:
    """
    One-shot ownership backfill when draft workspace metadata unambiguously matches
    the verified commercial principal. Never trusts client org headers alone.
    """
    aid = (agreement_id or "").strip()
    subj = (verified_subject or "").strip()
    if not aid or not subj.startswith("org:user-"):
        return False
    try:
        from backend.ops.ownership_inspector import _recoverable_subject_from_draft
    except Exception:
        return False
    candidate = (_recoverable_subject_from_draft(aid) or "").strip()
    if not candidate or candidate != subj:
        return False
    store = get_usage_economics_store()
    store.init_schema()
    if store.owner_subject_for_agreement(aid):
        return store.owner_subject_for_agreement(aid) == subj
    try:
        # Usage-exempt restore: never re-consume monthly allowance when ownership
        # was lost (e.g. legacy hard-delete Genesis monthly reset).
        if not store.ensure_agreement_owner_usage_exempt(
            agreement_id=aid, subject_ref=subj
        ):
            return False
        log.info(
            "ownership_repaired_from_draft_metadata agreement_id=%s subject=%s usage_exempt=1",
            aid,
            subj,
        )
        return True
    except Exception:
        log.exception("ownership_repair_failed agreement_id=%s", aid)
        return False


def assert_registered_owner_matches(request: Request, agreement_id: str) -> str:
    """
    Bind owner mutations to the server-side agreement ownership registry.

    Commercial mode always consults the registry (ignores
    ``CLAW_USAGE_ECONOMICS_ENABLED``). Non-commercial + economics-off keeps the
    legacy subject-only path for local/dev installs.
    """
    from fastapi import HTTPException

    from backend.security.commercial_auth import commercial_mode_enforced
    from backend.security.request_identity import resolve_verified_subject_from_request

    commercial = commercial_mode_enforced()
    if not usage_economics_enabled() and not commercial:
        return resolve_subject_from_request(request)

    subj = resolve_verified_subject_from_request(request)
    store = get_usage_economics_store()
    store.init_schema()
    owner = store.owner_subject_for_agreement(agreement_id)
    if not owner:
        if try_repair_missing_agreement_ownership(agreement_id, subj):
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


def subject_has_commercial_create_entitlement(subject_ref: str) -> bool:
    """True for Stripe Pro create entitlement only (Genesis is not a buyer tier)."""
    try:
        from backend.usage_economics.commercial_entitlement import (
            STATE_PRO,
            resolve_commercial_entitlement,
        )

        state = str(resolve_commercial_entitlement(subject_ref).get("state") or "").strip().lower()
        return state == STATE_PRO
    except Exception:
        log.exception("subject_has_commercial_create_entitlement failed")
        return subject_has_paid_plan(subject_ref)


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
    # Pro OR Genesis — both are commercially entitled create paths (not guest TTL).
    entitled = subject_has_commercial_create_entitlement(subj)
    paid = subject_has_paid_plan(subj)
    tier: str = "paid" if paid else ("genesis" if entitled else "free")
    watermark = not entitled
    expires_at: Optional[str] = None
    expired = False
    if not entitled and not row.get("completed_at"):
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
        if try_repair_missing_agreement_ownership(agreement_id, subject_ref):
            owner = store.owner_subject_for_agreement(agreement_id)
    if owner is None:
        return False
    return owner == subject_ref
