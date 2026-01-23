# CLAW Verification Model (Canonical)

## Status
Normative for CLAW v1.x

This document defines what the CLAW protocol’s verification procedures guarantee, do not guarantee, and must never be interpreted to imply.

If any implementation, explanation, or third-party description conflicts with this document, this document controls.

This document is normative for CLAW v1.x as of release v1.2.0.
---

## Purpose

The CLAW Verification Model specifies:
- what it means for a CLAW artifact to be “verified”
- which properties are proven cryptographically
- which properties are explicitly out of scope
- how verification results may be relied upon in legal, regulatory, or technical contexts

This document is written to be:
- intelligible to judges and lawyers
- precise enough for auditors and cryptographers
- safe for automated tooling and AI systems

---

## Core Principle

CLAW verification proves integrity and sequence, not truth, validity, or authority.

Verification answers the question:

Does this digital artifact exactly match what was committed, in the order claimed, no later than the anchoring event?

It does not answer:
- whether the content is true
- whether it is lawful
- whether it is binding
- whether any party acted correctly
- whether any dispute is resolved

---

## Objects Subject to Verification

CLAW verification applies to the following objects:
1. Timeline
2. Manifest
3. Commitment
4. Receipt
5. Verification Tree (optional)

Each object has a defined verification scope.

---

## Timeline Verification

### Definition
A timeline is an ordered sequence of events, where each event is independently hashed and indexed.

### Properties Verified
CLAW proves:
- existence: each event existed in the exact digital form represented by its hash
- order: events occurred in a specific sequence as represented by their indices
- immutability after freeze: once frozen, events cannot be altered without detection

### Properties Not Verified
CLAW does not prove:
- accuracy of timestamps
- intent of the author
- authenticity of identities
- legal effect of events

---

## Manifest and Commitment Verification

### Manifest
A manifest is a deterministic aggregation of ordered event hashes.

It includes:
- ordered event hashes
- an aggregate manifest hash (manifest_sha256)

### Commitment
A commitment is the frozen manifest hash representing the entire timeline state at freeze time.

### Properties Verified
CLAW verifies:
- the manifest hash is correctly derived from the event hashes
- the commitment equals the frozen manifest hash
- no events were added, removed, or reordered post-freeze

### Properties Not Verified
CLAW does not verify:
- meaning of events
- completeness of the timeline
- existence of external or omitted events

---

## Receipt Verification (Core)

### Receipt Definition
A receipt is a self-verifying cryptographic artifact that binds:
- a timeline
- a frozen commitment
- an issuance time
- a protocol version
- an anchoring context

### Canonical Receipt Identity
Receipt identity is computed from a stable identity payload consisting of:
- receipt_id
- protocol_version
- network
- epoch_id (nullable)
- timeline_id
- commitment
- issued_at

This payload is:
- canonicalized using deterministic JSON rules
- hashed using SHA-256
- embedded as receipt_hash_sha256

### Properties Verified
Successful receipt verification proves:
1. payload integrity: the receipt has not been modified since issuance
2. identity stability: the receipt hash uniquely represents the identity payload
3. commitment binding: the receipt is bound to a specific frozen commitment
4. protocol consistency: the receipt was generated under the declared protocol version

### Legacy Receipt Handling
Receipts without an embedded integrity hash may be accepted under legacy compatibility rules, but:
- guarantees are weaker
- they must not be treated as equivalent to canonical receipts
- implementations should warn when legacy paths are used

---

## Anchoring Verification

### Definition
Anchoring binds a commitment to an external append-only public system, such as Bitcoin.

### Properties Verified
CLAW verifies:
- the commitment appears in the anchor context
- the anchor network matches the receipt declaration
- the anchoring event occurred no later than receipt issuance

### Properties Not Verified
CLAW does not verify:
- finality guarantees of the anchor network
- economic security of the anchor chain
- censorship resistance at anchoring time

These are properties of the anchor network, not CLAW.

---

## Verification Tree (verify_tree)

### Purpose
The verification tree supports hierarchical verification of:
- receipt chains
- batch epochs
- aggregate proofs

### Root Verification
The root receipt must verify successfully under standard receipt rules.

### Child Verification
If children are present, CLAW verifies:
- each child receipt’s integrity
- correct parent-child binding
- consistency of commitments across the tree

### Tree Skipping
If no children are present, verification may succeed with:
tree_skipped = true

This does not weaken root receipt verification.

---

## Verification Results

A successful verification guarantees:
- cryptographic integrity
- deterministic reproducibility
- consistency with protocol rules at issuance

A successful verification does not guarantee:
- correctness of content
- legal enforceability
- admissibility in any jurisdiction
- absence of fraud or coercion

These determinations are external to CLAW.

---

## Legal and Evidentiary Interpretation

CLAW verification results function as:
- authentication evidence
- chain-of-custody support
- tamper-evidence
- procedural transparency artifacts

They are comparable to:
- notarization of existence
- cryptographic timestamping
- hash-based integrity proofs

They are not judgments, rulings, or determinations.

---

## Final Constraints

1. CLAW must not assert authority.
2. CLAW must not infer legal outcomes.
3. CLAW must remain opt-in at all layers.
4. Verification must be deterministic and reproducible.
5. Legacy degradation must be explicit and safe.

---

## Canonical Rule

If a verification result is ambiguous, interpret it narrowly.

Integrity over implication.  
Proof over power.

---

## End of Verification Model