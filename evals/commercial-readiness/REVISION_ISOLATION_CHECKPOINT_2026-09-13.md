# Revision isolation at the save-and-display boundary — 2026-09-13

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `b34bd2ab` (`b34bd2abb60d7218339568d027bfbd7f1a4b38b3`) — payment-answer isolation checkpoint. Working tree matched that commit except untracked `evals/commercial-readiness/results/`. Nothing was reset or overwritten. Nothing was pushed.

This is **not** a launch authorization and is **not** a live-model quality pass. No provider calls, deployment, billing changes, ledger writes, or unrelated sitemap/feature work.

Payment wording from `feca9856` / `b239613b` / `b34bd2ab` is preserved. Advisory/signing policy is unchanged: payment items stay `canProceedWithoutAnswer: true`.

## Official stub workflow identity

Product source used for the official gate and the production build (working-tree contents of the gate fingerprint list):

`b34bd2abb60d7218339568d027bfbd7f1a4b38b3+src-3790aeb0a626e29dbf07da10cb99b1dd97eba5bf+run-20260914T025812Z-46358`

Evidence (not committed):

`evals/commercial-readiness/results/core-paid-journey-acceptance/b34bd2abb60d-src-3790aeb0a626-live-4188-4189-stub-model-run-20260914T025812Z-46358`

`backend/routers/agreements_v2_api.py` and `backend/agreements/premium_full_draft_quality_gate.py` were **not** modified in this batch.

Harbor filled intake is unchanged: fixed $48,000, no invoicing schedule, no net-30.

## Source hashes (HEAD `b34bd2ab` → this working tree)

| File | Before (HEAD) | After |
|---|---|---|
| `frontend/.../paidProRevisionOperation.ts` | (new) | `f68462bbd4d95a4f6f903ad27738aad8b0b357f3` |
| `frontend/.../paidProUserApprovedRevisionCommit.ts` | (new) | `c00366c30ec49e1ea28c20eb32198a4343b50c4b` |
| `frontend/.../paymentClarificationSession.ts` | `8e3b019a12f2ca18ae8930f2425782d9d0d28c0e` | `acced7a1394f27589906ac8b30745f197f5d301e` |
| `frontend/.../AgreementBuilderIntake.tsx` | `86e092c8e3097dcd26600d86ce478916dc99c1b6` | `6682b7084ea1af6115ecdb3de96d2c838eb2abbd` |
| `frontend/.../canonicalReviewSnapshotApi.ts` | `206aa76b53375457a04d0b354e56eb49ce0c3c33` | `05a5ae11b27e47e02954da407faf19c7f162531d` |
| `frontend/.../PaymentClarificationAdvisory.tsx` | `74171481c550ba459021415dcfe1fe1fbbd487d1` | `f6454354f0301ed34fd316fc5a8f77c3f8903717` |
| `frontend/.../paidProVisibleDocumentShell.tsx` | `1b4efa5cb747892cffc3c993c2b34e59a32e5805` | `be616c22131cb6bd09d81a96fee0fba7a7cd8020` |
| `frontend/.../SimpleProFinalReviewScreen.tsx` | `162e5515c01d3472c9b4114f741f76ca1d326e15` | `b5902ab5ded2ebfb0311d770b4777a7ef20a8818` |
| `frontend/.../revisionQuestionEngine.ts` | `a1be330b89f060abf18bb7c82f4efcddaf7f9db3` | `70ba8be251197b470cbb3b4472bda849b8cb9bdc` |
| `frontend/e2e/.../corePaidJourneyAcceptance.live.spec.ts` | `6e9a273b9ceb32fe7d64d2ee1ba4a5c17d44437a` | `9cea3b2b4f47e501f8626b168305f6b799b21f83` |
| `backend/routers/agreements_v2_api.py` | `204685e52a2fbf0c9fa7a9b1ad5972944a6d9806` | unchanged |
| `backend/agreements/premium_full_draft_quality_gate.py` | `8fb654584661d0d5b7afb20fc3335044148274cc` | unchanged |

## Customer-visible outcomes

