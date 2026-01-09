# CLAW Protocol — Genesis Declaration (v0)

**Protocol Name:** CLAW  
**Genesis Version:** v0  
**Status:** FINAL · IMMUTABLE  
**Declared:** 2026-01-06 UTC (effective upon Bitcoin confirmation)

---

## 1. Purpose

This document declares the **Genesis completion** of the CLAW Protocol version 0 
(“CLAW v0”).

CLAW v0 is hereby fixed as an immutable public proof standard.  
All future versions of CLAW MUST fork explicitly from this genesis.

---

## 2. Governing Specification (Constitution)

The canonical governing document for CLAW v0 is:

This specification defines all normative rules for:
- hashing
- receipts
- Merkle construction
- receipt commitments
- Bitcoin anchoring semantics

No other document has equal or higher authority.

---

## 3. On-Chain Constitutional Anchor

The governing specification (`CLAW-PROOF-v0.md`) has been cryptographically committed
to the Bitcoin blockchain via OP_RETURN.

This anchor serves as the **constitutional root** of CLAW v0.

Verification requires:
1. Hashing `CLAW-PROOF-v0.md` as specified
2. Computing the CLAW receipt commitment
3. Matching the value embedded in the referenced Bitcoin transaction

---

## 4. Immutability & Fork Rule

CLAW v0 MUST NOT be modified.

Any future version:
- MUST declare a new version identifier
- MUST reference this genesis
- MUST publish a new governing specification
- MUST anchor independently on-chain

---

## 5. Scope of This Document

This document:
- Declares finality
- Establishes governance
- Records history

This document does NOT:
- Define protocol mechanics
- Override the governing specification
- Replace cryptographic verification

---

**CLAW v0 is hereby declared complete.**


