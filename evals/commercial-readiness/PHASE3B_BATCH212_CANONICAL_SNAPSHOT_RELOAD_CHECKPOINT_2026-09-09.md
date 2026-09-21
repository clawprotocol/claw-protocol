# Phase 3B Batch 2.1.2 checkpoint — genuine canonical-snapshot reload

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `9f8d7a95`  
Nothing was pushed.

This is a corrective integration. It is **not** a launch authorization.

## Correction of Batch 2.1.1

The Batch 2.1.1 “server-authoritative reload” proof was invalid.

- `serverByKey` and `createInProcessServerAuthority()` were frontend memory, not a server.
- The test never performed a real module reload.
- Production never called `restoreImmutableFrozenLegalCorpusFromServerAuthority`.
- Logout cleared that fake store and pretended to delete server records.
- `user-` / `local-org` string prefixes were treated as authorization.

Those mechanisms are removed.

## What production does now

Reload/reopen uses authenticated `GET /api/agreements/{id}/canonical-review-snapshot` through `hydrateCommercialReviewFromServerSnapshot`.

The ephemeral frozen-corpus cache is seeded only after that GET verifies:

- requested `agreementId` equals returned `agreement_id`;
- returned body length equals `corpus_length`;
- SHA-256 of the body equals `corpus_sha256`;
- ownership is the existing backend GET guard (`assert_agreement_full_draft_read_allowed`).

Signer finalize resolves or creates the durable agreement ID **before** hydration and passes that id plus the expected frozen hash. Missing ID or a frozen-body mismatch blocks. `session-handoff` is not commercial document authority.

Logout and org-switch clear **client cache only**. They do not delete server records.

## Proof

`paidProBatch212FrozenCorpusReload.behavior.test.ts` — **4/4**

- Module reset, then restore only after a mocked authenticated GET
- 403, wrong agreement id, bad digest, and bad length never seed or return a corpus
- Agreement A cannot be returned while finalizing B
- Logout clears client cache; authorized re-login restores through a new GET

## Preserved

- TEST505 — **6/6**
- TEST366 — **3/3**
- Alex signer hydration still passes (opening-repair failure remains pre-existing)

## Verification

- Phase 1: **96/96**
- Phase 2 paid-journey: **64 files, 376 passed**, zero failures
- Backend ownership: `test_commercial_read_scope_fail_closed`, `test_commercial_p0_auth_boundary`, `test_accepted_review_snapshot_authority`, `test_dashboard_resume_freeze_canonical_auth` — passed
- Production build: `frontend` `tsc -b && vite build` succeeded
- Full suite: not rerun. Official baseline remains **9,458 / 9,240 / 218**

The two accepted-snapshot ownership files are now in the Phase 2 backend gate. The 2.1.1 in-process-server test file is gone from the frontend gate.

## Remaining

- No launch-readiness claim
- Alex opening-title repair, notice contamination, and TEST497 remain pre-existing
