"""Config-driven subscription plans and usage rates (deterministic, no I/O)."""

from __future__ import annotations

from decimal import Decimal, ROUND_CEILING
from typing import Any, Dict, Optional, TypedDict

from backend.economics.config import affiliate_default_bps


class PlanDict(TypedDict, total=False):
    monthly_usd: Decimal
    included_keys: int
    overage_mode: str
    usage_enabled: bool
    affiliate_eligible: bool
    payout_share_bps: int


PLANS: Dict[str, PlanDict] = {
    "starter": {
        "monthly_usd": Decimal("29.00"),
        "included_keys": 50,
        "overage_mode": "metered",
        "usage_enabled": True,
        "affiliate_eligible": True,
        "payout_share_bps": 1_000,
    },
    "pro": {
        "monthly_usd": Decimal("99.00"),
        "included_keys": 200,
        "overage_mode": "metered",
        "usage_enabled": True,
        "affiliate_eligible": True,
        "payout_share_bps": 1_500,
    },
    "enterprise": {
        "monthly_usd": Decimal("499.00"),
        "included_keys": 2_000,
        "overage_mode": "metered",
        "usage_enabled": True,
        "affiliate_eligible": False,
        "payout_share_bps": 0,
    },
}


SERVICE_KEY_COSTS: Dict[str, int] = {
    "esign_create": 1,
    "esign_finalize": 2,
    "agreement_parse": 2,
    "agreement_draft": 3,
    # Aligns with usage_economics.constants.KEY_COST_AGREEMENT_FINALIZATION for org-key metering when enabled.
    "agreement_finalization": 7,
    "analyst_analyze": 4,
    "timeline_create": 2,
    "timeline_anchor": 3,
}


def get_plan(plan_code: str) -> PlanDict:
    key = (plan_code or "starter").strip().lower() or "starter"
    base = PLANS.get(key) or PLANS["starter"]
    return dict(base)


def affiliate_bps_for_plan(plan_code: str) -> int:
    key = (plan_code or "").strip().lower()
    if key in PLANS:
        return max(0, min(10_000, int(PLANS[key].get("payout_share_bps", 0))))
    return affiliate_default_bps()


def affiliate_eligible_for_plan(plan_code: str) -> bool:
    return bool(get_plan(plan_code).get("affiliate_eligible", False))


def calculate_key_cost(service_type: str, unit_count: float, metadata: Optional[Dict[str, Any]] = None) -> int:
    del metadata
    u = Decimal(str(unit_count))
    if u <= 0:
        return 0
    units = int(u.to_integral_value(rounding=ROUND_CEILING))
    flat = int(SERVICE_KEY_COSTS.get(service_type, 1))
    return max(0, flat * max(1, units))
