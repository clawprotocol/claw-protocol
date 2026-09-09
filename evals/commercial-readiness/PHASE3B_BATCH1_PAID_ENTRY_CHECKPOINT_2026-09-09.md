# Phase 3B Batch 1 checkpoint — paid create → canonical review

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `c1d7e53f` (`record phase 3A commercial-launch failure triage`)  
Nothing was pushed.

This is a repair checkpoint for paid `/app/create` entering canonical paid-Pro review. It is **not** a launch authorization.

## Objective

Close exactly the ten Batch 1 identities so an authenticated paid workspace on `/app/create` enters the canonical paid-Pro review experience instead of Free Starter. Preserve Free Starter for genuinely free users. Do not change Phase 1 access policy.

## Batch 1 identities

| Identity | File | Result |
|---|---|---|
| TEST490 paid-create persistence | `paidProTest490CreateFlowRouting.test.ts` | closed |
| TEST492 stale UI tier with workspace Pro | `paidProTest492CreateFlowReviewHandoff.test.ts` | closed |
| TEST500 authoritative paid corpus selection | `paidProTest500CreateFlowStarterShellBypass.test.ts` | closed |
| TEST508 entitlement-before-starter ordering | `paidProTest508FourPartyGuidedContinueBypass.test.ts` | closed |
| TEST502-2 paid shell resolution | `paidProTest502ReturningPaidCreatePostPaymentParity.test.ts` | closed |
| TEST502-6 canonical review entry | same | closed |
| TEST501-2 shared first-time/returning review plan | `paidProTest501CanonicalPaidProReviewEntry.test.ts` | closed |
| TEST501-5 signer hydration | same | closed |
| TEST503-4 signer hydration on returning reuse | `paidProTest503ReturningPaidPostPaymentReuse.test.ts` | closed |
| TEST504-7 signer hydration on corpus handoff | `paidProTest504ReturningPaidCorpusHandoff.test.ts` | closed |

**Remaining in those eight files:** TEST504-6 only.

## Linked causes (diagnosed before edit)

These were not one function.

1. **Workspace billing vs stale UI (TEST492, TEST502-2).** `readCachedWorkspaceProEntitlement()` still returns false for `local-org` (Case F / Phase 1). Create-flow review now honors an explicit in-memory billing resolution (`workspaceProResolved === true`) without granting paid from React `tier: "free"` or `workspaceProEntitled` alone. `fetchWorkspaceProEntitlement()` still forces false for local-org, so Case F stays `free_starter`.
2. **Persist before hash latch (TEST490).** Skip-free-starter persist required hash + validation. A professionally validated substantive body may now persist before the accepted-hash latch. Hash-only freeze-prep still does not persist.
3. **Explicit pipeline corpus (TEST500).** Authority-only final review emptied an unlatched caller-provided `pipelineWinningPlain`. That body is kept when it was selected because hydrated authority was short. The same unvalidated body already sitting in `authoritativePlain` stays blocked (TEST522).
4. **Shared first-time / returning plan (TEST501-2, TEST502-6).** Returning create blocked on a missing validation latch. Hash-only freeze-prep still blocks (`validation_not_latched_for_corpus`, TEST515). An explicit guided-min corpus with no accepted-hash latch may share the post-checkout plan.
5. **Signer hydration (TEST501-5, TEST502-6, TEST503-4, TEST504-7).** Draft party legal-entity names outranked authorized-signer bullets. Canonical review handoff now maps `* Sarah Mitchell, CEO, Red Mesa Logistics LLC` / `* Michael Torres, President, Harbor Peak Automation LLC` onto those entities and does not invent a signer when intake has no human bullets.
6. **TEST508 ordering.** Runtime already awaited entitlement before `commitStarterMultiPartyProGate`. The stageA telemetry label was more than 800 characters later, so the source window saw neither call. The `executePrimaryCta_stageA` handoff log now sits immediately after that await/gate. Free 4-party `/` still requires the public Pro gate.

## TEST504-6 left unchanged

`paidProTest504ReturningPaidCorpusHandoff.test.ts` item 6 inspects `runEntitledPremiumImprovementRewrite` for the literal `commitAcceptedPaidProCorpusHandoffSync` inside an 18,000-character window. The helper already exists and is used by `commitCanonicalPaidProReviewSessionMarkers`. Adding the call only so `readFileSync` passes would be source-inspection wiring, not a rewrite-time corpus commit. Batch 2.

That file is **excluded** from the Phase 2 paid-journey gate until TEST504-6 is resolved by correct rewrite-time behavior.

## Commits (local only)

