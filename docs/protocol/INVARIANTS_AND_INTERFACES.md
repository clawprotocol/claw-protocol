# CLAW Protocol — Invariants & Interfaces (v0.1)
_Last updated: 2025-12-20_

This document is the **source-of-truth spec** for CLAW’s core safety and interoperability guarantees.
It defines (1) canonical hashing/canonicalization, (2) receipt anchoring (“court of record”), (3) Solana market-rail
mint/burn relay semantics, (4) storage pointers, (5) role predicates, and (6) required invariants.

---

## 0. Terms

- **Base / EVM**: Canonical settlement + receipts + governance (“Court of Record”).
- **Solana**: Distribution + liquidity (“Market Rail”).
- **CLAW**: Canonical token on Base (authority-bearing).
- **sCLAW**: Solana receipt/market token (non-authority-bearing).
- **Packet**: A signed, hashed, content-addressed artifact (Extraction, Sign Packet, Proof Packet).
- **Receipt**: Onchain Base event committing to (document hash, proof packet hash, storage pointer, issuer, version).

---

## 1) Canonicalization & Hashing

### 1.1 Hash function (single choice)
Use **SHA-256** everywhere for offchain and storage commitments.

- `H(x) = sha256(x)` where `x` is bytes.
- Hex encoding is lowercase, no `0x` prefix unless explicitly stated.

> If/when we require EVM-native hashing, we MAY additionally compute `keccak256` for convenience,
> but SHA-256 remains the canonical cross-chain commitment.

### 1.2 Canonical JSON (must be deterministic)
All structured artifacts that are hashed MUST be canonicalized as follows:

- UTF-8 encoding
- No insignificant whitespace
- Object keys sorted lexicographically (byte order)
- Arrays preserved in order
- Numbers encoded without trailing zeros (JSON standard)
- No NaN/Infinity
- Newlines normalized to `\n`

Define:
- `canon(obj) -> bytes` = canonical JSON serialization as above.

### 1.3 Canonical commitments
For a document `D_bytes`:

- `doc_hash = H(D_bytes)`

For extraction output `E_obj`:

- `extract_hash = H(canon(E_obj))`

For proof packet `P_obj`:

- `packet_hash = H(canon(P_obj))`

For sign packet `S_obj`:

- `sign_hash = H(canon(S_obj))`

---

## 2) Artifact Storage Pointers (IPFS / Arweave)

### 2.1 Storage identifiers
- **IPFS CID** is the default pointer for packets.
- **Arweave TXID** is an optional long-term archive pointer.

Fields:
- `ipfs_cid` (string, optional but recommended)
- `arweave_txid` (string, optional)

### 2.2 Storage must match the commitment
If `ipfs_cid` is present, then:
- `H( bytes_fetched_from_ipfs(ipfs_cid) ) == packet_hash`

If `arweave_txid` is present, then:
- `H( bytes_fetched_from_arweave(arweave_txid) ) == packet_hash`

---

## 3) Court of Record (Base) — Receipt Registry

### 3.1 Receipt event schema (minimum)
The Base “ReceiptRegistry” MUST emit an event containing:

- `doc_hash: bytes32`
- `packet_hash: bytes32`
- `storage_ref: bytes` (encoded pointer, e.g. CID bytes / multibase string bytes)
- `issuer: address` (msg.sender)
- `version: string` (protocol/app version, e.g. "claw/v0.1")
- `nonce: uint256` (optional but recommended for uniqueness)
- `timestamp: uint64` (implicit via block timestamp; MAY also be included explicitly)

**Event name (suggested):**
`ReceiptAnchored(bytes32 doc_hash, bytes32 packet_hash, bytes storage_ref, address issuer, string version, uint256 nonce)`

### 3.2 Verification predicate (definition of “truth”)
A proof is valid if and only if all are true:

1) `doc_hash == H(D_bytes)`
2) `packet_hash == H(canon(P_obj))`
3) `storage_ref` resolves to bytes that hash to `packet_hash` (if storage is provided)
4) A matching `ReceiptAnchored(doc_hash, packet_hash, storage_ref, issuer, version, nonce)` exists in Base logs

This is the canonical verifier:

`Verify(D_bytes, P_obj, storage_ref) -> bool`

### 3.3 Versioning
`version` MUST be a stable string:
- `claw/vMAJOR.MINOR` (e.g. `claw/v0.1`)

Breaking changes MUST increment MAJOR.

---

## 4) Role & Authority Predicates (Base)

Roles are enforced on Base and optionally mirrored offchain.

### 4.1 Roles
- `PUBLIC`
- `LAWYER_VERIFIED`
- `CLAUSE_AUTHOR` (optional, can be subset of lawyer verified)
- `NODE_OPERATOR`
- `ADMIN/GOVERNANCE`

