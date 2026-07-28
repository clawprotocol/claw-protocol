"""Server-authoritative commercial entitlement for LawDog agreement creation.

Decision classes (single authority for dashboard / Create / enforcement):
- ``paid_pro`` — active Stripe-paid subscription; unlimited agreement creation
- ``genesis_allowance`` — active Genesis Dog with complimentary monthly create meter
- ``free`` — first completed agreement complimentary; create allowed until that
  allowance is consumed (draft init / bootstrap / dashboard visits do not consume it)

Genesis status is loaded from the economics ``genesis_affiliates`` table (status=active).
Client headers, cached tiers, and org spoofing must never grant complimentary access.
Affiliate commission ($11.70/mo per referred paid user) is separate economics.
"""

from __future__ import annotations

import calendar
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from backend.usage_economics import constants as uc


ENTITLEMENT_PAID_PRO = "paid_pro"
ENTITLEMENT_GENESIS_ALLOWANCE = "genesis_allowance"
ENTITLEMENT_FREE = "free"


def genesis_monthly_agreement_allowance() -> int:
    """
    Named server configuration for Genesis complimentary monthly draft creates.

    Accepted values: integers in
    [GENESIS_MONTHLY_AGREEMENT_ALLOWANCE_MIN, GENESIS_MONTHLY_AGREEMENT_ALLOWANCE_MAX]
    (1–100). Blank, malformed, zero, negative, or out-of-range values fall back to
    DEFAULT_GENESIS_MONTHLY_AGREEMENT_ALLOWANCE (5). Zero is not a kill-switch.
    """
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


def subject_is_active_genesis(subject_ref: str) -> bool:
    """True only when economics DB has an active Genesis affiliate for the user workspace."""
    uid = user_id_from_subject_ref(subject_ref)
    if not uid:
        return False
    from backend.economics.genesis_referral_store import ensure_genesis_referral_schema
    from backend.economics.store import get_economics_store
    from backend.security.genesis_affiliate_access import resolve_active_genesis_affiliate

    eco = get_economics_store()
    eco.init_schema()
    with eco._conn() as con:
        ensure_genesis_referral_schema(con)
        return resolve_active_genesis_affiliate(con, uid) is not None


def resolve_commercial_entitlement(subject_ref: str) -> Dict[str, Any]:
    """
    Single server decision for create access and UI gating.

    Never invents Genesis or paid entitlement from missing auth — callers must
    authenticate before treating this as authoritative for a principal.
    """
    from backend.usage_economics.policy import subject_has_paid_plan
    from backend.usage_economics.store import get_usage_economics_store

    period_start, period_end = utc_month_period_bounds()
    paid = subject_has_paid_plan(subject_ref)
    if paid:
        return {
            "entitlement": ENTITLEMENT_PAID_PRO,
            "tier": "paid",
            "create_allowed": True,
            "upgrade_required": False,
            "reason": None,
            "genesis_allowance": None,
            "free_allowance": None,
        }

    genesis_active = subject_is_active_genesis(subject_ref)
    if genesis_active:
        limit = genesis_monthly_agreement_allowance()
        store = get_usage_economics_store()
        store.init_schema()
        used = int(store.agreements_created_this_utc_month(subject_ref))
        remaining = max(0, limit - used)
        allowed = remaining > 0
        return {
            "entitlement": ENTITLEMENT_GENESIS_ALLOWANCE,
            "tier": "genesis",
            "create_allowed": allowed,
            "upgrade_required": not allowed,
            "reason": None if allowed else uc.GENESIS_MONTHLY_ALLOWANCE_EXHAUSTED,
            "genesis_allowance": {
                "active": True,
                "limit": limit,
                "used": used,
                "remaining": remaining,
                "period_start": period_start,
                "period_end": period_end,
                "allowed": allowed,
            },
            "free_allowance": None,
        }

    store = get_usage_economics_store()
    store.init_schema()
    completed = int(store.count_completed_agreements(subject_ref))
    limit = int(uc.FREE_MAX_COMPLETED_AGREEMENTS)
    remaining = max(0, limit - completed)
    allowed = remaining > 0
    return {
        "entitlement": ENTITLEMENT_FREE,
        "tier": "free",
        "create_allowed": allowed,
        "upgrade_required": not allowed,
        "reason": None if allowed else uc.COMPLETED_AGREEMENT_LIMIT,
        "genesis_allowance": None,
        "free_allowance": {
            "limit": limit,
            "used": completed,
            "remaining": remaining,
            "allowed": allowed,
        },
    }
