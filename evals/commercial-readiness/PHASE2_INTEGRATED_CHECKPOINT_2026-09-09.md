# Phase 2 integrated checkpoint — 2026-09-09

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase2-integrated`  
Phase 1 checkpoint: `acdf450f` (`record phase 1 access contract checkpoint`)  
Phase 2 source (local fetch only): `/Users/anthem/Desktop/claw-bot`  
Nothing was pushed.

This checkpoint replaces the Phase 2 reports that used the wrong baseline (`f07553e2`, `9e457675`). Those commits were not ported.

## Commercial objective

Port the authenticated paid-journey work onto the validated Phase 1 access-contract lineage, then compare the full frontend suite to the real Phase 1 baseline of **9,423 tests / 241 persistent failures**. This is not a launch authorization.

## Integration method

1. Created `stabilize/phase2-integrated` from exactly `acdf450f`.
2. Added a local remote `phase2-source` → `/Users/anthem/Desktop/claw-bot` and fetched that remote. No network fetch.
3. Cherry-picked these Phase 2 code/test commits, in order:

| Source (`claw-bot`) | Integrated SHA | Subject |
|---|---|---|
| `ad2fcd7c` | `c7b2329c` | add the paid-journey release-gate script and vitest config |
| `20a6ba09` | `c596af12` | prove auth-claim and checkout keep the same paid agreement |
| `fe0b5ae0` | `ad566d6b` | persist fully executed snapshots only after all signers finish |
| `f9af18fe` | `8a305d35` | prove paid generation rewrites the same agreement ID |
| `328928bd` | `4bb453be` | restore review vs signature track and keep signing URLs origin-safe |
| `734c19c9` | `3cc1e409` | keep section headings and list markers out of signer slots |
| `7c05c0e1` | `829273c5` | fail closed on stale recipient links and already-complete actions |
| `99d740d5` | `99b06e51` | satisfy production TypeScript on Phase 2 journey fixtures |
| `4a773d64` | `d72c70e3` | give same-agreement generation the long-pipeline timeout |

Not ported: `f07553e2`, `9e457675`.

No untracked files from the Desktop worktree were copied, staged, deleted, or committed.

## Conflict resolution

The only cherry-pick conflict was `frontend/src/components/agreements/AgreementBuilderIntake.tsx` in `7c05c0e1`. That file is not a Phase 1 access-policy contract.

Resolution (no product or access-policy change):

- Kept Phase 1 `too_short` → textarea focus.
- Kept Phase 1 `draft` dependency for checkout-back restore.
- Kept Phase 2 `resolveUserActionFeedback` and `reviewDocRefreshTick` / `premiumSurfaceGateTick`.
- After the full-suite run, moved `setPaidProSignaturePrepIntentLatched(false)` to the first statement of `handleProSendForReview` so the existing TEST577 source-inspection window still sees the Phase 1 latch release. Phase 2 review-track feedback remains immediately after. The latch was already present; only order changed.

`frontend/src/ClawProductApp.tsx` merged cleanly: `RequireAuthenticatedDashboard` and unknown `/app` not-found remain. Recipient loading / bad-link UI uses `RecipientLinkGateNotice` only.

Phase 1 contract files are unchanged versus `acdf450f` (`git diff acdf450f` is empty for):

- `frontend/src/launch/routes.ts`
- `frontend/src/launch/routeAccessManifest.test.ts`
- `frontend/src/auth/RequireAuthenticatedDashboard.tsx` (+ test)
- `frontend/src/account/currentUser.ts` (+ test)
- `frontend/src/lib/ownerApiClient.ts` (+ test)
- `frontend/src/launch/receiptApi.ts`
- `frontend/src/launch/documentLayout/documentLayoutApi.ts`
- `frontend/src/vs01/vs01Api.ts`
- `frontend/src/access/AccessContext.tsx`
- `frontend/src/access/accessResolver.ts`
- `frontend/src/access/subscriptionEntitlementCache.ts`
- `frontend/src/auth/AuthProvider.tsx`
- `frontend/src/auth/userSessionState.ts`
- `frontend/src/launch/orgContext.ts`
- `frontend/src/launch/BillingPage.tsx`

## Phase 1 focused gate cannot be omitted

The recorded Phase 1 focused check is **96 passed / 0 failed**. That set is now a named include:

- 14 test files from Phase 1 commits `19a43277` / `98fd5208` / `67c396d7` (76 tests)
- plus four pre-existing route/auth/owner-data/session files that complete 96:
  `authenticatedWorkspaceAccessPolicy`, `commercialEntitlement`, `accessResolver.prodSafety`, `billingCheckoutApi.auth`

Shared list: `frontend/vitest.phase1AccessContract.include.ts`  
The Phase 2 runner spreads that list. The Phase 2 gate script fails if the import is removed or any listed file is missing on disk.

## Verification commands and counts

Run in the required order from the repository root.

### 1. Phase 1 focused gate — 96 tests

```bash
./scripts/run_phase1_access_contract_gate.sh
```

Result: **18 files / 96 passed / 0 failed**.

Equivalent: `cd frontend && npm run test:phase1-access-contract`

### 2. Phase 2 paid-journey gate

```bash
./scripts/run_phase2_paid_journey_release_gate.sh
```

Result:

- Omission guard: Phase 1 include is bound into the Phase 2 gate.
- Backend ownership / security / paid journey: **96 passed / 0 failed**.
- Frontend paid-journey vitest: **45 files / 274 passed / 0 failed**.

The frontend gate is the previous Phase 2 journey files plus every Phase 1 contract file (14 files were previously absent from the gate).

### 3. Production build

```bash
cd frontend && npm run build
```

Result: **passed** (`tsc -b && vite build`, vite 9.23s).

### 4. Backend ownership / security (dedicated rerun)

```bash
.venv/bin/python -m pytest \
  backend/tests/test_j7_auth_claim_authority.py \
  backend/tests/test_j7_checkout_same_agreement_authority.py \
  backend/tests/test_paid_beta_release_gate.py \
  backend/tests/test_commercial_p0_auth_boundary.py \
  backend/tests/test_commercial_read_scope_fail_closed.py \
  backend/tests/test_subscription_authority.py \
  backend/tests/test_anonymous_draft_claim.py \
  backend/tests/test_vs01_signer_complete_api.py \
  backend/tests/test_vs01_signer_completion.py \
  backend/tests/test_commercial_beta_lifecycle.py \
  backend/tests/test_explicit_acceptance_http_e2e.py \
  -q --tb=line
