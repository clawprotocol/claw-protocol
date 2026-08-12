# Canonical commercial truth table (post commercial-contract pass)

**Status:** Production contract aligned for Guest/Pro + Genesis affiliate on pricing, Pro finalize-meter, first-invoice commission, and Plus retirement in buyer surfaces. Genesis Dog create-entitlement remains an ops dual-read contradiction.

## Canonical model

| Dimension | Canonical value |
|---|---|
| Buyer-facing plans | **Guest**, **Pro** only |
| Pro price | **$99/month** |
| Pro quota | **25 successfully finalized premium agreements** / billing period |
| Quota non-consumers | Failed generations, previews, retries, system repairs |
| Genesis | **Affiliate/referral role** — not a customer subscription tier |
| Genesis commission | **$29.70** on **first** successfully settled Pro invoice, payable after refund window |
| Plus | **Retired** — must not appear in UI, checkout, Stripe, entitlements, docs, analytics, or tests |
| Notice emails | Never invented — entry or explicit omission |
| Termination / acceptance | Approved template, custom input, or explicit omission |

## Truth table (current code vs canonical)

| Surface | Current | Canonical | Verdict |
|---|---|---|---|
| BE `pricing.py` Pro monthly | $99.00 | $99 | ALIGNED |
| BE Pro `payout_share_bps` | 3000 (30%) | 30% first invoice | ALIGNED |
| BE Pro quota event | `agreements_finalized_since` (`meter: finalized`) | Successfully finalized | ALIGNED |
| BE Pro create deny on exhausted finalize quota | Yes (`policy.py`) | Deny when cap exhausted | ALIGNED |
| BE Genesis state | Not issued for create; `affiliate_status` separate; legacy rows read-only | Affiliate role only | ALIGNED |
| BE premium-full-draft gate | Pro-only via `require_paid_pro_principal` | Pro-only | ALIGNED |
| BE Stripe checkout prices | Pro monthly/annual only | Pro only | ALIGNED |
| BE `get_plan(starter/plus)` | Alias → Pro (unsold compat) | Plus retired | WARNING (compat only) |
| BE Genesis commission | First non-voided invoice; $29.70 on $99 @ 30% | First settled only $29.70 | ALIGNED |
| BE legacy `affiliate_earnings` | Skips when Genesis attribution present; first-invoice-only; 30% bps | No double-pay / no recurring | ALIGNED |
| BE checkout session authority | Enriches expanded subscription with session org/customer | Activate Pro on checkout | ALIGNED |
| FE `pricingTiersData` | Guest + Pro (+ Enterprise sales) | Guest + Pro buyers | ALIGNED |
| FE checkout params | Always Pro; starter/plus → pro | Pro only | ALIGNED |
| FE access policy comments / buyer copy | Guest/Pro; Genesis affiliate wording | Guest/Pro buyers | ALIGNED (UI still has Genesis ops CTAs) |
| FE affiliate presentation | `$29.70` first-invoice constant | First invoice after hold | ALIGNED |
| FE Plus buyer cards | Removed from triad/billing/pricing FAQ | Plus gone | ALIGNED |
| FE residual `plusBlurb` / `continue_plus` experiment keys | Internal experiment ids; buyer copy is Pro/25 | No Plus SKU | WARNING |
| Docs `ENTITLEMENT_MATRIX` | Guest/Pro + Genesis affiliate | Same | ALIGNED |
| Tests genesis / lifecycle | $99 → $29.70 first; finalize meter | Same | ALIGNED |
| Notice / termination contract | Never invent; template/custom/omit | Same | ALIGNED |

## Remaining contradictions (do not claim commercial GTM)

1. **Genesis Dog create entitlement** (`STATE_GENESIS`, 5/mo) still grants buyer-like persist capacity for ops/admin dual-read — contradicts “affiliate role only.”
2. Authenticated workspace UI still exposes Genesis request/activation CTAs (ops path), not a Stripe buyer tier, but can be misread as a plan ladder.
3. Broad FE suite still has many open auth/billing/integrity/recovery/signing failures — see `EXCLUDED_FRONTEND_FAILURES.md` (non-quarantinable).
4. Legacy docs/QA mentions of $39 elsewhere in the repo may remain outside this pass’s commercial-readiness docs.

## Out of scope this pass

Paid LLM evals, H0, architecture rewrite, bulk snapshot/corpus updates, declaring commercial GTM readiness.
