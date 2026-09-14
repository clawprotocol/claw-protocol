# Payment-answer isolation and update-consistency checkpoint — 2026-09-13

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `bb732d98` (`bb732d98b2ab418e4a9ef8e84f9786fe1fbe4e5d`) — payment-answer customer journey checkpoint. Working tree matched that commit except untracked `evals/commercial-readiness/results/`. Nothing was reset or overwritten. Nothing was pushed.

This is **not** a launch authorization and is **not** a live-model quality pass. No provider calls, deployment, billing changes, ledger writes, or unrelated sitemap/feature work.

Payment wording from `feca9856` / `bb732d98` is preserved. Advisory/signing policy is unchanged: payment items stay `canProceedWithoutAnswer: true`.

## Official stub workflow identity

Product source used for the official gate and the production build (working-tree contents of the gate fingerprint list):

`bb732d98b2ab418e4a9ef8e84f9786fe1fbe4e5d+src-7e5cd84f6dacab11883e7c70c82c14897bd138dc+run-20260914T013634Z-34809`

Evidence (not committed):

`evals/commercial-readiness/results/core-paid-journey-acceptance/bb732d98b2ab-src-7e5cd84f6dac-live-4188-4189-stub-model-run-20260914T013634Z-34809`

`backend/routers/agreements_v2_api.py` and `backend/agreements/premium_full_draft_quality_gate.py` were **not** modified in this batch.

Harbor filled intake is unchanged: fixed $48,000, no invoicing schedule, no net-30.

## Source hashes (HEAD `bb732d98` → this working tree)

| File | Before (HEAD) | After |
|---|---|---|
| `frontend/.../paymentClarificationSession.ts` | `dc6079c23ef51eda764258c42e7a00463c0d6f18` | `8e3b019a12f2ca18ae8930f2425782d9d0d28c0e` |
| `frontend/.../PaymentClarificationAdvisory.tsx` | `f02d7b54a7c377a2d1d6931b73db436b99e3a427` | `74171481c550ba459021415dcfe1fe1fbbd487d1` |
| `frontend/.../AgreementBuilderIntake.tsx` | `e61207ab5211079f9a4d86f7fb76db7e4285309b` | `86e092c8e3097dcd26600d86ce478916dc99c1b6` |
| `frontend/.../SimpleProFinalReviewScreen.tsx` | `93b59c9c042743f600412049729c22ed53ce181e` | `162e5515c01d3472c9b4114f741f76ca1d326e15` |
| `frontend/.../revisionQuestionEngine.ts` | `b37141426ba2443bb6493bf559862d2cab0c0b25` | `a1be330b89f060abf18bb7c82f4efcddaf7f9db3` |
| `frontend/.../proAgreementCompleteness/index.ts` | `503e72c58f6ff12320bf5bacf2a0fbccc3a69029` | `5fd52dec30027df4aa660c0d10ae1bb30d97680e` |
| `frontend/src/auth/userSessionState.ts` | `a84e514a36baf249742db05507289ebc26685702` | `8c4e90d81b51ecf2825e56d17baad53ff07de0ca` |
| `frontend/e2e/.../corePaidJourneyAcceptance.live.spec.ts` | `10eb6359fffead1aec2db56d46de2b3e56742b03` | `6e9a273b9ceb32fe7d64d2ee1ba4a5c17d44437a` |
| `backend/routers/agreements_v2_api.py` | `204685e52a2fbf0c9fa7a9b1ad5972944a6d9806` | unchanged |
| `backend/agreements/premium_full_draft_quality_gate.py` | `8fb654584661d0d5b7afb20fc3335044148274cc` | unchanged |

## Customer-visible outcomes

