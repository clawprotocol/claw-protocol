# Phase 3B Batch 3 checkpoint — authoritative first review after payment

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `e72dc3cd` (`record phase 3B batch 2.2.1 freeze-policy and completed-signer checkpoint`)  
Nothing was pushed.

This closes the after-payment first-review authority/recovery contract for ten targeted identities. It is **not** a launch authorization. The official full-suite baseline remains **9,471 / 9,262 / 209**. The complete frontend suite was not rerun.

## Controlling contract

1. Paid entitlement authorizes the paid journey. It does not authorize arbitrary document bytes.
2. Agreement paper may mount only from an ownership-verified server pending/accepted canonical snapshot, or a professionally validated server result that is persisted and verified before commercial actions.
3. A short/local recovery body may support a clearly labeled recovery summary. It cannot seed SoT, enable signer finalization, acceptance, send, or signing.
4. Network failure remains retryable. Never silently downgrade to Free Starter or claim a local recovery as completed premium generation.
5. Signed-out/free sessions never receive paid agreement paper.
6. Exact corpus identity is preserved from accepted pipeline result → persisted snapshot → GET → review. Each authority is established once.
7. Generation budget stays one initial request and at most one explicit structural retry.

## Runtime

Shared selector: `frontend/src/components/agreements/paidProFirstReviewAuthoritySelection.ts`

- `hasVerifiedPaidReviewAuthority` / `canMountPaidAgreementPaper` / `canEnablePaidCommercialActions` / `classifyPaidFirstReviewAuthority`
- `normalizePaidProCandidateCompareLen` compares newline/trailing-space-normalized length. No magic 757/758 pad.

Product changes (one shared authority/recovery selection, not ten isolated branches):

- Recovery commit (`tryCommitPostCheckoutRecoveryToPaidProSourceOfTruth`) returns `committed: false` with `recovery_cannot_seed_source_of_truth`. Display-only recovery freeze may still exist.
- Network failure stays `premium_network_retryable` with `premiumNetworkLocalRecovery: false`. A recovery body may attach as labeled display only.
- Delivery-track chrome may report `post_checkout_recovery_display` from a persisted recovery snapshot (in-memory persist fallback when `sessionStorage` is absent). That is chrome, not signing authority.
- Parent rebuild cannot become accepted canonical paint without live SoT.
- Visible shell requires a paid session or a verified/SoT/review-session source. Signed-out/free stays empty.
- Recovery rebuild (`paid_session_intake_rebuild`) is not rewritten through the intake sanitizer or title projection.
- Human identity in recovery (`Marcus Thompson of Apex…` / `Elena Rodriguez of Brightwave…`) stays visible from intake. That visibility is not signable authority.
- Commercial action gates in `paidProPaidSessionLanding.ts` fail closed unless verified server authority exists.
- First-review render returns exact SoT when no live/consumed/labeled signer overlay authority exists. Overlay still runs after consumed signer metadata (TEST406 tail names).
- Readonly pick uses established SoT text, not a hydrated review rewrite.
- Starter-clone length uses normalized candidate length.

## Targeted identities

| Identity | Isolated | Notes |
|---|---|---|
| TEST221 first review, no legacy shell | **2/2** | Product-only: memory persist + recovery-display delivery track. No Starter panels. Recovery is not SoT. |
| TEST225 payment → first review | **green** | Retry fixture is unique operative clauses, not empty “Scope, payment…” filler. Honest `server_full_draft_degraded` is allowed after the structural retry. Call budget unchanged. |
| TEST243 recovery render | **green** | Network fail → `premium_network_retryable`, no SoT, recovery cannot seed SoT. Accepted `server_full_draft` still matches review hash. |
| TEST338 post-checkout accepted corpus | **green** | Fixture has a real IN WITNESS block. Pre-GET paint may be SoT or `review_session_authority`; empty paint is no longer required. |
| `paidProAfterPayReviewScreenGate` Marcus/Elena | **strengthened** | Short rebuild stays visible recovery context. Final-review/signing stay closed until a verified Marcus/Elena snapshot exists; that snapshot then opens paid review. |
| `paidProVisibleDocumentShellPaidSessionFallback` (2) | **strengthened** | Unsigned/free stays empty. Marcus identity may appear in paid-session recovery. `< 1001` branch uses a short snippet, not the now-longer Marcus rebuild. |
| `paidProRenderSurface` starter-clone | **strengthened** | Normalized length compare. Starter-clone rejection retained. |
| `premiumPostPaymentHydration` network-retry | **green** | Product-only: pipeline now matches the existing `premium_network_retryable` assertion. No completed-generation claim. |
| `premiumGenerationApiAvailability` server-draft | **strengthened** | Repeated-placeholder fixture rejected. Successful path uses a substantive Red Mesa corpus. Pick compares to established SoT text. |

Focused after-payment matrix: **9 files, 75/75** (was 74 tests / 64 passed / 10 failed; +1 filler-rejection case).

## Changed legacy assertions (strengthened, not deleted)