### 4.2 Required gates (minimum)
- Only `LAWYER_VERIFIED` (or `CLAUSE_AUTHOR`) can **publish/register official clause libraries**.
- Only `ADMIN/GOVERNANCE` can update protocol parameters (fees, caps, allowlists) and relay permissions.
- Receipt anchoring may be allowed for `PUBLIC` or paid tiers; however, “official registry” actions require lawyer roles.

### 4.3 Credential interface (future-proof)
Role checks MUST be expressed as a predicate:

`hasRole(address user, bytes32 role) -> bool`

Future upgrades may substitute a ZK credential check (Aztec/Noir), but the interface remains.

---

## 5) Solana Market Rail — sCLAW Representation

### 5.1 sCLAW is non-authority-bearing
sCLAW confers:
- tradability / distribution
- optional redemption to canonical CLAW (if enabled)

sCLAW does NOT confer:
- governance power
- clause registration rights
- protocol authority

### 5.2 Lockbox model (Base canonical)
A Base Lockbox contract maintains locked CLAW balances.

Let:
- `L = total_locked_CLAW_in_lockbox` (Base)
- `S = total_supply_sCLAW` (Solana)

**Core supply integrity invariant:**
- **Invariant I1:** `S <= L` must always hold.

---

## 6) Cross-Chain Relay Semantics (Base → Solana → Base)

This is a **relay** (ferry), not a “shared-consensus bridge.”

### 6.1 Unique event IDs (replay protection)
Every Base lock event and Solana burn event MUST have a unique ID.

Define:
- `id = sha256(chain_id || tx_hash || log_index)` for EVM logs
- `id = sha256(solana_signature || instruction_index)` for Solana events

IDs MUST be stored to prevent reprocessing:
- Solana program stores processed Base lock IDs for minting
- Base contract stores processed Solana burn IDs for unlocking

### 6.2 Base → Solana: Lock & Mint
Base emits:
`Locked(id, base_sender, amount, solana_pubkey, nonce, claw_contract, lockbox, timestamp)`

Relay rules:
- A relay MAY mint sCLAW **iff** it can prove the Base `Locked` event exists and is final.
- Solana must record `id` as processed before mint completes.

### 6.3 Solana → Base: Burn & Unlock
Solana emits:
`Burned(id, solana_sender, amount, base_recipient, nonce, mint, timestamp)`

Relay rules:
- A relay MAY request unlock on Base **iff** it can prove the Solana `Burned` event exists.
- Base must record `id` as processed before unlock completes.

### 6.4 Relay trust boundary
Relays are permitted by Base governance (initially allowlisted).
If relay set fails or is paused:
- bridging halts (liveness loss)
- court-of-record receipts and canonical CLAW remain correct (safety preserved)

---

## 7) Failure Containment Guarantees

### 7.1 Solana failure
If Solana is congested/out:
- sCLAW markets may pause or degrade
- Base receipts remain final and verifiable

### 7.2 Relay failure / compromise
If relays fail:
- mint/unlock operations can be paused
- supply integrity remains enforceable by processed-ID checks and caps

### 7.3 Storage failure
If IPFS/Arweave is unavailable:
- onchain receipts still prove commitment (hashes)
- availability can be restored by re-pinning / re-archiving identical bytes (same hash)

---

## 8) Minimum API Interfaces (Backend)

The backend MUST implement versioned endpoints whose outputs match the canonicalization rules.

Suggested:

- `POST /v1/documents` → returns `document_id`, `doc_hash`
- `POST /v1/documents/{id}/extract` → returns `extract_hash`, `extraction_object`
- `POST /v1/documents/{id}/sign_packet` → returns `sign_hash`, `sign_packet`
- `POST /v1/documents/{id}/proof_packet` → returns `packet_hash`, `proof_packet`
- `POST /v1/packets/{id}/store` → returns `ipfs_cid` (and optional `arweave_txid`)
- `POST /v1/receipts/anchor` → anchors `(doc_hash, packet_hash, storage_ref, version)`
- `GET  /v1/receipts/verify?doc_hash=...&packet_hash=...` → returns receipt match details

All endpoints MUST return hashes computed using `H(canon(obj))`.

---

## 9) Checklist: “Mathematical Completeness” Conditions

The architecture is considered complete if:

- C1: Canonicalization is deterministic (Section 1.2).
- C2: Every packet has a canonical hash commitment (Section 1.3).
- C3: Truth is decidable via `Verify()` (Section 3.2).
- C4: Solana supply integrity is bounded by `S <= L` (Section 5.2).
- C5: Cross-chain actions are replay-protected by unique IDs (Section 6.1).
- C6: Roles gate privileged actions (Section 4.2).
- C7: Failures degrade liveness without corrupting truth (Section 7).

---

## 10) Notes / Non-Goals (v0.1)
- This document does not specify tokenomics, fee rates, or treasury allocation.
- This document does not specify bar verification mechanics (only the role interface).
- This document does not require Chainlink/Thorchain/Arweave at launch; it defines how they plug in.

---
