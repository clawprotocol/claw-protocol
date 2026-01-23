# CLAW Protocol — Events & ABIs (v0.1)
_Last updated: 2025-12-20_

This document defines the canonical onchain event interfaces for:
- Base/EVM Receipt Registry (receipt anchoring events)
- Base Lockbox (Base → Solana mint authority)
- Solana Market Rail (Solana → Base redeem authority)

These events are designed to be:
- unambiguous (typed fields)
- replay-resistant (unique IDs)
- indexable (court-legible audit trail)

---

## 0) Common Conventions

### 0.1 Hash representation
- `bytes32` on EVM is the 32-byte output of `sha256(bytes)` where the input bytes are canonicalized per `CANON_JSON.md`.
- If you also store `keccak256` in future, it must be clearly labeled (not a replacement for sha256).

### 0.2 Event IDs (replay protection)
Each cross-chain event has an ID, computed offchain:

**EVM log ID:**
`id = sha256( chain_id || tx_hash || log_index )`

Where:
- `chain_id` is encoded as 32-byte big-endian uint
- `tx_hash` is 32 bytes
- `log_index` is 32-byte big-endian uint

**Solana event ID:**
`id = sha256( signature || instruction_index )`

Where:
- `signature` is the 64-byte Solana transaction signature (as raw bytes)
- `instruction_index` is 32-byte big-endian uint

IDs MUST be stored by the mint/burn programs to prevent replays.

---

## 1) Base/EVM: Receipt Registry (anchoring events)

### 1.1 Purpose
Anchors proof receipts so any third party can verify:
- a document hash existed at time T
- a proof packet hash existed at time T
- a storage pointer (e.g., IPFS CID) identifies the exact packet bytes

### 1.2 Required event
**Event:**
`ReceiptAnchored(bytes32 doc_hash, bytes32 packet_hash, bytes storage_ref, address issuer, string version, uint256 nonce)`

**Fields**
- `doc_hash`: sha256(document_bytes)
- `packet_hash`: sha256(canonical_json_bytes_of_proof_packet)
- `storage_ref`: opaque bytes (typically UTF-8 of a CID like "ipfs://<cid>" or "ar://<txid>")
- `issuer`: `msg.sender`
- `version`: `"claw/v0.1"` (or later)
- `nonce`: user/backend-supplied uniqueness (optional but recommended)

**Indexing**
- Consider indexing `doc_hash` and `packet_hash` for efficient filtering:
  - `event ReceiptAnchored(bytes32 indexed doc_hash, bytes32 indexed packet_hash, ... )`

### 1.3 Example storage_ref encodings
- IPFS: `b"ipfs://bafy..."`
- Arweave: `b"ar://<txid>"`
- Multi: `b"ipfs://...;ar://..."` (only if you want a simple concatenation format)

---

## 2) Base/EVM: Lockbox (Base → Solana mint authority)

### 2.1 Purpose
Locks canonical CLAW on Base and emits an immutable event authorizing sCLAW minting on Solana.

### 2.2 Required event
**Event:**
`Locked(bytes32 id, address indexed base_sender, uint256 amount, bytes32 solana_pubkey, uint256 nonce, address claw_token, address lockbox)`

**Fields**
- `id`: computed offchain from `(chain_id, tx_hash, log_index)` (see 0.2)
- `base_sender`: the address locking CLAW
- `amount`: amount of canonical CLAW locked
- `solana_pubkey`: 32-byte Solana destination pubkey (raw bytes)
- `nonce`: user/backend-supplied uniqueness (recommended)
- `claw_token`: CLAW token contract address
- `lockbox`: this lockbox contract address

**Notes**
- If you support multiple destination chains later, add `dest_chain: uint32` and/or `dest_domain: bytes32`.

---

## 3) Solana: Market Rail (Solana → Base redeem authority)

### 3.1 Purpose
Burns sCLAW on Solana and emits an immutable event authorizing unlock/redeem on Base.

### 3.2 Required event (conceptual)
Solana programs don’t emit EVM-style events, but we define a canonical “burn receipt” payload that MUST be present
in the program logs/state so relayers can parse and prove it.

**Burn receipt payload (serialized JSON or Borsh—choose one and standardize):**
- `id`: sha256(signature || instruction_index)
- `solana_sender`: pubkey (base58 string or raw bytes)
- `amount`: u64/u128 (define which; prefer u64 if supply fits)
- `base_recipient`: 20-byte EVM address (raw bytes) OR EIP-55 string
- `nonce`: u64
- `mint`: sCLAW mint address (pubkey)
- `timestamp`: unix seconds (optional; chain time can be derived)

**Canonical field types (recommended)**
- `id`: 32 bytes
- `solana_sender`: 32 bytes
- `amount`: u64
- `base_recipient`: 20 bytes
- `nonce`: u64
- `mint`: 32 bytes

### 3.3 Base-side unlock processing
Base Lockbox MUST provide a method like:
`unlockFromSolana(bytes32 id, address base_recipient, uint256 amount, bytes32 solana_sender, uint64 nonce)`

Rules:
- reject if `id` already processed
- mark `id` processed before transferring
- transfer canonical CLAW to `base_recipient`

---

## 4) Optional: Node DAO / Operator Attestations (future)
If/when nodes attest to verification/pinning, define:

`NodeAttested(bytes32 doc_hash, bytes32 packet_hash, bytes32 attestation_hash, address node, string version, uint256 nonce)`

Not required for v0.1 launch.

---
