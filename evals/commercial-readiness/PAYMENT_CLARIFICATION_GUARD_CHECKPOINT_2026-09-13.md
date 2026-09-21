# Payment-clarification guard checkpoint — 2026-09-13

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `0b326f0a` (`0b326f0aaad56e3478ac9121720c9fa1f8769256`) — payment-timing and notice-order repair checkpoint. Working tree matched that commit except untracked `evals/commercial-readiness/results/`. Nothing was reset or overwritten. Nothing was pushed.

Product/tests commit on this branch: `0649c209` (`0649c209`) — distinguish payment facts from unresolved timing. This checkpoint commit follows it.

This is **not** a launch authorization and is **not** a live-model quality pass. No provider calls, deployment, billing changes, or unrelated work.

## Official stub workflow identity

Product source used for the official gate (working-tree contents of the gate fingerprint list, including `backend/routers/agreements_v2_api.py`):

`0b326f0aaad56e3478ac9121720c9fa1f8769256+src-685bd609a44f39ec178a69a97d64a923d541cb73+run-20260913T235214Z-17943`

Evidence (not committed):

`evals/commercial-readiness/results/core-paid-journey-acceptance/0b326f0aaad5-src-685bd609a44f-live-4188-4189-stub-model-run-20260913T235214Z-17943`

The official fingerprint list does **not** include `backend/agreements/premium_full_draft_quality_gate.py`. The isolated gate API loaded that file from the same working tree. Production `tsc -b && vite build` ran on the same frontend source after the payment-question engine change.

Saved live consulting directory remains untracked and unused for spend:

`evals/commercial-readiness/results/quality-eval-live/20260913T231438Z-12993/`

Committed replay fixture (sanitized; no keys; no `results/` tree):

`evals/commercial-readiness/fixtures/consulting-unconfirmed-payment-replay.json`

Harbor filled intake is unchanged: fixed $48,000, no invoicing schedule, no net-30. Payment terms were not added to manufacture a pass.

## Defects repaired

The prior guard treated almost any payment-related phrase as full confirmation. Matching `payment timing`, `invoice monthly`, or `net 60` authorized saved installment / net-30 paper. Fixture-specific sentence deletion collapsed `3. FEES AND PAYMENT` + fee + `4. TERM` into a broken heading. Sixty-day invoice windows escaped when the saved failure used thirty days.

Shared production path now:

1. Distinguishes **supplied facts** (explicit cadence **and** deadline), **unresolved** wording (TBD / to be agreed in the same sentence as payment/invoice/due/net/timing), and **contradictions** (net-60 vs saved net-30; “one installment” vs “one or more installments”).
2. Asks only what is still missing: combined timing, invoice cadence only, or due date only.
3. Strips unconfirmed timing phrases from the Fees/Payment section with generic net-N / word-day / after-invoice / installment patterns. Heading, fee amount, next section, and unrelated terms (including a thirty-day termination cure) stay.
4. Applies supplied facts onto the cleaned fee sentence when both facts are present and consistent. Where safe correction is uncertain, the working draft stays clearly unresolved rather than authorizing contradictory paper.
5. `generation_outcome` is `needs_details` when any of the three payment questions is present.

No parallel drafting pipeline. Accepted/signed bytes are not rewritten. `canProceedWithoutAnswer` was not flipped.

## `canProceedWithoutAnswer` at acceptance and signing (existing policy)

Payment clarification items remain `severity: "material"` and `canProceedWithoutAnswer: true` in `revisionQuestionEngine.ts`.

`missingVariableExtractor.ts` maps `payment_due` and `invoice_cadence` onto category `payment_timing`. Material + `canProceedWithoutAnswer: true` yields DealVariable severity `important` and `requiredForExecution = false`.

`guidedQuestionGate.ts` lists `payment_timing` as a fatal category **only when** `requiredForExecution` is true. Advisory payment questions therefore do **not** block review / share / sign CTAs. A long body with `needs_details` remains `authoritative_draft_complete_with_recommended_clarifications`.