```

Result: **96 passed / 0 failed** (same 11 files as the Phase 2 gate).

### 5. One complete frontend suite

```bash
cd frontend && npx vitest run --reporter=json --outputFile=/tmp/phase2-integrated/frontend-full.json
```

Compared against the real Phase 1 machine-readable report `/tmp/lawdog-phase1-vitest.json` (9,423 / 245 raw / 241 persistent).

| Check | Phase 1 (`acdf450f`) | Integrated full-suite (once) |
|---|---:|---:|
| Frontend test inventory | 9,423 | 9,445 (+22 Phase 2 tests) |
| Passed | 9,178 | 9,209 |
| Raw failed assertions | 245 | 236 |
| Load-only timeouts in that raw set | 4 (isolated 26/26) | 1 remaining (`TEST486`, 5.7s; isolated 4/4) |
| Persistent failed assertions | 241 | 235 in this run, including TEST577 |
| Suite-load `source` failures | 14 files | 14 files (same set) |

The official full suite was run **once**, before the latch-first reorder. It is the inventory used below. Isolated reruns after that run are classified separately and were not used to rewrite the full-suite counts.

## Full-suite identity comparison

Against Phase 0 `/tmp/lawdog-vitest-phase0.json` (241 persistent) and Phase 1 `/tmp/lawdog-phase1-vitest.json`:

### New in the official integrated full run (1)

- `paidProTest577SignatureTrackPreserved.test.ts` — `Send for review explicitly releases the signature-prep latch`

The latch release was already in `handleProSendForReview`. Phase 2 prepended user-action feedback, which pushed the latch call past the test’s 400-character source window. After the full run, the latch call was moved back to the first statement. Isolated rerun of that file: **passed**. Assertions were not weakened. The official full-suite count still includes this failure because the suite was not rerun.

### Phase 0 persistent identities that passed in this full run (7)

These passed in the official integrated full run and again when rerun together (11 files / 63 passed):

- `paidProTest443BrandLicensingFreezeRegression.test.ts`
- `paidProTest446BrandLicensingIntentRegression.test.ts`
- `paidProTest447BrandLicensingServerRetry.test.ts`
- `paidProTest449BrandLicensingPostValidationAdoption.test.ts`
- `paidProTest452SoTEstablishmentAfterRetry.test.ts`
- `paidProTest457BrandLicensingFinalPolish.test.ts`
- `paidProTest561DashboardGenerationPipelineParity.test.ts`

Do not treat this as a new blessed baseline. Several of these files are long paid-document tests. They are green in this run; they are not deleted from the unresolved inventory until a later checkpoint repeats the comparison.

### Phase 1 timeout-only additions (4)

Phase 1 recorded four load-only timeouts that were absent from Phase 0. In this integrated full run:

| File | Integrated full run | Isolated |
|---|---|---|
| `paidProTest410CanonicalDocumentStructureAuthority.test.ts` | passed | passed |
| `paidProTest430ServerDraftFreezeRegression.test.ts` | passed | passed |
| `paidProTest582SectionHeadingTitleAnomalyAuthorityAtFreeze.test.ts` | passed | passed |
| `paidProTest486489DegradedRecoveryRegression.test.ts` (`TEST486`) | failed at 5.7s | 4 passed / 4 |

`TEST486` is the remaining load-only timeout under full-suite contention. Same classification Phase 1 used: not a new persistent assertion.

## Unresolved failures

The paid-journey **gate** is zero-failure. The product is **not** release-ready.

Unresolved after applying Phase 1’s timeout methodology to the official integrated full run:

- **235** failed assertions in the one full-suite run, including TEST577 (later isolated-green after latch-first reorder).
- If TEST577 is excluded as a resolved source-window miss, the comparable persistent set is **234**. That is still far above a release threshold.
- **14** files still fail during suite load with `Cannot read properties of undefined (reading 'source')`. That set is unchanged from Phase 0/1.
- Remaining red assertions continue to cluster in document/corpus authority, signing/recipient identity, authentication/billing, and recovery/hydration. They were not quarantined, skipped, or snapshot-rewritten.

No snapshots were rewritten. No assertions were weakened.

## Changed files versus `acdf450f`

Cherry-pick delta (40 files, +2531 / −103 before this checkpoint’s follow-up files):

- Backend: `vs01_fully_executed_snapshot.py`, `vs01_signer_completion.py`, `test_j7_auth_claim_authority.py`, `test_j7_checkout_same_agreement_authority.py`, `test_vs01_signer_completion.py`
- Frontend journey: `AgreementBuilderIntake.tsx`, `AgreementRecipientReview.tsx`, `agreementDraftNormalize.ts`, `agreementTypes.ts`, `ClawProductApp.tsx`, `JourneyActionBanner.tsx`, `canonicalPartyIdentityResolver.ts`, `customerJourneyReadiness.ts`, `paidProPartyNamePreserve.ts`, `partySlotIdentityNormalize.ts`, `signerSetupPartyIdentity.ts`, `userActionFeedback.ts`, `DashboardWhatsNextPanel.tsx`, `dashboardWhatsNextPresentation.ts`, `Vs01Wizard.tsx`, `vs01SignerCompletionSync.ts`, `vs01SigningInviteDelivery.ts`, plus the tests added or extended with those changes
- E2E helpers only: `rc-journey-7-authority.spec.ts`, `rcOwnershipMigrationAuthority.ts`
- Gate: `vitest.phase2PaidJourney.runner.config.ts`, `vitest.paidProPipelineLong.config.ts`, `scripts/run_phase2_paid_journey_release_gate.sh`, `frontend/package.json`

Follow-up files on this branch (not from the nine cherry-picks):

- `frontend/vitest.phase1AccessContract.include.ts`
- `frontend/vitest.phase1AccessContract.runner.config.ts`
- `scripts/run_phase1_access_contract_gate.sh`
- this checkpoint

## Release decision

The authenticated paid-journey **gate** is green and now cannot silently drop the Phase 1 access-contract tests.

LawDog is **not commercially ready** and **not launch-ready**:

- the full frontend suite still has 200+ persistent failures
- there is no deployed browser-level paid/free/recipient/signed-out/wrong-account matrix on this lineage
- one official full-suite identity (`TEST577`) required a post-run latch-order restoration and was not re-measured in a second full run

Do not authorize paid generation, a pricing change, or an external launch from this checkpoint.
