"""Server-authoritative commercial entitlement: Guest | Pro buyers + Genesis affiliate.

Buyer plan states (create authority):
- ``guest`` — anonymous temporary draft only
- ``pro`` — Stripe-backed paid plan; quota meters successfully finalized agreements
- ``none`` — authenticated without Pro

Affiliate status (never a buyer create tier):
- ``none`` | ``genesis``

``STATE_GENESIS`` / ``pending_genesis`` constants remain for read-compat and test
detection only. They are never issued as create-entitled product states.
Existing ``genesis_dog_entitlements`` rows are readable via
``legacy_genesis_create_grant`` but do **not** grant create. Ops must migrate
those users to Pro (see commercial-readiness migration note).
"""

from __future__ import annotations

import calendar
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from backend.usage_economics import constants as uc


STATE_GUEST = "guest"
STATE_PENDING_GENESIS = "pending_genesis"  # deprecated buyer state — never issued
STATE_GENESIS = "genesis"  # deprecated buyer state — never issued for create
STATE_PRO = "pro"
STATE_NONE = "none"

AFFILIATE_STATUS_NONE = "none"
AFFILIATE_STATUS_GENESIS = "genesis"

GRANT_SOURCE_ADMIN = "admin"
GRANT_SOURCE_STRIPE = "stripe"
GRANT_SOURCE_LEGACY_AFFILIATE = "legacy_affiliate"
GRANT_SOURCE_LEGACY_MIGRATION = "legacy_migration"
GRANT_SOURCE_NONE = "none"

# Backward-compat commercial.entitlement aliases for mid-deploy clients.
ENTITLEMENT_PAID_PRO = "paid_pro"
ENTITLEMENT_GENESIS_ALLOWANCE = "genesis_allowance"  # never returned as active create tier
ENTITLEMENT_GUEST = "guest"
ENTITLEMENT_NONE = "none"
ENTITLEMENT_FREE = "none"


def genesis_monthly_agreement_allowance() -> int:
    """Legacy helper retained for admin/read tooling — not a buyer create cap."""
    default = int(uc.DEFAULT_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE)
    raw = os.getenv("CLAW_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE", "").strip()
    if not raw:
        return default
    try:
        n = int(raw)
    except ValueError:
        return default
    lo = int(uc.GENESIS_MONTHLY_AGREEMENT_ALLOWANCE_MIN)
    hi = int(uc.GENESIS_MONTHLY_AGREEMENT_ALLOWANCE_MAX)
    if lo <= n <= hi:
        return n
    return default


def pro_billing_period_agreement_allowance() -> int:
    """Configured Pro billing-period finalized-agreement allowance (default 25)."""
    default = int(uc.DEFAULT_PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE)
    raw = os.getenv("CLAW_PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE", "").strip()
    if not raw:
        return default
    try:
        n = int(raw)
    except ValueError:
        return default
    lo = int(uc.PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE_MIN)
    hi = int(uc.PRO_BILLING_PERIOD_AGREEMENT_ALLOWANCE_MAX)
    if lo <= n <= hi:
        return n
    return default


def utc_month_period_bounds(now: Optional[datetime] = None) -> Tuple[str, str]:
    """Return (period_start, period_end) ISO-Z for the current UTC calendar month."""
    dt = now or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    start = dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_day = calendar.monthrange(start.year, start.month)[1]
    end = start.replace(day=last_day, hour=23, minute=59, second=59, microsecond=0)
    return (
        start.isoformat().replace("+00:00", "Z"),
        end.isoformat().replace("+00:00", "Z"),
    )


def user_id_from_subject_ref(subject_ref: str) -> Optional[str]:
    from backend.utils.enforce import org_id_from_subject

    oid = org_id_from_subject(subject_ref)
    if not oid or not oid.startswith("user-"):
        return None
    uid = oid[5:].strip()
    return uid or None


def subject_is_guest(subject_ref: str) -> bool:
    from backend.utils.enforce import org_id_from_subject

    oid = (org_id_from_subject(subject_ref) or "").strip()
    return oid.startswith("anon-")


