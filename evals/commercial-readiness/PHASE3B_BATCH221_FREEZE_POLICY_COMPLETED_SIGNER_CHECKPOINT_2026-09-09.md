# Phase 3B Batch 2.2.1 checkpoint — freeze-policy reconciliation and completed-signer integrity

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `98226347` (`record phase 3B batch 2.2 paid-document-integrity checkpoint`)  
Nothing was pushed.

This reconciles TEST406 with ADR-001/020, rejects pending snapshots as frozen authority, and closes TEST464. It is **not** a launch authorization. The official full-suite baseline remains **9,471 / 9,262 / 209**. The complete frontend suite was not rerun.

## Controlling rule

ADR-001 and ADR-020 control. Frozen accepted agreement bytes — including operative Notices — stay unchanged across review, signing, executed view, owner retrieval, and PDF. Human signer name/title and delivery email are execution/routing metadata. A notice address or contact that should change the agreement text must be added before acceptance or through an explicit owner-approved revision.

ADR-010 was amended so it cannot direct agents to mutate frozen notice text. `notice_contact_hydration_only` is a parity label, not a mutation grant. ADR-009 and ADR-011 were aligned to that rule.

## Changed files

Product / architecture:

- `docs/architecture/LAWDOG_ARCHITECTURE_DECISIONS.md`
- `frontend/src/components/agreements/paidProFrozenLegalCorpusFromCanonicalSnapshot.ts`
- `frontend/src/components/agreements/paidProNPartySignerSetup.ts`
- `frontend/src/components/agreements/paidProSoTSignerExecutionOverlay.ts`
- `frontend/src/vs01/completedSignerOverlayResolver.ts`
- `frontend/src/vs01/vs01FullyExecutedSignedSnapshot.ts`
- `frontend/src/vs01/vs01SigningCorpus.ts`

Tests / gate:

- `frontend/src/components/agreements/paidProTest406FourPartySignerMetadataFinalization.test.ts`
- `frontend/src/components/agreements/paidProTest464CompletedSignedArtifact.test.ts`
- `frontend/src/components/agreements/paidProBatch221PendingSnapshotRejection.behavior.test.ts` (new)
- `frontend/vitest.phase2PaidJourney.runner.config.ts`

## Identities

| Identity | Isolated | Notes |
|---|---|---|
| Pending owned GET cannot seed freeze or finalize | **1/1** | `hydrateCommercialReviewFromServerSnapshot` may display pending; restore/finalize return `pending_snapshot` |
| TEST406 four-party finalize vs freeze contract | **2/2** | frozen clause/hash exact; identity lives in metadata; execution tail only; notice rewrite requires explicit revision |
| TEST464 Eve Green + four execution blocks | **1/1** | reconstruction no longer stamps the owner entity name as `By:`; frozen clause preserved through snapshot / owner view |
| Batch 2.2 Alex titled-idempotency | **8/8** | preserved |
| Batch 2.2 notice-label rebuild | **4/4** | preserved |
| TEST497 | **1/1** | preserved |
| TEST505 | **6/6** | preserved |
| TEST366 | **3/3** | preserved |
| Batch 2.1.3 fail-closed | **7/7** | preserved |

## Runtime

- `restoreImmutableFrozenLegalCorpusFromCanonicalSnapshot` and `gateSignerFinalizeOnVerifiedFrozenAuthority` require `status === "accepted"`. A valid owned pending GET still hydrates review display and still blocks freeze/finalize.
- `resolveCompletedSignerByText` refuses a `By:` value that equals the party legal entity. Audit display name / human signer name win. Bridge role construction reads `creatorSignerName` when `ownerSignerName` is absent.
- VS01 signing binds incoming corpora to the frozen operative clause (`preserveFrozenOperativeClause`) so an unapproved notice rewrite cannot become the signing body.
- SoT-only working-corpus notice hydration (Alex / TEST366) was not restored onto accepted frozen review/PDF surfaces.

## Verification

- Phase 1: **96/96**
- Phase 2 paid-journey: **71 files, 400 passed**, zero failures (includes TEST406, TEST464, pending-snapshot proof, and Batch 2.2 integrity files)
- Backend ownership / canonical-snapshot (Phase 2 critical pytest, including `test_commercial_read_scope_fail_closed`, `test_commercial_p0_auth_boundary`, `test_accepted_review_snapshot_authority`, `test_dashboard_resume_freeze_canonical_auth`): passed
- Production build: `frontend` `tsc -b && vite build` succeeded
- Full suite: not rerun. Official baseline remains **9,471 / 9,262 / 209**

## Remaining

- No launch-readiness claim
- Official raw remainder still includes TEST511, after-pay paint, dashboard resume, source-window checks, json_parse flaps, hash-parity, and suite-load files
- TEST341 remains in the official 209 from Batch 2.2 (isolated-green after the competing-opening tighten; suite not rerun)
- Live model, Stripe, email, and staging were not run
