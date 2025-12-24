# Bitcoin Epoch Anchoring (B=144 blocks)

This spec defines how CLAW batches finalized receipts into a periodic Bitcoin OP_RETURN anchor.

## Summary

- CLAW runs continuously off-chain.
- Once per epoch (every B Bitcoin blocks), CLAW commits a single `epoch_root` to Bitcoin via OP_RETURN.
- Any receipt can later be verified by:
  1) verifying receipt integrity/signatures
  2) verifying inclusion in the epoch Merkle root
  3) verifying the epoch root was anchored in a Bitcoin transaction

## Epoch Definition

- Epoch size: `B = 144` Bitcoin blocks (~1 day).
- Epoch is identified by `(epoch_start_height, epoch_end_height)` inclusive.

### Epoch ID

`epoch_id = "btc:<network>:<epoch_start_height>-<epoch_end_height>"`

Example:
`btc:mainnet:875520-875663`

## Receipt Commitment

For each finalized receipt, compute:

- `receipt_commitment = SHA256(hash_tree_root_hex)`

Where `hash_tree_root_hex` is the hex string (32 bytes) from the proof packet.

Rationale: small, stable, and already commits to clause_hash + signatures + lineage.

## Epoch Merkle Root

Let `C = [c1, c2, ... cn]` be the receipt commitments for the epoch.

### Ordering (MUST)

Sort commitments lexicographically by raw bytes ascending:
- Interpret each `ci` as 32-byte value
- Sort ascending

This ensures multiple nodes compute the same root.

### Tree Rules (MUST)

- Leaves are `ci` (32 bytes).
- Internal node hash:
  - `H(parent) = SHA256( left || right )`
- If odd number of nodes at a level:
  - duplicate the final node (Bitcoin-style duplication)

Result: `epoch_root` (32 bytes).

## Bitcoin OP_RETURN Payload

Payload bytes:

- magic: ASCII "CLAW" => `0x43 0x4c 0x41 0x57`
- version: `0x01`
- epoch_root: 32 bytes
- epoch_start_height: uint32 big-endian (4 bytes)
- epoch_end_height: uint32 big-endian (4 bytes)

Total = 4 + 1 + 32 + 4 + 4 = 45 bytes.

### Payload Hex Layout

`434c4157 01 <epoch_root_32b> <start_height_u32be> <end_height_u32be>`

## Epoch Manifest (off-chain object)

CLAW MUST store an epoch manifest for auditability and inclusion proofs.

Fields:

- epoch_id
- network
- epoch_start_height
- epoch_end_height
- receipt_count
- receipt_commitments (optional, may be stored separately)
- epoch_root
- anchor:
  - type = "bitcoin_opreturn"
  - txid
  - vout (output index containing OP_RETURN)
  - block_height (nullable until confirmed)
  - block_hash (nullable until confirmed)
  - confirmations (nullable)
- manifest_hash = SHA256(canonical_json(manifest_without_manifest_hash))

The manifest may be pinned to IPFS/Arweave later, but is not required for v0.2.

## Inclusion Proof

For any receipt, CLAW MUST be able to return:

- receipt_commitment
- epoch_id
- merkle_path:
  - siblings: [32-byte hex...]
  - positions: ["L"|"R"...] relative to the running hash at each level

Verifier recomputes and confirms it reaches `epoch_root`.

## Verification Requirements

A verifier MUST be able to verify with:

- proof_packet (to recompute hash_tree_root)
- receipt (or receipt_id + proof_packet)
- epoch_id
- merkle_path
- anchor txid (+ optional confirmation requirements)

Verification checks:

1) Integrity: recompute hash_tree_root from proof_packet; must match.
2) Signatures: as per CLAW signature rules (if required).
3) Commitment: receipt_commitment == SHA256(hash_tree_root).
4) Inclusion: MerkleVerify(receipt_commitment, merkle_path) == epoch_root.
5) Anchor: Bitcoin tx OP_RETURN payload matches (epoch_root, start_height, end_height).

## Notes on Decentralization

Multiple independent CLAW nodes may produce the same epoch_root for an epoch.
Any valid anchor tx referencing that epoch_root is acceptable; earliest confirmed may be treated as canonical.