| SHA | Subject |
|---|---|
| `b28f53d6` | honor explicit workspace billing over stale free UI |
| `9d051242` | persist a validated paid corpus before the hash latch |
| `49703f90` | prefer an explicit paid pipeline corpus over starter review |
| `b5ec9209` | share first-time and returning canonical review entry |
| `83db4781` | resolve paid entitlement before the starter multi-party gate |
| `2756e9f0` | keep rejected authoritative bodies out of pipeline recovery |

Phase 1 access-policy files (`routes.ts`, `RequireAuthenticatedDashboard`, `fallbackOrgPaidEntitlementGuard.ts`, `readCachedWorkspaceProEntitlement` Case F short-circuit) were not changed. Tests, assertions, snapshots, hashes, source windows, and timeouts were not changed.

## Verification

### 1. Eight Batch 1 files

`51` tests: **50 passed**, **1 failed** (`TEST504-6`).

### 2. Phase 1 gate

`./scripts/run_phase1_access_contract_gate.sh` — **96/96**.

### 3. Integrated Phase 2 gate

After adding the seven fully green Batch 1 files: **52 files, 318 passed**.

Excluded: `paidProTest504ReturningPaidCorpusHandoff.test.ts` (contains TEST504-6).

### 4. Production build

`frontend`: `tsc -b && vite build` succeeded.

### 5–7. Frontend suite vs Phase 3A

Phase 3A baseline (`0044a339` / triage `c1d7e53f`): **9,445 tests, 235 raw failures, 234 persistent** (TEST486 load-only removed).

Command (JSON to `/tmp`, complete log not printed):

```bash
cd frontend && npx vitest run --reporter=json --outputFile=/tmp/phase3b-batch1/frontend-full.json
```

First complete run (after the five Batch 1 commits, before the TEST522 narrowing): **9,445 / 9,223 passed / 222 raw**. All ten targets closed. One new identity: TEST522 (`validation rejection leaves no renderable corpus`). That was incorrect pipeline recovery of a rejected authoritative body. Tightened in `2756e9f0`. Isolated TEST522 is green again.

Confirmation run after that repair (`/tmp/phase3b-batch1/frontend-full-after-test522.json`):

| Check | Phase 3A | Phase 3B Batch 1 confirmation |
|---|---:|---:|
| Inventory | 9,445 | 9,445 |
| Passed | 9,210 | 9,218 |
| Raw failed assertions | 235 | 227 |
| Failed suites | 390 | 382 |
| Suite-load `source` files | 14 | 14 |
| TEST486 in the raw set | 1 | 1 |
| Persistent after TEST486 | 234 | 226 |

All **ten Batch 1 targets remain closed**. TEST504-6 remains. TEST522 is not in the confirmation set.

Bonus closures versus Phase 3A (same canonical-entry sharing, not claimed as Batch 2 complete):

- TEST505 — first-time post-checkout canonical plan remains unchanged
- TEST506-G — first-time and returning paid create share canonical review entry

Four confirmation-run identities were **not** in the Phase 3A raw set. Isolated they are **18/18**:

- TEST400 degraded json_parse prose recovery (`paidProTest410CanonicalDocumentStructureAuthority.test.ts`)
- TEST447 brand-licensing server retry
- TEST449 brand-licensing post-validation adoption
- TEST452 SoT establishment after retry

Treat those four plus TEST486 as suite-load / json_parse contention, not Batch 1 product regressions. They are outside the paid create → canonical review boundary.

No new persistent product identity remains from the Batch 1 runtime. Raw 227 is two above the “ten targets closed → ≤225” envelope because of those load-only extras; removing TEST486 and the four isolated-green files yields **222**, which is below 225.

## Paid-journey gate additions

Added to `frontend/vitest.phase2PaidJourney.runner.config.ts`:

- `paidProTest490CreateFlowRouting.test.ts`
- `paidProTest492CreateFlowReviewHandoff.test.ts`
- `paidProTest500CreateFlowStarterShellBypass.test.ts`
- `paidProTest501CanonicalPaidProReviewEntry.test.ts`
- `paidProTest502ReturningPaidCreatePostPaymentParity.test.ts`
- `paidProTest503ReturningPaidPostPaymentReuse.test.ts`
- `paidProTest508FourPartyGuidedContinueBypass.test.ts`

**Not added:** `paidProTest504ReturningPaidCorpusHandoff.test.ts` — still contains TEST504-6.

## What this does not claim

- Launch readiness
- Batch 2 (TEST504-6 and the rest of returning persist / stale-UI)
- Live model, Stripe, email, or staging
- Phase 1 access-policy changes
- That the eight Batch 1 files are fully green (TEST504-6 is not)
