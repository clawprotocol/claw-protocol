# Accepted review snapshot — commercial first-seal authority

**Baseline:** successor of `00634acf` on the release branch (see git history for this document).  
**Does not authorize deployment.**

## Authority model

| Layer | Role |
|-------|------|
| Frontend `establishPaidProSourceOfTruth` | Client review/freeze coordinator only |
| Server `canonical_review_snapshots_v1` / `accepted_review_snapshot_v1` | Trusted commercial authority |
| Packet-layout witness/signature corpus | Separately hashed derived artifact |

## Lifecycle

1. **Persist pending** — `POST /api/agreements/{id}/canonical-review-snapshot`  
   Immutable snapshot: agreement id, snapshot id, corpus bytes, SHA-256, length, generation/session id, created_at, schema.
2. **Review** — customer-facing review hydrates from the server snapshot (`GET …/canonical-review-snapshot`).
3. **Accept** — `POST …/canonical-review-snapshot/accept` by **snapshot id + digest only** (no replacement corpus). Atomic; concurrency token supported; identical re-accept is idempotent.
4. **Dispatch / reissue / signer-complete** — bind portable seed to accepted snapshot bytes; reject differing client `corpusPlain` / digests; build envelope provenance from server-loaded bytes.
5. **Public verify** — links envelope `acceptedSoTDigest` to accepted snapshot digest (ids/digests only; never corpus or MAC).

## Fail closed (new paid-Pro)

- No accepted snapshot on first dispatch  
- Snapshot agreement mismatch / wrong customer  
- Stored bytes fail digest/length integrity  
- Submitted portable corpus/digest/length differs  
- Snapshot superseded / unaccepted  
- Unauthorized accept (non-owner org)

## Legacy behavior

Drafts that already have a sealed `vs01_signing_packet_v1` **without** an accepted snapshot are classified as `legacy_packet_pre_snapshot`.

- **Do not** silently treat owner-submitted first-dispatch bytes as accepted authority.
- New first-seal dispatch still requires an accepted snapshot (`accepted_review_snapshot_required` or `legacy_packet_requires_reattestation`).
- Continuation (reissue/complete/verify) on a pre-existing sealed packet may proceed under `authority_mode: legacy_packet_pre_snapshot` until re-attestation migrates the draft onto an accepted snapshot.
- Migration: persist the exact sealed corpus as a pending snapshot, accept it (owner), then reissue under `accepted_review_snapshot` mode. No automatic silent backfill from arbitrary client bytes.

## Client overwrite exceptions

`allowShorterOverwrite` and `differsOnlyByExecutionAppend` affect **client SoT only**. They cannot mutate `accepted_review_snapshot_v1` corpus bytes. A commercial revision requires a new pending snapshot plus explicit `allow_revision: true` accept.
