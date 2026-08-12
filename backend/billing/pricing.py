"""Config-driven subscription plans and usage rates (deterministic, no I/O)."""

from __future__ import annotations

from decimal import Decimal, ROUND_CEILING
from typing import Any, Dict, Optional, TypedDict

from backend.economics.config import affiliate_default_bps


class PlanDict(TypedDict, total=False):
    monthly_usd: Decimal
    annual_usd: Decimal
    included_keys: int
    overage_mode: str
    usage_enabled: bool
    affiliate_eligible: bool
    payout_share_bps: int


# Launch contract: Pro $49/mo or $490/year upfront; 10 finalized / UTC calendar month.
# Plus/starter is not a launch SKU. Genesis commission = payout_share_bps of eligible net
# (first invoice only; ledger calculates from invoice — do not hardcode dollar amounts).
# included_keys / overage_mode are inert internal compatibility fields — they do not
# grant buyer quota or bill overages at paid-beta launch (quota = finalized agreements).
PLANS: Dict[str, PlanDict] = {
    "pro": {
        "monthly_usd": Decimal("49.00"),
        "annual_usd": Decimal("490.00"),
        "included_keys": 200,
        "overage_mode": "metered",
        "usage_enabled": True,
        "affiliate_eligible": True,
        # 30% of first eligible net Pro payment (e.g. $14.70 on $49; $147 on $490).
        "payout_share_bps": 3_000,
    },
    "enterprise": {
        "monthly_usd": Decimal("499.00"),
        "annual_usd": Decimal("4990.00"),
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
    key = (plan_code or "pro").strip().lower() or "pro"
    # Legacy "starter"/"plus" codes resolve to Pro — Plus is not a launch SKU.
    if key in {"starter", "plus", "standard", "paid_pro", "business"}:
        key = "pro"
    base = PLANS.get(key) or PLANS["pro"]
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