| File | Legacy assertion | Why it was strengthened |
|---|---|---|
| `paidProAfterPayReviewScreenGate.test.ts` `dumpCase` | `rebuilt.length < 1001` | Recovery identity can now exceed 1001 without becoming SoT. Length cap was a false proxy for “not authority.” Replaced by `hasPaidProSourceOfTruth() === false`. |
| same `dumpCase` | `canOpenPaidSessionFinalReviewAfterSigners` / `shouldSkipPaidSessionReviewHydrateWait` / finalized `shouldShowPaidSessionFinalReviewActions` were `true` on a short rebuild | A local rebuild is not signable paper. Those gates are now `false` until verified authority exists. Latch teardown is now `true` for recovery-only (do not keep a finalize latch that implies completed review). |
| same `dumpCase` | `shouldShowPaidSessionFinalReviewActions(..., finalized:false)` expected `false` | Redundant once the stronger “finalized still false without authority” assertion exists. Not a deleted rule: the finalized+recovery case now proves the closed gate. |
| same, Marcus/Elena case | Title implied “opens review gate” from rebuild + two signers | Identity stays visible (`Marcus` / `Elena` / California). Added verified pending snapshot proof that paints `verified_server_canonical_review_snapshot` and then opens final-review actions. |
| same, 3- and 4-signer cases | Opened final review from rebuild + names/emails alone | Now `false` without `hasVerifiedPaidReviewAuthority: true`. The verified-authority path remains `true`. |
| same, Send for signature | `canStartPaidSessionSignatureTrackFromFinalReview({ namesAndEmailsComplete })` was `true` | Names/emails without verified paper cannot start signing. Same helper with `hasVerifiedPaidReviewAuthority: true` remains `true`. |
| `paidProVisibleDocumentShellPaidSessionFallback.test.ts` | Used the full Marcus rebuild for the `< 1001` branch | Human+entity recovery rebuild is now longer than 1001. The length-floor branch uses an explicit short snippet. The paid-session identity case still uses the real rebuild and asserts Marcus / $5,500 / California **and** no SoT. |
| same | Unsigned empty only checked `plain === ""` | Also accepts `source === "none"` so signed-out cannot receive paid paper. |
| `paidProRenderSurface.test.ts` | `attemptedLen === starter.length` (757 vs 758 flake) | Compares `normalizePaidProCandidateCompareLen(starter)`. Starter-clone rejection and `premium_unavailable_retry` retained. |
| `premiumGenerationApiAvailability.test.ts` | Established SoT from `"Paid Pro server agreement. ".repeat(200)` (~5,399 chars) | That fixture is repeated filler, not a professional corpus. New negative: it throws `mislabeled_server_full_draft_below_substantive_min`. Successful path uses a padded substantive Red Mesa corpus. Pick equals `getPaidProSourceOfTruthText()`, not the pre-establish input. |
| `paidProTest225PaymentToFirstReviewLatency.test.ts` | Allowed only `server_full_draft_retry` / `server_full_draft` / degraded-local-recovery | After one structural retry the honest outcome can be `server_full_draft_degraded`. Added that source. Retry body is unique operative clauses, not empty “Scope, payment…” filler. Budget still one initial + one retry. |
| `paidProTest243RecoveryRender.test.ts` | Promoted network fail to `premium_network_local_recovery` as completed generation / SoT-adjacent | Now `premium_network_retryable`, commit reason `recovery_cannot_seed_source_of_truth`, first-review paper/shell closed. Accepted `server_full_draft` hash identity retained. |
| `paidProTest338PostCheckoutAcceptedCorpusStillMounts.test.ts` | Fixture lacked a real execution block; pre-GET paint expected empty | Added IN WITNESS. Pre-GET may paint SoT or `review_session_authority` — empty is no longer the required honest state for an already-accepted corpus. |

## Preservation

- Phase 1 access policy: **96/96**
- Batch 2.2.1 accepted-snapshot requirement: pending GET still cannot freeze/finalize
- Frozen notice/body immutability: TEST406 clause/hash exact; execution tail may overlay after consumed signer authority
- TEST406, TEST464, TEST497, TEST505: preserved in Phase 2
- Wrong-account, signed-out, free-user, and stale-browser failures remain closed
- Overlay need now matches its comment: live session or consumed/labeled signer authority. Draft entity names alone cannot rewrite accepted first-review paper.

## Paid-journey gate additions

Added to `frontend/vitest.phase2PaidJourney.runner.config.ts`:

- `qa/paidProHardening/paidProTest221FirstReviewNoLegacyShell.test.tsx`
- `qa/paidProHardening/paidProTest225PaymentToFirstReviewLatency.test.ts`
- `paidProTest243RecoveryRender.test.ts`
- `paidProTest338PostCheckoutAcceptedCorpusStillMounts.test.ts`
- `paidProAfterPayReviewScreenGate.test.ts`
- `paidProVisibleDocumentShellPaidSessionFallback.test.ts`
- `paidProRenderSurface.test.ts`
- `premiumPostPaymentHydration.test.ts`
- `premiumGenerationApiAvailability.test.ts`

## Verification

- Focused after-payment matrix: **9 files, 75 passed**, zero failures
- Phase 1: **96/96**
- Phase 2 paid-journey frontend: **80 files, 475 passed**, zero failures
- Phase 2 critical backend pytest (including `test_commercial_read_scope_fail_closed`, `test_commercial_p0_auth_boundary`, `test_accepted_review_snapshot_authority`, `test_dashboard_resume_freeze_canonical_auth`): passed
- Production build: `frontend` `tsc -b && vite build` succeeded
- Full suite: not rerun. Official baseline remains **9,471 / 9,262 / 209**

## Remaining (not this batch)

- No launch-readiness claim
- Dashboard resume
- TEST511, TEST517, TEST518, TEST570
- Hash-parity debt
- Official raw remainder still includes after-pay leftovers outside this batch, source-window checks, json_parse flaps, and suite-load files
- TEST341 remains in the official 209 from earlier batches
- Live model, Stripe, email, and staging were not run
