from decimal import Decimal

from backend.billing.pricing_roi_calculator import (
    PricingArmInputs,
    break_even_conversion_ratio,
    compare_arms,
    contribution_for_arm,
    directional_gross_revenue_retention_ratio,
)


def test_directional_796_rule():
    assert directional_gross_revenue_retention_ratio() == Decimal("0.7959")


def test_contribution_and_break_even():
    arm39 = PricingArmInputs(
        list_price_usd=Decimal("39"),
        paid_conversion_rate=Decimal("0.10"),
        collected_revenue_per_payer_usd=Decimal("39"),
        genesis_commission_usd=Decimal("11.70"),
        payment_and_billing_fees_usd=Decimal("1.50"),
        model_and_storage_cost_usd=Decimal("4"),
    )
    arm49 = PricingArmInputs(
        list_price_usd=Decimal("49"),
        paid_conversion_rate=Decimal("0.085"),
        collected_revenue_per_payer_usd=Decimal("49"),
        genesis_commission_usd=Decimal("14.70"),
        payment_and_billing_fees_usd=Decimal("1.80"),
        model_and_storage_cost_usd=Decimal("4"),
    )
    r39 = contribution_for_arm(arm39)
    r49 = contribution_for_arm(arm49)
    assert r39.contribution_per_payer_usd == Decimal("21.80")
    assert r49.contribution_per_payer_usd == Decimal("28.50")
    thresh = break_even_conversion_ratio(
        r39.contribution_per_payer_usd, r49.contribution_per_payer_usd
    )
    assert thresh == Decimal("0.7649")
    out = compare_arms(arm39, arm49)
    assert out["directional_gross_retention_ratio"] == Decimal("0.7959")
    assert out["break_even_conversion_ratio"] == thresh
