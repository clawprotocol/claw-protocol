# Pricing ROI decision framework ($49 / 10)

**Status:** Decision memo for paid-beta pricing hypothesis.  
**Not customer validation.** Code consistency ≠ willingness-to-pay evidence.

## Three separate questions

| # | Question | How we answer |
|---|---|---|
| 1 | Is the **$49 / 10** contract internally coherent? | Product + engineering alignment (this closure) |
| 2 | Is each paid customer **contribution-positive**? | Unit economics after fees, Genesis, refunds, model, support |
| 3 | Does **$49 outperform $39** per eligible visitor over a retained horizon? | Controlled cohort comparison with constant quota/features |

Do **not** compare historical $39 “unlimited” packaging against $49/10 and call the result price elasticity. Any controlled comparison must hold quota, features, cohort eligibility, attribution window, and checkout experience constant — changing only the price.

## Launch commercial contract (authoritative)

- Pro: **$49/month** or **$490/year paid upfront** (two months free vs 12×$49).
- Allowance: **10 successfully finalized** premium agreements **per UTC calendar month** for monthly **and** annual subscribers.
- No rollover. Previews / failed generations / retries / repairs / idempotent duplicates do not consume.
- Monthly is the **paid-beta default** cadence; annual requires affirmative selection.
- Genesis: **30% of the first eligible net Pro payment** (after discounts, excluding tax); not recurring. Standard: $14.70 monthly / $147.00 annual.
- **$9** single-agreement unlock: quiet post-value fallback; unlocks only that agreement; never Pro membership.
- Arithmetic crossover: five × $9 = $45; six × $9 = $54 → subscription is cheaper at six uses before membership benefits.

## Primary metric

```
90_day_contribution_per_eligible_paywall_visitor =
  paid_conversion_rate
  × (
      90_day_collected_revenue_per_payer
      - payment_and_billing_fees
      - Genesis_commission
      - refunds_and_chargebacks
      - model_and_storage_cost
      - attributable_support_cost
    )
```

Also report for each cohort arm:

- 60-day contribution per eligible paywall visitor
- 90-day contribution per activated user
- Paywall → checkout-start rate
- Checkout completion rate
- First-successful-finalization activation rate
- Monthly vs annual mix
- $9 unlock completion and subscription cannibalization
- Agreements finalized per payer: P25 / P50 / P75 / P90
- Model cost per successful finalization
- Repair/retry rate
- Refund rate
- Support incidents per payer
- Renewal and cancellation rates
- Contribution per payer and per visitor

Local calculator (deterministic, offline): `backend/billing/pricing_roi_calculator.py`.

## The 79.6% rule (qualified)

`39 / 49 ≈ 0.7959` (79.6%).

**If** retention, refunds, mix, and costs were identical, $49 could retain **79.6%** of the $39 purchaser count and match **initial gross subscription revenue**.

This is a **directional check only**. The actual decision threshold is:

```
conversion_49 / conversion_39
  > expected_90_day_contribution_per_payer_39
    / expected_90_day_contribution_per_payer_49
```

Sticker revenue alone is insufficient. Prefer retained contribution per eligible visitor.

## Evidence gates

| Evidence type | Counts as price validation? |
|---|---|
| Stated willingness to pay (interview) | Directional only |
| Test-mode checkout behavior | Directional only |
| **Actual attributable paid purchases** | **Yes — required** |
| Agent / simulated persona / automated rubric | **No** |

Until genuine cohort data exists: **CUSTOMER ROI VALIDATED: NO — BLOCKED ON REAL COHORT DATA**.

## Operator next steps

1. Run Stripe **test-mode** smoke for $49 monthly + $490 annual Prices (see GTM external checklist).
2. Execute WTP score sheet (`docs/product/WTP_SCORE_SHEET.md`) with real target users.
3. Instrument cohort dashboards for the metrics above.
4. Decide $49 vs $39 only after controlled contribution comparison.
