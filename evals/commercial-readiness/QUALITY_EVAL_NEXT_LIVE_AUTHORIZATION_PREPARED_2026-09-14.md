# Next live quality-eval authorization — prepared, not executed

Prepared 2026-09-14 after the offline customer-meaning correction.  
**Do not run `--live`. Do not activate the increment sidecar. Do not renew repair.**

This is not a live-quality pass and not launch authorization.

## Ledger (inspected only; not modified)

`evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3`

| Field | Value |
|---|---|
| Attempts | **15** (all `complete`) |
| Reserved | **1,941,421** units / **$0.970711** |
| Known usage | **$0.366909** |
| Ceiling | **$8.00** / 16,000,000 units |
| Model | `gpt-5.4` |
| Halted | no |
| `primary` | 3 |
| `parse` | 4 |
| `bootstrap_parse` | 3 |
| `repair` | 2 |
| `bootstrap_one_pager` | 3 |

Previous increment sidecar `quality-eval-increment-20260914.inactive.json` remains **`active: false`**.  
If that sidecar were still attached: **one `primary` remaining**, **zero `repair` remaining**, global **15/20**.

That leftover primary is not enough for a fresh Harbor + SaaS quality pair. Repair is exhausted and must not be renewed by this card.

## What this batch already used

Failed live Harbor sample: `quality-eval-live/20260914T195201Z-5037`. Repair allowance under the previous increment is **used**. SaaS was not live-generated.

Offline correction `quality-eval-offline-journey/20260914T204736Z-13517` made **no provider calls**.

## What a later explicit approval would have to say

A new live Harbor + SaaS quality run needs a **new** written authorization that:

- keeps this ledger (no replacement, no counter reset, no `LIMITS` raise)
- does **not** restore or add `repair`
- states any new `primary` / `parse` / `bootstrap_parse` / `clarification` allowances
- requires matching preflight + offline-journey source hashes
- leaves `canProceedWithoutAnswer: true` unchanged
- does not shorten customer inputs/outputs or downgrade models to fit the budget

Until that approval exists, remaining dollars and the leftover primary slot **do not authorize** `--live`.

## Do not

- Activate `quality-eval-increment-20260914.inactive.json`
- Create a new increment that renews repair
- Execute `--live` from this card
- Push, deploy, or mutate hosted state
