# Phase 3B Batch 1.1 checkpoint — paid-entry safety containment

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `bd13f7b1` (`record phase 3B batch 1 paid-entry checkpoint`)  
Nothing was pushed. Batch 2 was not started.

This is a safety-containment checkpoint. It is **not** a launch authorization.

## Objective

Stop two Batch 1 leaks without reopening the ten paid-create → canonical-review closures:

1. In-memory workspace-Pro resolution is scoped to the current organization. A paid resolution for one org is never readable for another org or `local-org`.
2. Professional validation must precede corpus authority. An unvalidated long `pipelineWinningPlain` does not render as authoritative, returning paid review is not approved merely because no accepted hash exists, and `commitAcceptedPaidProCorpusHandoffSync` does not manufacture validation.

## Containment

- Workspace-Pro in-memory resolution now binds `workspaceProResolved` to `workspaceProResolvedOrgId`. Reads require a current-org match. `local-org` / empty never store or read paid.
- `clearLawdogUserSessionState()` invalidates the in-memory resolution and the persisted usage-tier cache before `setOrgId("")`. Org identity changes also invalidate a stale bound resolution.
- Create-flow paid shell no longer grants from React `workspaceProEntitled`, path inference, or UI `tier` alone. A genuinely server-resolved paid org still bypasses stale React `tier: "free"`.
- Final-review corpus, `planEnterCanonicalPaidProReviewFlow`, and `commitAcceptedPaidProCorpusHandoffSync` require an existing professional-validation latch. Commit writes hash/hygiene only after that latch.

Fixture setup only: several Batch 1 tests now set a real `user-*` org and/or mark a legitimate validation latch before exercising paid review. Customer-facing assertions, snapshots, hashes, source windows, and timeouts were not weakened. TEST504-6 is unchanged.

## Verification

### 1. Eight Batch 1 files

`51` tests: **50 passed**, **1 failed** (`TEST504-6` only).

### 2. New containment tests

- Logout / org-switch / stale-tier: **3/3**
- Unvalidated-corpus fail-closed + validated success: **4/4**

### 3. Preserved regressions

- All **ten Batch 1 closures** remain closed.
- TEST515 hash-only / unlatched rejection (`validation_not_latched_for_corpus`) remains green.
- TEST522 rejected-corpus behavior remains green.
- Genuine Free Starter / Case F (`local-org` + stale `workspaceProEntitled`) remains `free_starter`.

### 4. Phase 1 gate

`./scripts/run_phase1_access_contract_gate.sh` — **96/96**.

### 5. Integrated Phase 2 gate

After adding the two containment files: **54 files, 325 passed**.

Excluded: `paidProTest504ReturningPaidCorpusHandoff.test.ts` (still contains TEST504-6).

The complete frontend suite was **not** run in this containment step.

### 6. Production build

`frontend`: `tsc -b && vite build` succeeded.

## Official baseline (unchanged)

Keep the Batch 1 confirmation numbers. This step did not rerun the complete frontend suite:

| Check | Official count |
|---|---:|
| Inventory | 9,445 |
| Passed | 9,218 |
| Raw failed assertions | 227 |
| Persistent after TEST486 | 226 |

Track as unresolved order-dependent failures. Do **not** subtract them from the official count:

- TEST400
- TEST447
- TEST449
- TEST452

## What this does not claim

- Launch readiness
- Batch 2 (TEST504-6 and rewrite-time corpus commit)
- Live model, Stripe, email, or staging
- A new complete-suite number
- That the eight Batch 1 files are fully green (TEST504-6 is not)
