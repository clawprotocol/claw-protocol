# CLAW Timeline Tool API (v1) — Notice + Timeline Evidence System

Status: Draft (implementation-ready)
Audience: Builders, reviewers, hostile verifiers
Purpose: Define a minimal, deterministic API for creating append-only timelines of notices/events, freezing a manifest, and anchoring a frozen manifest into a CLAW receipt.
Scope: Evidence sequencing and authentication only. No adjudication. No legal conclusions.

----------------------------------------------------------------

PRINCIPLES (NON-NEGOTIABLE)

- Evidence only: Receipts prove existence and sequence (timestamped anchoring), not truth or legal effect.
- Append-only: Timelines are immutable once events are accepted; order is mechanical and server-assigned.
- Deterministic hashing: Only hashes (SHA-256 over canonical UTF-8 JSON) are committed.
- Freeze boundary: Only a frozen manifest may be anchored.
- Privacy boundary: Content need not be public; attachments may be referenced by hash/pointer.
- No authority claims: Endpoints never assert legal outcomes; authority derives only from agreement + law.

----------------------------------------------------------------

DATA MODEL SUMMARY

Timeline
- timeline_id
- title
- parties
- created_at (server)
- protocol_version (server)
- network (server-validated)
- manifest (event hashes + manifest hash)
- frozen (boolean)
- frozen_manifest_sha256
- frozen_at

Event
- event_id
- event_index (server-assigned, strictly increasing)
- event_type: notice | marker
- event_time (RFC3339)
- notice OR marker payload
- event_sha256

Manifest
- event_count
- event_hashes (ordered)
- manifest_sha256

Receipt
- receipt_id
- protocol_version
- network
- epoch_id
- btc_txid
- commitment
- merkle_proof [{hash, side}]
- zk_proof_refs (optional)
- issued_at

----------------------------------------------------------------

CANONICALIZATION & HASHING

All hashes are SHA-256 over canonicalized UTF-8 JSON:
- stable key ordering
- stable separators
- no non-deterministic fields

Canonical JSON is never echoed by default — only hashes are returned.

----------------------------------------------------------------

ENDPOINTS

1) CREATE TIMELINE
POST /v1/timelines

REQUEST:
{
  timeline_id?: string,
  title: string,
  parties: [{ role, id, display_name }],
  network?: mainnet|testnet|signet|regtest
}

RESPONSE:
{
  timeline_id,
  protocol_version,
  network,
  created_at,
  title,
  parties,
  manifest: {
    event_count,
    event_hashes[],
    manifest_sha256
  },
  frozen: false,
  frozen_manifest_sha256: null,
  frozen_at: null
}

----------------------------------------------------------------

2) GET TIMELINE SUMMARY
GET /v1/timelines/{timeline_id}

RESPONSE:
{
  timeline_id,
  protocol_version,
  network,
  created_at,
  title,
  parties,
  manifest,
  frozen,
  frozen_manifest_sha256,
  frozen_at
}

----------------------------------------------------------------

3) APPEND EVENT
POST /v1/timelines/{timeline_id}/events

REQUEST:
{
  event_type: notice|marker,
  event_time,
  notice?: {...},
  marker?: {...}
}

RULES:
- Exactly one of notice or marker MUST be present
- Timeline MUST NOT be frozen

RESPONSE:
{
  timeline_id,
  event_id,
  event_index,
  event_type,
  event_time,
  event_sha256,
  manifest
}

----------------------------------------------------------------

4) GET EVENT
GET /v1/timelines/{timeline_id}/events/{event_id}

RESPONSE:
{
  timeline_id,
  event_id,
  event_index,
  event_type,
  event_time,
  notice?,
  marker?,
  event_sha256,
  manifest_sha256
}

----------------------------------------------------------------

5) FREEZE TIMELINE
POST /v1/timelines/{timeline_id}/freeze

REQUEST:
{
  manifest_sha256
}

RESPONSE:
{
  timeline_id,
  frozen_manifest_sha256,
  frozen_at
}

----------------------------------------------------------------

6) ANCHOR FROZEN MANIFEST
POST /v1/timelines/{timeline_id}/anchor

REQUEST:
{
  frozen_manifest_sha256,
  anchor_network: bitcoin-mainnet|bitcoin-testnet,
  epoch_id?
}

RESPONSE:
{
  receipt_id,
  protocol_version,
  network,
  epoch_id,
  btc_txid,
  commitment,
  merkle_proof [{hash, side}],
  zk_proof_refs?,
  issued_at
}

----------------------------------------------------------------

7) FETCH RECEIPT
GET /v1/receipts/{receipt_id}

RESPONSE:
{
  receipt_id,
  protocol_version,
  network,
  epoch_id,
  btc_txid,
  commitment,
  merkle_proof [{hash, side}],
  zk_proof_refs?,
  issued_at
}

----------------------------------------------------------------

INVARIANTS (MUST HOLD)

- No canonical JSON echoed by default
- Append-only timelines with server-assigned ordering
- Discriminated union enforced for events
- Freeze required before anchoring
- Deterministic SHA-256 hashing
- Merkle proofs include left/right positions
- Receipts are evidence only; no legal authority
- Privacy separation between content and commitments

----------------------------------------------------------------

### Liability Attestation (via notice event)

Personal Liability declarations are recorded as `notice` events with a
`liability_attestation` payload.

Required fields:
- subject_role
- capacity
- control_flags
- valid_from
- valid_to (optional)
- declared_exclusions (optional)

These events are immutable once recorded and may be referenced by
agreements (determination clauses) during adjudication.


END OF DOCUMENT