def subject_is_active_genesis(subject_ref: str) -> bool:
    """True when the subject has Genesis *affiliate* status (not buyer create)."""
    uid = user_id_from_subject_ref(subject_ref)
    if not uid:
        return False
    return _affiliate_status_for_user(uid) == AFFILIATE_STATUS_GENESIS


def _parse_iso(ts: Optional[str]) -> Optional[datetime]:
    raw = (ts or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _pro_period_bounds(subject_ref: str) -> Tuple[str, str]:
    """Billing-period start/end for Pro metering from the subscription row."""
    from backend.billing import subscriptions as subs
    from backend.billing.subscription_authority import is_subscription_entitled
    from backend.economics.store import get_economics_store
    from backend.utils.enforce import org_id_from_subject

    oid = org_id_from_subject(subject_ref) or ""
    eco = get_economics_store()
    eco.init_schema()
    row = subs.get_subscription_for_org(eco, oid) if oid else None
    if not is_subscription_entitled(row) and oid.startswith("user-"):
        uid = oid[5:].strip()
        if uid:
            row = eco.get_subscription_by_user_id(uid)
    if not row or not is_subscription_entitled(row):
        return utc_month_period_bounds()

    period_end = (
        str(row.get("current_period_end") or "").strip()
        or str(row.get("expires_at") or "").strip()
    )
    period_start = (
        str(row.get("current_period_start") or "").strip()
        or str(row.get("started_at") or "").strip()
    )
    end_dt = _parse_iso(period_end)
    start_dt = _parse_iso(period_start)
    if end_dt and not start_dt:
        start_dt = end_dt - timedelta(days=31)
    if not start_dt:
        start_dt = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if not end_dt:
        end_dt = start_dt + timedelta(days=31)
    if end_dt and start_dt and (end_dt - start_dt).days > 40:
        start_dt = end_dt - timedelta(days=31)
    return (
        start_dt.isoformat().replace("+00:00", "Z"),
        end_dt.isoformat().replace("+00:00", "Z"),
    )


def _affiliate_status_for_user(user_id: str) -> str:
    from backend.economics.genesis_referral_store import ensure_genesis_referral_schema
    from backend.economics.store import get_economics_store
    from backend.security.genesis_affiliate_access import resolve_active_genesis_affiliate

    uid = (user_id or "").strip()
    if not uid:
        return AFFILIATE_STATUS_NONE
    eco = get_economics_store()
    eco.init_schema()
    with eco._conn() as con:  # noqa: SLF001
        ensure_genesis_referral_schema(con)
        aff = resolve_active_genesis_affiliate(con, uid)
    return AFFILIATE_STATUS_GENESIS if aff is not None else AFFILIATE_STATUS_NONE


def _legacy_genesis_create_grant_snapshot(user_id: str) -> Optional[Dict[str, Any]]:
    """Read-only snapshot of a retired Genesis create-grant row (never grants create)."""
    from backend.usage_economics.genesis_dog_entitlement import get_entitlement, is_commercially_active

    row = get_entitlement(user_id)
    if not row:
        return None
    return {
        "present": True,
        "status": str(row.get("status") or ""),
        "grant_source": str(row.get("grant_source") or ""),
        "would_have_been_active": bool(is_commercially_active(row)),
        "create_granted": False,
        "migration_required": bool(is_commercially_active(row)),
        "note": (
            "Genesis create grants are retired. Migrate active rows to Pro — "
            "do not re-enable STATE_GENESIS create entitlement."
        ),
    }


def _flat_payload(
    *,
    state: str,
    grant_source: str,
    agreement_allowance: Optional[int],
    agreements_used: int,
    agreements_remaining: Optional[int],
    period_ends_at: Optional[str],
    can_create_persisted_agreement: bool,
    can_save_guest_draft: bool,
    reason: Optional[str],
    entitlement_alias: str,
    affiliate_status: str = AFFILIATE_STATUS_NONE,
    genesis_allowance: Optional[Dict[str, Any]] = None,
    pro_allowance: Optional[Dict[str, Any]] = None,
    legacy_genesis_create_grant: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    upgrade_required = not can_create_persisted_agreement and state in (
        STATE_PRO,
        STATE_NONE,
    )
    return {
        "state": state,
        "grant_source": grant_source,
        "agreement_allowance": agreement_allowance,
        "agreements_used": agreements_used,
        "agreements_remaining": agreements_remaining,
        "period_ends_at": period_ends_at,
        "can_create_persisted_agreement": can_create_persisted_agreement,
        "can_save_guest_draft": can_save_guest_draft,
        "entitlement": entitlement_alias,
        "tier": (
            "paid"
            if state == STATE_PRO
            else "guest"
            if state == STATE_GUEST
            else "none"
        ),
        "create_allowed": can_create_persisted_agreement
        if state != STATE_GUEST
        else can_save_guest_draft,
        "upgrade_required": upgrade_required,
        "reason": reason,
        "affiliate_status": affiliate_status,
        "genesis_allowance": None,  # retired buyer block — always null
        "pro_allowance": pro_allowance,
        "free_allowance": None,
        "legacy_genesis_create_grant": legacy_genesis_create_grant,
    }


def resolve_commercial_entitlement(subject_ref: str) -> Dict[str, Any]:
    """
    Single server decision for create access and UI gating.

    Buyer plan is guest|pro|none. Affiliate status is none|genesis and never
    grants persisted create or premium drafting.
    """
    from backend.usage_economics.policy import subject_has_paid_plan
    from backend.usage_economics.store import get_usage_economics_store

    store = get_usage_economics_store()
    store.init_schema()

    if subject_is_guest(subject_ref):
        incomplete = int(store.count_incomplete_agreements(subject_ref))
        can_guest = incomplete < int(uc.GUEST_MAX_TEMP_DRAFTS)
        return _flat_payload(
            state=STATE_GUEST,
            grant_source=GRANT_SOURCE_NONE,
            agreement_allowance=int(uc.GUEST_MAX_TEMP_DRAFTS),
            agreements_used=incomplete,
            agreements_remaining=max(0, int(uc.GUEST_MAX_TEMP_DRAFTS) - incomplete),
            period_ends_at=None,
            can_create_persisted_agreement=False,
            can_save_guest_draft=can_guest,
            reason=None if can_guest else uc.GUEST_DRAFT_LIMIT,
            entitlement_alias=ENTITLEMENT_GUEST,
            affiliate_status=AFFILIATE_STATUS_NONE,
        )

    uid = user_id_from_subject_ref(subject_ref)
    affiliate_status = _affiliate_status_for_user(uid) if uid else AFFILIATE_STATUS_NONE
    legacy_grant = _legacy_genesis_create_grant_snapshot(uid) if uid else None

    if subject_has_paid_plan(subject_ref):
        limit = pro_billing_period_agreement_allowance()
        period_start, period_end = _pro_period_bounds(subject_ref)
        used = int(store.agreements_finalized_since(subject_ref, period_start))
        remaining = max(0, limit - used)
        allowed = remaining > 0
        pro_block = {
            "active": True,
            "limit": limit,
            "used": used,
            "remaining": remaining,
            "period_start": period_start,
            "period_end": period_end,
            "allowed": allowed,
            "meter": "finalized",
        }
        return _flat_payload(
            state=STATE_PRO,
            grant_source=GRANT_SOURCE_STRIPE,
            agreement_allowance=limit,
            agreements_used=used,
            agreements_remaining=remaining,
            period_ends_at=period_end,
            can_create_persisted_agreement=allowed,
            can_save_guest_draft=False,
            reason=None if allowed else uc.PRO_BILLING_PERIOD_ALLOWANCE_EXHAUSTED,
            entitlement_alias=ENTITLEMENT_PAID_PRO,
            affiliate_status=affiliate_status,
            pro_allowance=pro_block,
            legacy_genesis_create_grant=legacy_grant,
        )

    # Authenticated without Pro — never Genesis create / pending_genesis buyer states.
    return _flat_payload(
        state=STATE_NONE,
        grant_source=GRANT_SOURCE_NONE,
        agreement_allowance=0,
        agreements_used=0,
        agreements_remaining=0,
        period_ends_at=None,
        can_create_persisted_agreement=False,
        can_save_guest_draft=False,
        reason=uc.ENTITLEMENT_REQUIRED,
        entitlement_alias=ENTITLEMENT_NONE,
        affiliate_status=affiliate_status,
        legacy_genesis_create_grant=legacy_grant,
    )
