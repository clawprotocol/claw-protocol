# Commercial truth table — $49 / $490 / 10-per-UTC-month

| Surface | Contract | Status |
|---|---|---|
| Pro monthly price | **$49** | ALIGNED (`backend/billing/pricing.py`, FE tiers) |
| Pro annual price | **$490 paid upfront** | ALIGNED (FE `annualPrepayUsd`; BE `annual_usd`) |
| Pro quota | **10 successfully finalized** / **UTC calendar month** | ALIGNED (`commercial_entitlement._pro_quota_period_bounds`) |
| Monthly vs annual quota | Identical window + limit | ALIGNED |
| Reset | Next UTC month start; **no rollover** | ALIGNED |
| Cadence default | **Monthly** (paid beta); annual requires affirmative selection | ALIGNED (FE storage + create checkout) |
| Consume triggers | Durable successful finalization only | ALIGNED |
| Genesis commission | 30% first eligible net (ex-tax) | ALIGNED (ledger); UI first-payment-only |
| Illustrative Genesis | $14.70 monthly / $147.00 annual | ALIGNED (display constants; not hardcoded in handlers) |
| $9 unlock | Agreement-scoped; not Pro | ALIGNED (session path; Stripe subscription refused) |
| Plus / unlimited Pro | Retired / not a buyer SKU | ALIGNED |
| Customer ROI | Hypothesis only | **NOT VALIDATED** — needs real cohort data |

`$49` remains a paid-beta pricing hypothesis. Code consistency is not customer ROI validation.