1. **Revision-aware records and handlers.** A lookup for agreement A revision V2 no longer returns V1’s record or handler. `matchesScope` and `handlerKey` require `revisionId` when an agreement id is present. Applied answers are not copied onto a newer revision. V2 with guarded paper still asks timing.
2. **Production save race.** `commitPaidProUserApprovedRevisionCorpus` exercises the real `prepareCommercialReviewSnapshotAuthority` path, including its awaited hold. Persist is allowed only while the **active request** still matches and the live org still matches the operation. Display mutations, pipeline replace, SoT establish, and global display-authority writes run only when the live view is still that agreement. A valid A persist after a switch to B does not repaint B or POST B. A superseded V1 request does not overwrite V2 paper. Request identity is compared to the active operation, not a captured request id copied back into “current” state.
3. **Honest recovery.** Successful A persist is kept even when display is denied. Org switch aborts persist before a write with the wrong org headers. Response loss leaves questions visible. Intake can be recovered for a later apply without borrowing another revision’s applied answers.
4. **Wrapped invoice date.** `2026. Payment is due net 60.` is no longer treated as a new top-level section, so authorized Fees text still confirms net-60 after a mid-date wrap.
5. **Fresh-context `/view` paper.** A new browser context with empty payment `sessionStorage` still restores once-on-October-1 / net-60 from authorized GET paper. The panel does not re-ask.
6. **Editable reopen after delayed save.** After a held complete-revision POST, SPA navigation to `/app`, release, and `/app/create?agreementId=` reopen, the painted Fees clause is once-on-October-1 / net-60 / $48,000 and the panel is absent on that create URL. That is not the `/view` read-only proof.
7. **Preserved wording and workflows.** Invoice date, net-60, cadence correction, $48,000, notice order, official review/direct-sign, and immutable accepted/signed paper remain. Official I2 is still party-name `agreement-intake-clarification`.

## `canProceedWithoutAnswer` (unchanged)

Payment items remain `severity: "material"` and `canProceedWithoutAnswer: true`. Review, share, and sign stay available while payment timing is unanswered. No new waiver and no flag flip.

## Focused proof

Failing regressions were written first on `b34bd2ab` (V2 returned V1’s record/handler; production commit path was not yet isolated), then closed.

| Check | Result |
|---|---|
| A V2 lookup does not return V1 record or handler | pass |
| V2 does not inherit V1 confirmed status | pass |
| Delayed A prepare does not repaint B or write B | pass |
| Superseded V1 does not overwrite V2 paper | pass |
| Org switch aborts persist before wrong-org headers | pass |
| Copied request id is not treated as the active request | pass |
| Wrapped `October 1,\\n\\n2026. Payment is due net 60.` still confirms due | pass |
| Fresh-context `/view` questions restore from authorized paper | pass |
| Harbor intake still has no payment terms | pass |
| Invoice date, net-60, cadence correction, $48,000, notice order | pass |
| `canProceedWithoutAnswer` remains true | pass |

`backend/tests/test_payment_clarification_guard.py` + `backend/tests/test_unconfirmed_payment_timing_replay.py`: **18 passed**  
Focused vitest (session + production commit + saved replay + family regression + coverage + snapshot API): **59 passed** on the isolation suites (later 42 on the wording/family subset after the wrap fix)

## Verification on final product source

| Check | Result |
|---|---|
| Official desktop/mobile core gate | **12/12 tests**, required rows complete, `gate_green=True`, exit 0 |
| Core matrix/authority unit checks | **19/19** |
| Production `tsc -b && vite build` | passed on the same product tree as `src-3790aeb0a626` |
| Full frontend suite | not rerun |

## Earlier evidence (preserved, with original limitations)

| Run | Limitation |
|---|---|
| `b34bd2ab+src-6c143750…-38556` | Delayed monthly apply, then `/app/create` remount, then net-60 apply failed `payment_clarification_apply_unavailable` after dashboard session reset. |
| `b34bd2ab+src-f0b3200c…-39638` | Same remount apply failure after intake recovery. |
| `b34bd2ab+src-ac990595…-40610` | Delayed **complete** save persisted (once / net-60). Editable reopen paper matched; panel still asked due because `2026.` was parsed as a section heading. |
| `b34bd2ab+src-e74dfccb…-41887` | Delayed save + same-session create reopen + fresh `/view` passed. Extra fresh-context `/app/create?agreementId=` did not paint latest snapshot paper via `articleText`. |
| `b34bd2ab+src-06be4586…-42946` | Same fresh-create hydrate gap on `body` text. |
| `b34bd2ab+src-35d785fe…-44336` | Same-session create paper passed; brittle signer-CTA name check failed. |
| `b34bd2ab+src-cdb1b0ef…-45288` | 12/12 before the `parseDraft` await type fix. Production `tsc -b` then failed until that await. Official identity is the post-fix tree below. |

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

- A brand-new browser context opening `/app/create?agreementId=` still does not reliably restore the latest GET snapshot paper the way `/view` does. Same-session create reopen after the delayed save does. Fresh-context `/view` does.
- Apply after a dashboard session reset can still fail if intake and structured draft are both gone; pending stays recoverable. That path is no longer required for the official payment proof.
- Live-model quality remains unproven except the prior consulting retry, which still is not commercial acceptance. SaaS live dispatch and recipient actions on real-model paper were not exercised.
- Opening “Effective Date” vs term start date, and limited scope/acceptance detail (`undefined_acceptance_criteria`), were out of this repair.
- Unresolved payment timing can still proceed to review/signing under the existing `canProceedWithoutAnswer: true` policy. That policy was not separately approved for change.
- Official `/app/agreements/:id/view` still does not print the agreement UUID in body text; reopen proof is URL + authorized paper.
- Settings/admin, sitemap, full-suite cleanup, and live-service testing were not started.

No launch claim.
