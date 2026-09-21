# Phase 3B Batch 2.1.3 checkpoint — missing frozen authority fail-closed

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `99d0ee82`  
Nothing was pushed.

This is a corrective integration. It is **not** a launch authorization.

## Does every commercial finalization path require verified frozen authority?

**Yes, for the commercial paid-Pro signer finalize path.**

`finalizePaidProSignerMetadataAndOpenReviewDecision` now:

1. Resolves or creates the durable agreement ID.
2. Calls `gateSignerFinalizeOnVerifiedFrozenAuthority` with that ID and the current organization.
3. Reads the exact org+agreement cache record.
4. If missing, awaits authenticated `GET /api/agreements/{id}/canonical-review-snapshot`.
5. Blocks — before hydration, snapshot creation, review unlock, or signing progression — if the GET fails, authority remains missing, or agreement/hash/body differs.

The expected hash comes only from that verified record. The raw-corpus hash fallback is gone. `shouldBlockSignerFinalizeFrozenMismatch` is true when the keyed record is missing.

`ephemeralUnscoped`, implicit `currentAgreementId` lookup, and other test-only authority branches are removed from production. The ephemeral cache is keyed by organization plus durable agreement ID. Organization is defense-in-depth partitioning. Backend GET ownership remains authorization.

Logout and org-switch still clear **client cache only**.

SoT-only unit hydration (TEST366 / Alex) can still overlay signer metadata when no scoped frozen record is supplied. That helper is not a commercial finalize grant. Same-session handoff without a durable agreement ID does not seed the cache; finalize then requires GET and blocks on 404.

## Proof

`paidProBatch213FrozenAuthorityFailClosed.behavior.test.ts` — **7/7**

- Valid durable ID + missing cache + 404 blocks; hydration is never invoked
- Wrong hash blocks; hydration is never invoked
- Missing ID blocks; hydration is never invoked
- Verified GET seeds the exact scoped record and permits finalization
- Switching organizations invalidates the record
- Production finalize source order: gate → fail-closed return → hydration → snapshot / review unlock
- Missing keyed record makes `shouldBlockSignerFinalizeFrozenMismatch` true and yields no expected hash

## Preserved

- TEST505 — **6/6** (explicit synthetic agreement/org identities)
- TEST366 — **3/3**
- Alex signer hydration still passes (opening-repair failure remains pre-existing)

## Verification

- Phase 1: **96/96**
- Phase 2 paid-journey: **65 files, 383 passed**, zero failures
- Backend ownership: `test_commercial_read_scope_fail_closed`, `test_commercial_p0_auth_boundary`, `test_accepted_review_snapshot_authority`, `test_dashboard_resume_freeze_canonical_auth` — passed
- Production build: `frontend` `tsc -b && vite build` succeeded
- Full suite: not rerun. Official baseline remains **9,458 / 9,240 / 218**

## Remaining

- No launch-readiness claim
- Alex opening-title repair, notice contamination, and TEST497 remain pre-existing
