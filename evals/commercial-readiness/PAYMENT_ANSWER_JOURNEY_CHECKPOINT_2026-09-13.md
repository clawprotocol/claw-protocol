# Payment-answer customer journey checkpoint — 2026-09-13

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `23a43f11` (`23a43f11a9943f445343f28dfc121879c00a9f94`) — payment-clarification guard checkpoint. Working tree matched that commit except untracked `evals/commercial-readiness/results/`. Nothing was reset or overwritten. Nothing was pushed.

This is **not** a launch authorization and is **not** a live-model quality pass. No provider calls, deployment, billing changes, ledger writes, or unrelated sitemap/feature work.

## Official stub workflow identity

Product source used for the official gate (working-tree contents of the gate fingerprint list, including the payment guard and every changed production dependency):

`23a43f11a9943f445343f28dfc121879c00a9f94+src-5e37c79840ff88279c4cea9b424aa762a39e6b13+run-20260914T004243Z-26719`

Evidence (not committed):

`evals/commercial-readiness/results/core-paid-journey-acceptance/23a43f11a994-src-5e37c79840ff-live-4188-4189-stub-model-run-20260914T004243Z-26719`

Fingerprint list now includes `backend/agreements/premium_full_draft_quality_gate.py`, `frontend/src/components/agreements/proAgreementCompleteness/revisionQuestionEngine.ts`, `paymentClarificationSession.ts`, `PaymentClarificationAdvisory.tsx`, `paidProVisibleDocumentShell.tsx`, and `SimpleProFinalReviewScreen.tsx`, plus the existing `AgreementBuilderIntake.tsx` / `agreements_v2_api.py` entries.

`backend/routers/agreements_v2_api.py` was **not** modified in this batch (`204685e52a2fbf0c9fa7a9b1ad5972944a6d9806` before and after).

Production `tsc -b && vite build` ran on the same frontend product source before the final e2e assertion-only fingerprint change (`src-9a6b116392c2` product tree). The spec-only follow-up did not change compiled application modules.

Harbor filled intake is unchanged: fixed $48,000, no invoicing schedule, no net-30. Payment terms were not added to manufacture a pass.

## Source hashes (HEAD `23a43f11` → this working tree)

| File | Before (HEAD) | After |
|---|---|---|
| `backend/agreements/premium_full_draft_quality_gate.py` | `45a200c5552e75fd4b85a7dec1795857b15200ae` | `8fb654584661d0d5b7afb20fc3335044148274cc` |
| `backend/routers/agreements_v2_api.py` | `204685e52a2fbf0c9fa7a9b1ad5972944a6d9806` | `204685e52a2fbf0c9fa7a9b1ad5972944a6d9806` (unchanged) |
| `frontend/.../revisionQuestionEngine.ts` | `c912e6de2a0b0adce0d505c8bf6bb0bc75e33222` | `b37141426ba2443bb6493bf559862d2cab0c0b25` |
| `frontend/.../paymentClarificationSession.ts` | (new) | `dc6079c23ef51eda764258c42e7a00463c0d6f18` |
| `frontend/.../PaymentClarificationAdvisory.tsx` | (new) | `f02d7b54a7c377a2d1d6931b73db436b99e3a427` |
| `frontend/.../paidProVisibleDocumentShell.tsx` | `b2e529e433af26ac035e494913f886926c99b5f0` | `1b4efa5cb747892cffc3c993c2b34e59a32e5805` |
| `frontend/.../SimpleProFinalReviewScreen.tsx` | `44bb384b23b72a2afac4eae4c2710ab4337ae85a` | `93b59c9c042743f600412049729c22ed53ce181e` |
| `frontend/.../AgreementBuilderIntake.tsx` | `70ef8cf6deb82f78a9895af1c88139e7a19b6133` | `e61207ab5211079f9a4d86f7fb76db7e4285309b` |
| `frontend/e2e/.../corePaidJourneyAcceptance.live.spec.ts` | `f6cb20922b168cf103ca93ae77aae10adea3e238` | `10eb6359fffead1aec2db56d46de2b3e56742b03` |
| `scripts/run_core_paid_journey_acceptance_gate.sh` | `d3b078e758ae0dc2494b16a684babe30aaaa762c` | `d8ab0226e7fbed505a111c1a9c7b3f615f45b05e` |

