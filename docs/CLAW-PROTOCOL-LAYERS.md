# CLAW Protocol Layers (Canonical)

## Status
Normative for CLAW v1.x  
Non-normative and aspirational for CLAW v2+

This document defines the layered architecture of the CLAW protocol and explicitly distinguishes between:

- protocol behavior that exists, is implemented, and is relied upon in CLAW v1.x
- future extensions that are not yet implemented and must not be inferred as present

If any code, explanation, diagram, or third-party description conflicts with this document, this document controls.

---

## Purpose

The CLAW Protocol Layers document exists to:

- describe CLAW as a layered system with constrained responsibilities
- prevent accidental or intentional over-claiming of authority
- make version boundaries explicit for courts, auditors, and integrators
- allow future expansion without retroactively changing v1.x meaning

---

## Core Architectural Principle

Each CLAW layer:
- has a narrowly defined responsibility
- confers no authority outside its scope
- may be composed with, but not substituted for, external systems

No layer independently adjudicates, governs, or compels behavior.

---

## Layer Overview (At a Glance)

### CLAW v1.x (Normative)
1. Timeline Layer
2. Manifest and Commitment Layer
3. Anchoring Layer
4. Receipt Layer
5. Verification Layer

### CLAW v2+ (Non-Normative / Future)
6. Privacy and Zero-Knowledge Layer
7. Automation and Determination Layer
8. Coordination and Escrow Layer
9. Distribution and Cultural Layer

Only layers 1–5 are authoritative in v1.x.

---

## CLAW v1.x — Normative Layers

The following layers are implemented, tested, and relied upon in CLAW v1.x.

### 1. Timeline Layer (v1.x)

**Responsibility**
- Deterministic sequencing of events
- Event hashing and indexing
- Freeze semantics

**Guarantees**
- existence of events in a specific digital form
- deterministic ordering
- immutability after freeze

**Non-Guarantees**
- truth or accuracy of content
- identity authenticity
- legal meaning of events

This layer establishes sequence, not significance.

---

### 2. Manifest and Commitment Layer (v1.x)

**Responsibility**
- Aggregate event hashes deterministically
- Produce a frozen commitment representing timeline state

**Guarantees**
- commitment uniquely represents the frozen event set
- post-freeze modification is detectable

**Non-Guarantees**
- completeness of the timeline
- exclusivity of events
- semantic interpretation of content

This layer binds structure, not narrative.

---

### 3. Anchoring Layer (v1.x)

**Responsibility**
- Bind commitments to external public systems
- Provide public observability and time bounding

**Guarantees**
- commitment appeared no later than the anchor event
- anchor artifacts are independently verifiable

**Non-Guarantees**
- blockchain finality
- irreversibility
- economic security
- legal effect

This layer witnesses existence, not permanence.

(See `ANCHORING_MODEL.md` for canonical semantics.)

---

### 4. Receipt Layer (v1.x)

**Responsibility**
- Produce self-verifying cryptographic receipts
- Bind identity, commitment, protocol version, and time

**Guarantees**
- payload integrity via canonical hashing
- stable receipt identity
- commitment binding

**Non-Guarantees**
- enforceability
- consent
- adjudication
- authority

Receipts prove integrity, not obligation.

---

### 5. Verification Layer (v1.x)

**Responsibility**
- Deterministic verification of receipts and trees
- Reproducible integrity checks

**Guarantees**
- verification results are deterministic
- failures are explainable
- legacy behavior degrades safely

**Non-Guarantees**
- admissibility
- legal sufficiency
- correctness of content

Verification confirms structure, not truth.

(See `VERIFICATION_MODEL.md` for canonical guarantees.)

---

## CLAW v2+ — Non-Normative Future Layers

The following layers are aspirational and explicitly **not present in v1.x**.

They must not be relied upon or inferred as implemented.

---

### 6. Privacy and Zero-Knowledge Layer (v2+)

**Intended Scope**
- selective disclosure
- private commitments
- ZK proofs over timelines

**Status**
Not implemented.  
No privacy guarantees exist in v1.x.

---

### 7. Automation and Determination Layer (v2+)

**Intended Scope**
- automated outcomes by explicit agreement
- opt-in determination clauses
- bounded execution logic

**Constraints**
- no coercion
- no unilateral authority
- no default activation

**Status**
Conceptual only.  
No automated determinations exist in v1.x.

---

### 8. Coordination and Escrow Layer (v2+)

**Intended Scope**
- voluntary escrow coordination
- settlement assistance
- external system integration

**Status**
Not implemented.  
No funds custody or control exists in v1.x.

---

### 9. Distribution and Cultural Layer (v2+)

**Intended Scope**
- community access
- cultural signaling
- pricing and participation incentives

**Status**
Non-authoritative by design.  
Never required for verification or anchoring.

Courts and auditors need not reference this layer.

---

## Version Boundary Rule

Anything not explicitly described as v1.x:
- does not exist
- must not be assumed
- must not be relied upon
- must not be implied

Future versions must:
- introduce new protocol identifiers
- preserve v1.x semantics
- avoid retroactive reinterpretation

---

## Canonical Interpretation Rule

If ambiguity arises:
- prefer the narrower interpretation
- defer to verification and anchoring models
- reject implied authority

CLAW is intentionally minimal.

---

## End of Protocol Layers