**Existing unresolved-term bypass:** the customer can still proceed to review and signing with payment timing unanswered. This repair reports that policy. It does not add a new waiver, flip the flag, or change access.

Official I2 still uses `agreement-intake-clarification` (party-name panel), not these post-draft material items.

## Focused proof

| Check | Result |
|---|---|
| “Payment timing is TBD” stays unresolved; invented installments / after-invoice language stripped | pass |
| “Invoice monthly” asks only “When is payment due?” | pass |
| Explicit net-60 does not authorize saved net-30 or “one or more installments”; cadence still asked | pass |
| `3. FEES AND PAYMENT` / `$48,000` / `4. TERM` / “Twelve months.” survive unconfirmed-timing strip | pass |
| Unconfirmed sixty-day invoice wording is detected even when saved failure used thirty days; cure thirty-day language kept | pass |
| Complete answers reach the working draft (one installment + net 30); questions clear | pass |
| Sanitized fixture is committed and contains no credentials | pass |
| Targeted question appears on Harbor intake + saved draft; intake still has no payment terms | pass |
| Partial monthly answer retains the due-date question | pass |
| Complete answers are not re-asked; refresh/reopen preserves document identity | pass |
| Accepted/signed visible paper (`13` before `11`) is immutable | pass |

`backend/tests/test_payment_clarification_guard.py` + `backend/tests/test_unconfirmed_payment_timing_replay.py`: **14 passed**  
Focused vitest (saved replay + family regression): **23 passed**

## Verification on final product source

| Check | Result |
|---|---|
| Official desktop/mobile core gate | **10/10 tests**, required rows complete, `gate_green=True`, exit 0 |
| Core matrix/authority unit checks | **19/19** |
| Production `tsc -b && vite build` | passed |
| Full frontend suite | not rerun |

`test_premium_full_draft_invokes_repair_on_quality_fail` still returns 503 `agreement_validation_failed` for the thin logo fixture after the earlier validation-withhold boundary. That assertion was not weakened.

## Ledger (inspected, not modified)

File: `evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3`  
Code: `backend/quality_eval_budget.py` (`LIMITS` unchanged)

| Item | Value |
|---|---|
| Ceiling | **$8.00**, model `gpt-5.4`, not halted |
| Total attempts | **11 / 16**, remaining **5** |
| Known-usage cost upper | **$0.249751** |
| Reserved upper | **$0.611731** |
| Unknown-usage attempts | **0** |

| Bucket | Used | Cap | Remaining |
|---|---|---|---|
| parse | 3 | 4 | 1 |
| clarification | 0 | 4 | 4 |
| **primary** | **2** | **2** | **0** |
| repair | 1 | 2 | 1 |
| revision | 0 | 2 | 2 |
| negotiation | 0 | 1 | 1 |
| **bootstrap_parse** | **2** | **2** | **0** |
| bootstrap_one_pager | 3 | 4 | 1 |

Provider spending did **not** increase. No live model calls, Stripe, email, push, or deploy.

## Live-testing reconciliation (not authorized)

This prompt does **not** authorize further live generation. Before any later live-testing proposal, **every** required bucket must be reconciled — not only primary.

Already exhausted:

- `primary` **2 / 2**
- `bootstrap_parse` **2 / 2**

A primary-only cap change would still leave `bootstrap_parse` exhausted. Do not increase limits, reset counters, relabel attempts, or treat remaining parse / repair / revision / clarification / negotiation / `bootstrap_one_pager` slots as a substitute for those two buckets. No live-testing proposal is made here.

## Remaining defects

- Live-model quality remains unproven except the prior consulting retry, which still is not commercial acceptance. SaaS live dispatch and recipient actions on real-model paper were not exercised.
- Opening “Effective Date” vs term start date, and limited scope/acceptance detail (`undefined_acceptance_criteria`), were out of this repair.
- Unresolved payment timing can still proceed to review/signing under the existing `canProceedWithoutAnswer: true` policy.
- Settings/admin, sitemap, full-suite cleanup, and live-service testing were not started.

No launch claim.
