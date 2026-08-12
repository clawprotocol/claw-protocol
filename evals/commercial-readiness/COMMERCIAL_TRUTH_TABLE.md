# Commercial truth table (GTM launch contract)

**Buyer plans:** Guest and Pro only. Plus retired. Genesis = affiliate status only.

| Fact | Contract |
|---|---|
| Pro price | **$49/month** |
| Pro quota | **10 successfully finalized premium agreements** / billing period |
| Quota unit | Consumed only after **successful, durable finalization** |
| Non-consuming | Previews, drafts, failed gens/finalizations, retries, repairs, duplicates, recovery |
| Reset | Each billing period; **no rollover** |
| Cancellation | Access through paid period; no subsequent reset/renewal |
| Genesis commission | **30% of first eligible net Pro payment** (after discounts, **excluding tax**), payable after refund window. At standard $49 → **$14.70** (calculated, not hardcoded) |
| Commission exclusions | Renewals, retries, duplicate webhooks, failed payments, refunds, self-referrals, later invoices |

## Alignment checklist

| Surface | Expected | Status |
|---|---|---|
| BE `pricing.py` Pro monthly | $49.00 | ALIGNED |
| BE default finalize allowance | 10 | ALIGNED |
| BE Genesis commission | 30% of `eligible_net_payment_cents` (tax excluded); first invoice only | ALIGNED |
| FE pricing / paywall / billing copy | $49 / 10 | ALIGNED |
| FE affiliate display constant | Illustrative $14.70 from $49 × 30% | ALIGNED |
| Tests lifecycle / GTM contract | $49 → $14.70; quota 10 | ALIGNED |
