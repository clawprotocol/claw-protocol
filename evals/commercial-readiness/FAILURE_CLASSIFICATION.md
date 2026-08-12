# Remaining failure classification (commercial-contract pass)

Buckets: **critical runtime defect** | **approved expectation change** | **evaluation-only debt** | **blocked product-policy issue**.

Authoritative FE exclusion inventory: [`EXCLUDED_FRONTEND_FAILURES.md`](./EXCLUDED_FRONTEND_FAILURES.md).

## Closed this pass (commercial contract)
| Item | Bucket → resolution |
|---|---|
| Pro quota metered creates | critical/contract → `agreements_finalized_since` / `meter: finalized` |
| Genesis commission every invoice / $39→$11.70 | contract → first settled Pro invoice $29.70; tests updated |
| Legacy `affiliate_earnings` double-pay / recurring | contract → skip when Genesis attribution; first-invoice-only; 30% bps |
| Checkout expanded sub missing org metadata | critical → enrich session metadata/customer into subscription object |
| Plus / unlimited buyer copy | contract → Guest+Pro cards; Pro = 25 finalized |
| Concurrent final-signer duplicate email | prior pass → lock; lifecycle asserts exactly one send |
| Premium draft API bypass without Pro | prior pass → `require_paid_pro_principal` |

## Remaining — may not be quarantined as evaluation-only
| Item | Bucket | Notes |
|---|---|---|
| ~432 FE failures in auth / billing / entitlements / integrity / recovery / signing | **critical runtime or contract** (see exclusion manifest) | Excluded from *this* focused suite only; **block COMMERCIAL BETA READY** |
| Contact/notice tests expecting invented emails | blocked product-policy | Never invent; entry or explicit omission |
| Termination/acceptance without template/custom/omit | blocked product-policy | Require explicit add/omit |
| `STATE_GENESIS` complimentary create entitlement | blocked product-policy / contract | Genesis must be affiliate-only; ops dual-read remains |

## Remaining — evaluation-only (quarantine allowed)
| Item | Bucket |
|---|---|
| Snapshot / chrome / copy polarity FE (~96 after triage bucket) | evaluation-only debt — no bulk snapshot updates |
| Draft-quality H0 / paid LLM evals | evaluation-only debt — out of scope |
| Full backend suite beyond focused commercial suite | evaluation-only for this gate only |
