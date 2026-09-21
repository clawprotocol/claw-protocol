# Phase 3B Batch 2 checkpoint — returning paid persistence, corpus handoff, frozen-document integrity

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `51fd113a` (`record phase 3B batch 1.1 safety-containment checkpoint`)  
Nothing was pushed.

This is a repair checkpoint for returning paid create persistence, accepted-corpus handoff, and draft-limit surfacing. It is **not** a launch authorization.

## Correction to Batch 1 / Batch 1.1

Batch 1 listed TEST505 and TEST506-G as bonus closures. That was test-order contamination, not product closure.

- TEST505 (`signer finalize preserves frozen canonical corpus hash`) **fails isolated** on `51fd113a` and still fails isolated after this batch. SoT `establish` / `preparePaidProFreezeCandidateText` rewrites the accepted legal bytes (`10098:4de97af0` → `10139:9de9f8ca`). Returning the accepted body unchanged closes TEST505 but strips execution/notice overlay and isolates-fail TEST366 and Alex/PixelForge finalize hydration. Hydration was left at Batch 1.1 behavior. TEST505 is **not** closed.
- TEST506-G is closed for real. The returning-paid `planEnter` path still requires a professional-validation latch. Test G now seeds that latch (`seedReturningPaidAcceptance()`) instead of relying on a leaked latch from an earlier test.

## Batch 2 identities

| Identity | File | Result |
|---|---|---|
| Durable agreement ID | `paidProSignerFinalizeDurableId.test.ts` | closed |
| Durable-ID legal-name handoff | same | closed |
| TEST499-3 review-first persist | `paidProTest499ReturningPaidCreateDraftLimitPersist.test.ts` | closed |
| TEST504-6 sync accepted-corpus handoff | `paidProTest504ReturningPaidCorpusHandoff.test.ts` | closed |
| TEST505 frozen hash on signer finalize | `paidProTest505ReturningPaidStaleUiAndSignerHandoff.test.ts` | **open (isolated)** |
| TEST506-G shared validated canonical entry | `paidProTest506ReturningPaidProfessionalCorpusRegression.test.ts` | closed |
| TEST521-6 `draft_limit_reached` | `paidProTest521ReturningPaidDraftLimitTerminal.test.ts` | closed |

Six official files: **38 passed / 1 failed / 39**. The failure is TEST505 isolated.

## Runtime

- Finalize binds one workspace agreement ID (`resolveFinalizeDurableAgreementId`) before snapshot/persist and clears persist errors only after that ID is bound. Existing IDs are reused; finalize does not remint.
- Canonical handoff prefers intake legal names via `pickRecipientNameForHandoff`.
- Review-first persist sits at the top of `ensureReviewAgreementWorkspaceId`. A `draft_limit_reached` response is never treated as success (`planPaidCreateFlowPersistFailureOutcome.treatAsSuccess` is always `false`).
- After professional validation, rewrite calls `commitAcceptedPaidProCorpusHandoffSync` before `enterCanonicalPaidProReviewFlow`. Commit still fails closed without a validation latch.
- Demo persist keeps the labeled visible-corpus fallback chain (`using_sot_for_persist`, display/review/completion snapshot, `no_valid_corpus_for_persist`).

Behavioral proof (not in the 39-count): `paidProBatch2DurablePersist.behavior.test.ts`, `paidProBatch2RewriteCorpusHandoff.behavior.test.ts`.

## Verification

### 1. Six Batch 2 files

**38/39**. Stopped on TEST505 (behavioral hash, not an obsolete source-only assertion). Did not insert dead overlay-skip code.

### 2. Paid-journey gate additions

Added to `frontend/vitest.phase2PaidJourney.runner.config.ts`:

- `paidProSignerFinalizeDurableId.test.ts`
- `paidProTest499ReturningPaidCreateDraftLimitPersist.test.ts`
- `paidProTest504ReturningPaidCorpusHandoff.test.ts`
- `paidProTest506ReturningPaidProfessionalCorpusRegression.test.ts`
- `paidProTest521ReturningPaidDraftLimitTerminal.test.ts`
- `paidProBatch2DurablePersist.behavior.test.ts`
- `paidProBatch2RewriteCorpusHandoff.behavior.test.ts`

**Not added:** `paidProTest505ReturningPaidStaleUiAndSignerHandoff.test.ts` (TEST505 isolated still fails).

### 3. Preserved

Batch 1 ten closures, Batch 1.1 org-scope / unvalidated-corpus fail-closed, TEST515 `validation_not_latched_for_corpus`, TEST522, Free Starter / Case F, logout isolation, wrong-account isolation. Phase 1 files unchanged.

### 4. Phase 1 gate

`./scripts/run_phase1_access_contract_gate.sh` — **96/96**.

### 5. Phase 2 paid-journey gate

`./scripts/run_phase2_paid_journey_release_gate.sh` — **61 files, 364 passed**, zero failures.

### 6. Production build

`frontend`: `tsc -b && vite build` succeeded.

### 7. Complete frontend suite

```bash
cd frontend && ./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/phase3b-batch2/frontend-full.json
```

| Check | Official Batch 1 confirmation | Batch 2 |
|---|---:|---:|
| Inventory | 9,445 | 9,458 |
| Passed | 9,218 | 9,240 |
| Raw failed assertions (vitest) | 227 | 218 |
| Failed suites | 382 | 366 |
| Suite-load files | 14 | 14 |
| TEST486 in the raw set | 1 | 1 |

Inventory rose by 13 from the two behavior files plus newly collected tests. Passed rose by 22. Raw failed dropped by 9.

Closed versus the Batch 1 confirmation raw set: durable-ID both tests, TEST499-3, TEST504-6, TEST521-6 draft-limit, plus four suite-order json_parse / persist rows that were already isolated-green on Batch 1.1.

## Order-dependent identities

Do **not** subtract these from the official count:

- TEST400 — did not recur
- TEST447 — did not recur
- TEST449 — did not recur
- TEST452 — recurred (1)
- TEST486 — recurred (1)

One new raw row versus Batch 1 confirmation: TEST399 `both premium-full-draft attempts degraded/json_parse resolve via deterministic fallback`. Isolated it is **1/1**. Same suite-order json_parse family as TEST410 (that TEST410 row left the raw set). **Zero new isolated product identities.**

TEST505 remains in both the Batch 1 confirmation set and this set.

## What this does not claim

- Launch readiness
- TEST505 frozen-hash closure
- Live model, Stripe, email, or staging
- Phase 1 access-policy changes
