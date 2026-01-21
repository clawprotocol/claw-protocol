# CLAW v1.x — Cryptographic Proof & Verification System
## Court-Safe Summary (Non-Technical)

**Version:** CLAW v1.x  
**Status:** Implemented, operational, and verifiable  
**Scope:** Proof of existence, sequence, and integrity only
**Interpretation Rule:**  
This document shall be interpreted narrowly.  
Silence does not imply capability, authority, or intent.

Interpretation of CLAW v1.x behavior is further constrained by the binding Semantic Lock defined in `SEMANTIC_LOCK.md`.

---


## 1. What CLAW Is

CLAW is a software system that produces **cryptographic proof objects** showing that specific digital content:

- existed in a specific form,
- no later than a specific time,
- and has not been altered since.

CLAW does **not** evaluate truth, legality, or merit.  
It records and verifies **facts about data**, not claims about reality.

---

## 2. What CLAW Proves

Using standard cryptographic techniques and public blockchain data, CLAW can prove:

- that a specific digital artifact existed at or before a known time
- that a sequence of events occurred in a specific order
- that the data presented today matches what was committed previously
- that verification can be reproduced by any third party

These proofs are **portable**, **verifier-agnostic**, and **deterministic**.

---

## 3. What CLAW Explicitly Does NOT Do

CLAW does **not**:

- determine truth or falsity of statements
- authenticate identity by itself
- adjudicate disputes
- issue judgments or rulings
- compel action or enforcement
- hold or transfer funds
- replace courts, lawyers, or arbitrators

Any legal effect arises **only from external law or agreement**, not from CLAW itself.

---

## 4. How the System Works (Plain English)

CLAW operates in five steps:

1. **Timeline Creation**  
   Digital events are recorded in sequence and cryptographically hashed.

2. **Commitment Formation**  
   Event hashes are aggregated into a single deterministic commitment.

3. **Public Anchoring**  
   The commitment is anchored to a public blockchain (Bitcoin), establishing a time bound.

4. **Receipt Generation**  
   The receipt is a cryptographic record, not a legal instrument. A cryptographic receipt is produced containing:
   - protocol version
   - commitment hash
   - timestamp
   - network reference
   - integrity hash

5. **Independent Verification**  
   Any third party can recompute all hashes and confirm the proof using public data.

---

## 5. Why Bitcoin Is Used

Bitcoin is used solely as a **public, neutral timestamping system**.

It provides:
- global observability
- resistance to unilateral alteration
- long-term auditability

Bitcoin does **not**:
- validate content
- endorse meaning
- confer legal authority

It serves as a **court-grade clock**, nothing more.

---

## 6. Verification and Failure Modes

Verification is deterministic and repeatable.

If:
- data is altered → verification fails
- hashes do not match → verification fails
- anchor data is missing → verification fails

Blockchain reorganizations, if they occur, are handled conservatively and transparently.

Failures are explicit and explainable.

---

## 7. Version Boundary

This document describes **CLAW v1.x only**.

Features such as:
- privacy shielding
- automated determinations
- escrow coordination
- governance mechanisms

do **not** exist in v1.x and must not be inferred.

Future versions require new protocol identifiers and do not retroactively alter v1.x meaning.

---

## 8. Summary Statement

CLAW v1.x is a **cryptographic record and verification system**.

It provides reliable answers to:
- *When did this exist?*
- *Has it changed?*
- *Can this be independently verified?*

It does not answer:
- *Is this true?*
- *Is this lawful?*
- *What should be done?*

Those questions remain the province of law, courts, and human judgment.

---

## End of Document