1. **Exact identity.** Reading agreement B with empty answers never returns A’s record. Latest-row fallback and implicit `"pending"` borrow are gone. Records and apply handlers are scoped to authenticated user, org, agreement, and revision. A pre-ID draft is rebound only onto the matching durable id.
2. **Pending versus confirmed.** Typing or submitting is not successful application. Pending answers stay recoverable. Applied status is set only after the matching server revision persists. Generation failure, persist failure, and response loss leave the question visible and do not claim the article changed.
3. **Stale-response protection.** Payment apply captures `{userId, organizationId, agreementId, revisionId, requestId}` before `ensurePremiumCompletion` and revalidates before persist and display. `isPremiumRequestStillValid: () => true` is gone from this path. A delayed A response does not update B, another org, or a newer revision.
4. **Logout / org-switch.** `clearLawdogUserSessionState` and org-context subscribe clear the client payment cache only. Browser storage is not server authority.
5. **Fresh-context authorized reopen.** A new browser context with empty payment `sessionStorage`, seeded owner auth, and `/app/agreements/:id/view` restores the once-on-October-1 / net-60 Fees clause from authorized GET paper. The panel does not re-ask.
6. **Preserved wording and workflows.** Invoice date, net-60, cadence correction, $48,000, notice order, official review/direct-sign, and immutable accepted/signed paper remain. Official I2 is still party-name `agreement-intake-clarification`.

## `canProceedWithoutAnswer` (unchanged)

Payment items remain `severity: "material"` and `canProceedWithoutAnswer: true`. Review, share, and sign stay available while payment timing is unanswered. No new waiver and no flag flip.

## Focused proof

Failing regressions were written first (13 failures on `bb732d98` session API), then closed.

| Check | Result |
|---|---|
| A then B with empty answers — B does not return A | pass |
| No latest-row fallback; no implicit pending borrow | pass |
| Bind only the matching pre-ID draft | pass |
| Logout and org-switch clear the client cache | pass |
| Typing/submit is pending until matching persist | pass |
| Generation/persist failure keeps pending and the question | pass |
| Response loss reconciles from authorized Fees section, not sessionStorage | pass |
| Delayed A apply does not write B / other org / newer revision | pass |
| Fresh-context questions restore from authorized paper | pass |
| Term dates are not payment-section confirmation | pass |
| Harbor intake still has no payment terms | pass |
| Invoice date, net-60, cadence correction, $48,000, notice order | pass |
| `canProceedWithoutAnswer` remains true | pass |

`backend/tests/test_payment_clarification_guard.py` + `backend/tests/test_unconfirmed_payment_timing_replay.py`: **18 passed**  
Focused vitest (session isolation + userSessionState + saved replay + family regression): **40 passed**

## Verification on final product source

| Check | Result |
|---|---|
| Official desktop/mobile core gate | **12/12 tests**, required rows complete, `gate_green=True`, exit 0 |
| Core matrix/authority unit checks | **19/19** |
| Production `tsc -b && vite build` | passed on the same product tree as `src-7e5cd84f6dac` |
| Full frontend suite | not rerun |

## Earlier evidence (preserved, with original limitations)

| Run | Limitation |
|---|---|
| `bb732d98+src-1643c821…-29502` | Fresh-context `sessionStorage` read ran on `about:blank` (`SecurityError`). Payment apply/reload/same-tab reopen had already succeeded. |
| `bb732d98+src-2765a9f3…-31213` | Fresh view read ran before GET paint (`Loading agreement…`). |
| `bb732d98+src-2c8c75ab…-32057` | Payment desktop + mobile passed, including fresh-context reopen. Mobile direct-sign Jordan ceremony did not complete (`server=[]`). Treated as flake; same fingerprint later passed 12/12 (`…-33704`). |
| `bb732d98+src-2c8c75ab…-33704` | 12/12 on the pre-`tsc` tree. Production build then failed on `agreementId: string \| null` until the one-line Intake coerce. Official identity is the post-fix tree below. |

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
- Unresolved payment timing can still proceed to review/signing under the existing `canProceedWithoutAnswer: true` policy. That policy was not separately approved for change.
- Official `/app/agreements/:id/view` still does not print the agreement UUID in body text; reopen proof is URL + authorized paper.
- Settings/admin, sitemap, full-suite cleanup, and live-service testing were not started.

No launch claim.
