# Accepted review snapshot — commercial first-seal authority

**Baseline:** successor of `532e6a29` on the release branch (see git history for this document).  
**Does not authorize deployment.**

## Authority model

| Layer | Role |
|-------|------|
| Frontend `establishPaidProSourceOfTruth` | Client review/freeze coordinator only |
| Server `canonical_review_snapshots_v1` / `accepted_review_snapshot_v1` | Trusted commercial authority |
| Packet-layout witness/signature corpus | Separately hashed derived artifact (must never modify legal-corpus bytes) |

## Required lifecycle (new commercial)

1. **Persist pending before review UI** — `POST /api/agreements/{id}/canonical-review-snapshot`  
   Immutable snapshot: agreement id, snapshot id, corpus bytes, SHA-256, length, generation/session id, created_at, schema. Sets `commercialSnapshotAuthorityRequired` (post-cutover).
2. **Review hydrates from GET** — `GET …/canonical-review-snapshot` supplies the authoritative legal corpus identified by snapshot ID, SHA-256 digest, and length. Local draft/SoT must not replace those bytes as commercial authority.
3. **Accept by id + digest only** — `POST …/canonical-review-snapshot/accept`  
   No replacement corpus bytes. Optional `display_snapshot_id` / `display_digest` / `display_length` fail closed on A≠B. Optimistic `expected_registry_version` + `expected_accepted_snapshot_id` concurrency tokens.
4. **Await accept before Prepare / checkout completion / dispatch / signing handoff** — UI must not enable Prepare until server accept succeeds for the displayed GET authority. Fire-and-forget commercial accept is removed.
5. **Reload** — re-fetch GET snapshot and render those exact bytes before showing accepted/review-ready state.
6. **Dispatch / reissue / signer-complete / public verify** — bind portable seed to the same accepted snapshot record; reject differing client corpus/digest/length/snapshot-id.

## Fail closed (new paid-Pro / post-cutover)

- No accepted snapshot on first dispatch
- Display authority ≠ accept target
- Snapshot agreement mismatch / wrong customer
- Stored bytes fail digest/length integrity
- Submitted portable corpus/digest/length differs
- Snapshot superseded / unaccepted
- Unauthorized accept (non-owner org)
- Registry version conflict
- Accepted snapshot corpus mutation on registry write (`assert_snapshot_immutable_post_accept`)
- Post-cutover reissue / signer-complete without accepted snapshot

## Legacy behavior (deliberate migration only)

**Pure pre-cutover** = sealed `vs01_signing_packet_v1` present, **no** accepted snapshot, **no** snapshot registry activity / `commercialSnapshotAuthorityRequired`.

- New first-seal dispatch still requires an accepted snapshot.
- Continuation (reissue/complete) on a pure pre-cutover sealed packet may proceed under `authority_mode: legacy_packet_pre_snapshot` until migration.
- **Post-cutover commercial** (any pending/accepted snapshot registry write) always requires an accepted snapshot for reissue and signer-complete — no legacy continuation.
- **Migration:** `POST …/canonical-review-snapshot/migrate-legacy` with the **exact** sealed portable seed corpus. Mismatched bytes → `legacy_sealed_corpus_mismatch`. No automatic silent backfill from arbitrary client bytes.

## Client overwrite exceptions

`allowShorterOverwrite` and `differsOnlyByExecutionAppend` affect **client SoT only**. They cannot mutate `accepted_review_snapshot_v1` corpus bytes. A commercial revision requires a new pending snapshot plus explicit `allow_revision: true` accept after the customer reviews the new GET snapshot.
