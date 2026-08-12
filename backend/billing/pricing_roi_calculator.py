"""Deterministic offline ROI calculator for pricing arms (no network / paid services)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict


def _d(v: Any) -> Decimal:
    return Decimal(str(v))


def _q2(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class PricingArmInputs:
    """Aggregate cohort inputs for one price arm (e.g. $39 or $49)."""

    list_price_usd: Decimal
    paid_conversion_rate: Decimal
    """Share of eligible paywall visitors who become paying customers."""
    collected_revenue_per_payer_usd: Decimal
    """Net collected over the horizon (after discounts; before fees)."""
    payment_and_billing_fees_usd: Decimal = Decimal("0")
    genesis_commission_usd: Decimal = Decimal("0")
    refunds_and_chargebacks_usd: Decimal = Decimal("0")
    model_and_storage_cost_usd: Decimal = Decimal("0")
    attributable_support_cost_usd: Decimal = Decimal("0")


@dataclass(frozen=True)
class PricingArmResult:
    contribution_per_payer_usd: Decimal
    contribution_per_visitor_usd: Decimal


def contribution_for_arm(arm: PricingArmInputs) -> PricingArmResult:
    per_payer = (
        arm.collected_revenue_per_payer_usd
        - arm.payment_and_billing_fees_usd
        - arm.genesis_commission_usd
        - arm.refunds_and_chargebacks_usd
        - arm.model_and_storage_cost_usd
        - arm.attributable_support_cost_usd
    )
    per_visitor = arm.paid_conversion_rate * per_payer
    return PricingArmResult(
        contribution_per_payer_usd=_q2(per_payer),
        contribution_per_visitor_usd=_q2(per_visitor),
    )


def break_even_conversion_ratio(
    contribution_per_payer_low: Decimal,
    contribution_per_payer_high: Decimal,
) -> Decimal:
    """Minimum conversion_high / conversion_low to prefer the higher list price.

    ``conversion_49 / conversion_39 > contrib_39 / contrib_49``.
    """
    low = _d(contribution_per_payer_low)
    high = _d(contribution_per_payer_high)
    if high <= 0:
        return Decimal("Infinity")
    return (low / high).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def directional_gross_revenue_retention_ratio(
    low_list_price: Decimal = Decimal("39"),
    high_list_price: Decimal = Decimal("49"),
) -> Decimal:
    """39/49 ≈ 0.7959 — directional sticker check only, not the decision threshold."""
    return (_d(low_list_price) / _d(high_list_price)).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )


def compare_arms(
    low: PricingArmInputs,
    high: PricingArmInputs,
) -> Dict[str, Any]:
    low_r = contribution_for_arm(low)
    high_r = contribution_for_arm(high)
    threshold = break_even_conversion_ratio(
        low_r.contribution_per_payer_usd,
        high_r.contribution_per_payer_usd,
    )
    actual_ratio = (
        (high.paid_conversion_rate / low.paid_conversion_rate).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        if low.paid_conversion_rate > 0
        else Decimal("Infinity")
    )
    return {
        "low": low_r,
        "high": high_r,
        "break_even_conversion_ratio": threshold,
        "actual_conversion_ratio": actual_ratio,
        "high_preferred_on_contribution": high_r.contribution_per_visitor_usd
        > low_r.contribution_per_visitor_usd,
        "directional_gross_retention_ratio": directional_gross_revenue_retention_ratio(
            low.list_price_usd, high.list_price_usd
        ),
    }
