# CLAW Protocol — Invariants & Interfaces (v1.x, Non-Adjudicative)
_Last updated: 2026-01-23_

This document defines the **technical invariants and interfaces** required for
CLAW v1.x to produce **deterministic, reproducible cryptographic verification results**.

It is a **non-governing, non-adjudicative specification**.

Nothing in this document:
- confers legal authority,
- defines truth or falsity,
- creates adjudication,
- replaces courts, judges, or due process,
- or implies enforceability absent external law or agreement.

If any interpretation conflict arises, this document must be read
**narrowly and against implied authority**, consistent with
`SEMANTIC_LOCK.md` and `INTERPRETATION.md`.

---

## 0. Terms (Neutral, Non-Authoritative)

- **Base / EVM**  
  Canonical *receipt registry and settlement rail* for CLAW artifacts.
  Stores immutable logs used for verification.  
  *Not a court, not a source of legal authority.*

- **Solana**  
  Distribution and liquidity rail for non-authoritative representations.

- **CLAW (Base)**  
  Canonical protocol token used for access control and economic plumbing.  
  *Does not confer adjudicative or legal authority.*

- **sCLAW (Solana)**  
  Non-authoritative, derivative representation for distribution only.

- **Packet**  
  A signed, hashed, content-addressed artifact
  (Extraction Packet, Sign Packet, Proof Packet).

- **Receipt**  
  A registry event committing to cryptographic hashes and metadata.
  Receipts are **evidence objects**, not judgments.

---

## 1) Canonicalization & Hashing

### 1.1 Hash function (single canonical choice)
Use **SHA-256** for all canonical commitments.

- `H(x) = sha256(x)` where `x` is bytes.
- Hex encoding is lowercase, no `0x` prefix unless explicitly stated.

> Additional hashes (e.g. `keccak256`) MAY be computed for platform convenience,
> but **SHA-256 remains the canonical verification hash**.

---

### 1.2 Canonical JSON (deterministic requirement)

All structured artifacts that are hashed MUST be canonicalized as follows:

- UTF-8 encoding
- No insignificant whitespace
- Object keys sorted lexicographically (byte order)
- Arrays preserved in order
- Numbers encoded without trailing zeros
- No NaN / Infinity
- Newlines normalized to `\n`

Define:
- `canon(obj) → bytes` = canonical JSON serialization

---

### 1.3 Canonical commitments

For document bytes `D`:
- `doc_hash = H(D)`

For extraction output `E`:
- `extract_hash = H(canon(E))`

For proof packet `P`:
- `packet_hash = H(canon(P))`

For sign packet `S`:
- `sign_hash = H(canon(S))`

These hashes are **identity commitments**, not semantic claims.

---

## 2) Artifact Storage Pointers (Availability Only)

### 2.1 Storage identifiers
- **IPFS CID** — default availability pointer
- **Arweave TXID** — optional long-term archive pointer

Optional fields:
- `ipfs_cid`
- `arweave_txid`

---

### 2.2 Storage integrity invariant

If a storage pointer is provided:

- `H(bytes_fetched(pointer)) == packet_hash`

Failure of storage availability **does not invalidate receipts**.
It affects availability, not verification.

---

## 3) Receipt Registry (Base)

### 3.1 Receipt event schema (minimum)

A receipt registry MUST emit an event containing:

- `doc_hash: bytes32`
- `packet_hash: bytes32`
- `storage_ref: bytes`
- `issuer: address`
- `version: string`
- `nonce: uint256` (optional)
- `timestamp: uint64` (implicit or explicit)

**Suggested event name:**
ReceiptAnchored(
bytes32 doc_hash,
bytes32 packet_hash,
bytes storage_ref,
address issuer,
string version,
uint256 nonce
)

yaml
Copy code

This event is a **public log**, not a ruling.

---

### 3.2 Verification predicate (no truth claims)

A receipt verifies if and only if:

1. `doc_hash == H(D_bytes)`
2. `packet_hash == H(canon(P_obj))`
3. `storage_ref` (if present) resolves to bytes hashing to `packet_hash`
4. A matching `ReceiptAnchored(...)` event exists in Base logs

Define:
Verify(D_bytes, P_obj, storage_ref) → bool

yaml
Copy code

This predicate proves **integrity and sequence**, not truth, legality, or merit.

---

### 3.3 Versioning
`version` MUST be stable:
- `claw/vMAJOR.MINOR`

Breaking changes MUST increment MAJOR.
Older versions remain verifiable indefinitely.

---

## 4) Roles & Capability Gates (Non-Adjudicative)

Roles control **who may perform protocol actions**, not legal authority.

### 4.1 Roles
- `PUBLIC`
- `LAWYER_VERIFIED`
- `CLAUSE_AUTHOR`
- `NODE_OPERATOR`
- `ADMIN`

Roles **do not** imply adjudicative power.

---

### 4.2 Capability gates

- Only `LAWYER_VERIFIED` / `CLAUSE_AUTHOR` may publish *official clause libraries*
- Only `ADMIN` may adjust protocol parameters (fees, caps, allowlists)
- Receipt anchoring MAY be open to public or paid tiers

All gates regulate **protocol behavior**, not legal outcomes.

---

### 4.3 Role predicate interface

hasRole(address user, bytes32 role) → bool

yaml
Copy code

Future implementations MAY substitute ZK credentials, but semantics remain unchanged.

---

## 5) Solana Market Rail (Non-Authoritative)

### 5.1 sCLAW properties

sCLAW enables:
- distribution
- liquidity
- optional redemption mechanics

sCLAW does **not** enable:
- governance
- adjudication
- clause authority
- enforcement power

---

### 5.2 Supply integrity invariant

Let:
- `L` = locked CLAW on Base
- `S` = total sCLAW supply on Solana

**Invariant I1:**  
`S ≤ L` must always hold.

This is a **numerical safety invariant**, not a governance rule.

---

## 6) Cross-Chain Relay Semantics (Safety Only)

Relays are **message ferries**, not shared-consensus bridges.

### 6.1 Replay protection

Each cross-chain event MUST have a unique ID:

- EVM: `sha256(chain_id || tx_hash || log_index)`
- Solana: `sha256(signature || instruction_index)`

Processed IDs MUST be stored to prevent replay.

---

### 6.2 Failure posture

If relays fail:
- mint/unlock halts
- verification remains correct
- receipts remain valid

Safety > liveness.

---

## 7) Failure Containment Guarantees

- Storage failure → availability loss only
- Relay failure → bridging halts, verification intact
- Chain congestion → no corruption of receipts

Failures **never create false verification success**.

---

## 8) Backend Interface Requirements

All backend endpoints MUST:
- return canonical hashes
- use deterministic serialization
- avoid non-deterministic fields

Suggested (illustrative only):

- `POST /v1/documents`
- `POST /v1/extract`
- `POST /v1/proof_packet`
- `POST /v1/receipts/anchor`
- `GET  /v1/receipts/verify`

---

## 9) Completeness Conditions (Verification-Only)

The system satisfies its guarantees if:

- C1: Canonicalization is deterministic
- C2: Every artifact has a stable hash
- C3: Verification is reproducible
- C4: Cross-chain supply invariants hold
- C5: Replays are impossible
- C6: Privileged actions are gated
- C7: Failures degrade liveness, not correctness

---

## 10) Explicit Non-Goals

This document does NOT define:
- legal enforceability
- jurisdiction
- adjudication
- governance legitimacy
- token economics
- judicial authority

Those concepts, if applicable, arise **only from external law or agreement**.

---