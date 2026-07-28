"""Server-authoritative commercial entitlement: Guest → Genesis Dog → Pro.

Product states:
- ``guest`` — no account; one temporary draft only
- ``pending_genesis`` — authenticated; Genesis access requested, not granted
- ``genesis`` — admin-granted Genesis Dog (or temporary legacy affiliate dual-read)
- ``pro`` — Stripe-backed paid plan with billing-period create allowance
- ``none`` — authenticated without Genesis or Pro

Genesis Dog is never inferred from ``support_operator``. Affiliate status is not
the permanent commercial authority (see ``genesis_dog_entitlement`` precedence).
"""

from __future__ import annotations

import calendar
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from backend.usage_economics import constants as uc


STATE_GUEST = "guest"
STATE_PENDING_GENESIS = "pending_genesis"
STATE_GENESIS = "genesis"
STATE_PRO = "pro"
STATE_NONE = "none"

GRANT_SOURCE_ADMIN = "admin"
GRANT_SOURCE_STRIPE = "stripe"
GRANT_SOURCE_LEGACY_AFFILIATE = "legacy_affiliate"
GRANT_SOURCE_LEGACY_MIGRATION = "legacy_migration"
GRANT_SOURCE_NONE = "none"

# Backward-compat commercial.entitlement aliases for mid-deploy clients.
ENTITLEMENT_PAID_PRO = "paid_pro"
ENTITLEMENT_GENESIS_ALLOWANCE = "genesis_allowance"
ENTITLEMENT_GUEST = "guest"
ENTITLEMENT_NONE = "none"
# Removed Free account tier — kept only so old imports fail loudly at call sites that still branch on it.
ENTITLEMENT_FREE = "none"


def genesis_monthly_agreement_allowance() -> int:
    """Configured Genesis complimentary monthly draft creates (default 5)."""
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
    """Configured Pro billing-period draft creates (default 25)."""
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
    """True when Genesis Dog commercial access is active for the user workspace."""
    uid = user_id_from_subject_ref(subject_ref)
    if not uid:
        return False
    from backend.usage_economics.genesis_dog_entitlement import resolve_genesis_dog_access

    active, _src, _row = resolve_genesis_dog_access(uid)
    return active


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
        # Fallback: current UTC month (should not happen when paid).
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
        # Infer ~1 billing month when Stripe start is missing.
        start_dt = end_dt - timedelta(days=31)
    if not start_dt:
        start_dt = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if not end_dt:
        end_dt = start_dt + timedelta(days=31)
    # If started_at is older than one period, clamp start to (end - 31d) for metering window.
    if end_dt and start_dt and (end_dt - start_dt).days > 40:
        start_dt = end_dt - timedelta(days=31)
    return (
        start_dt.isoformat().replace("+00:00", "Z"),
        end_dt.isoformat().replace("+00:00", "Z"),
    )


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
    genesis_allowance: Optional[Dict[str, Any]] = None,
    pro_allowance: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    upgrade_required = not can_create_persisted_agreement and state in (
        STATE_GENESIS,
        STATE_PRO,
        STATE_NONE,
        STATE_PENDING_GENESIS,
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
        # Compat aliases
        "entitlement": entitlement_alias,
        "tier": (
            "paid"
            if state == STATE_PRO
            else "genesis"
            if state == STATE_GENESIS
            else "guest"
            if state == STATE_GUEST
            else "none"
        ),
        "create_allowed": can_create_persisted_agreement
        if state != STATE_GUEST
        else can_save_guest_draft,
        "upgrade_required": upgrade_required,
        "reason": reason,
        "genesis_allowance": genesis_allowance,
        "pro_allowance": pro_allowance,
        "free_allowance": None,
    }


def resolve_commercial_entitlement(subject_ref: str) -> Dict[str, Any]:
    """
    Single server decision for create access and UI gating.

    Frontend must render from these fields; do not hard-code allowances client-side.
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
        )

    if subject_has_paid_plan(subject_ref):
        limit = pro_billing_period_agreement_allowance()
        period_start, period_end = _pro_period_bounds(subject_ref)
        used = int(store.agreements_created_since(subject_ref, period_start))
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
            pro_allowance=pro_block,
        )

    uid = user_id_from_subject_ref(subject_ref)
    if uid:
        from backend.usage_economics.genesis_dog_entitlement import (
            has_open_genesis_access_request,
            resolve_genesis_dog_access,
        )

        active, gsrc, grow = resolve_genesis_dog_access(uid)
        if active:
            override = None
            if grow and grow.get("allowance_override") is not None:
                try:
                    override = int(grow["allowance_override"])
                except (TypeError, ValueError):
                    override = None
            limit = override if override and override > 0 else genesis_monthly_agreement_allowance()
            period_start, period_end = utc_month_period_bounds()
            used = int(store.agreements_created_since(subject_ref, period_start))
            remaining = max(0, limit - used)
            allowed = remaining > 0
            ga = {
                "active": True,
                "limit": limit,
                "used": used,
                "remaining": remaining,
                "period_start": period_start,
                "period_end": period_end,
                "allowed": allowed,
            }
            return _flat_payload(
                state=STATE_GENESIS,
                grant_source=gsrc,
                agreement_allowance=limit,
                agreements_used=used,
                agreements_remaining=remaining,
                period_ends_at=period_end,
                can_create_persisted_agreement=allowed,
                can_save_guest_draft=False,
                reason=None if allowed else uc.GENESIS_MONTHLY_ALLOWANCE_EXHAUSTED,
                entitlement_alias=ENTITLEMENT_GENESIS_ALLOWANCE,
                genesis_allowance=ga,
            )

        if has_open_genesis_access_request(uid):
            return _flat_payload(
                state=STATE_PENDING_GENESIS,
                grant_source=GRANT_SOURCE_NONE,
                agreement_allowance=0,
                agreements_used=0,
                agreements_remaining=0,
                period_ends_at=None,
                can_create_persisted_agreement=False,
                can_save_guest_draft=False,
                reason=uc.ENTITLEMENT_REQUIRED,
                entitlement_alias=ENTITLEMENT_NONE,
            )

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
    )