## Customer-visible outcomes

1. **Invoice date is kept in the payment clause.** “Invoice once on October 1, 2026. Payment due net 60.” writes both the invoicing date and the deadline into Fees and Payment. Term/recital October 1 is not treated as a substitute.
2. **Later explicit answers resolve earlier TBD.** Intake or leftover “Payment timing is TBD” does not wipe a later confirmed cadence/date/deadline or re-ask the combined timing question.
3. **Weekly then monthly leaves one cadence.** Sequential correction replaces weekly. “Invoice weekly and monthly” in one statement stays unresolved and does not leave both cadences on the paper.
4. **Official Harbor review shows the payment question** on `SimpleProFinalReviewScreen` (advisory panel outside the article testid). Partial “Invoice monthly” leaves only “When is payment due?”. Completing the answer updates the painted Fees article through `ensurePremiumCompletion` (production `premium-full-draft` + payment guard) and `commitPaidProUserApprovedRevision`. Reload keeps the same agreement id, confirmed answers, and payment clause without re-asking. Dashboard reopen of `/app/agreements/:id/view` shows the same Harbor identities and the same once-on-October-1 / net-60 clause. Official I2 party-name `agreement-intake-clarification` was not used as a substitute.

## `canProceedWithoutAnswer` (unchanged)

Payment items remain `severity: "material"` and `canProceedWithoutAnswer: true`. They map to DealVariable `important` / `requiredForExecution = false`. Review, share, and sign stay available while payment timing is unanswered. No new waiver and no flag flip.

Official I2 is still the party-name intake panel, not these post-draft payment items.

## Focused proof

| Check | Result |
|---|---|
| “Invoice once on October 1, 2026. Payment due net 60.” retains date + net 60 in the payment section | pass |
| Later explicit answer resolves earlier TBD; old intake TBD does not re-ask | pass |
| Weekly then monthly leaves monthly only | pass |
| Simultaneous weekly and monthly stays unresolved | pass |
| Harbor intake still has no payment terms | pass |
| Frontend question overlay matches backend facts; semantic/body gaps do not re-ask after confirmed answers | pass |
| `canProceedWithoutAnswer` remains true | pass |

`backend/tests/test_payment_clarification_guard.py` + `backend/tests/test_unconfirmed_payment_timing_replay.py`: **18 passed**  
Focused vitest (saved replay + family regression + session): **26 passed**

## Verification on final product source

| Check | Result |
|---|---|
| Official desktop/mobile core gate | **12/12 tests**, required rows complete, `gate_green=True`, exit 0 |
| Core matrix/authority unit checks | **19/19** |
| Production `tsc -b && vite build` | passed (product source; see identity note above) |
| Full frontend suite | not rerun |

## Earlier evidence (preserved, with original limitations)

| Run | Limitation |
|---|---|
| `23a43f11+src-c22dde51…-21415` | Payment panel hidden behind SoT-as-acceptance and mounted only on the bypassed document shell. Official I1–C2 still 10/10. Playwright 10 passed / 2 failed. |
| `23a43f11+src-1bd8b21d6616…-23009` | Sandbox Chrome `EPERM`; not a product result. |
| `23a43f11+src-1bd8b21d6616…-23457` | First out-of-sandbox attempt hit leftover workspace-access failure, then a clean rerun of the same fingerprint (`…-24156`) kept official I1–C2 10/10. Payment apply threw `payment_clarification_apply_unavailable` after checkout cleared the generation runner. |
| `23a43f11+src-9a6b116392c2…-25606` | Payment clause updated (once on October 1, 2026 / net 60) on desktop and mobile. Failed only because the dashboard view page does not print the agreement UUID in body text. Official I1–C2 remained 10/10. |

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
