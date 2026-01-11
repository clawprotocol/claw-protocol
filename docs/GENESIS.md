# CLAW Protocol — Genesis Declaration (v0)

**Protocol Name:** CLAW  
**Genesis Version:** v0  
**Status:** FINAL · IMMUTABLE  
**Declared:** 2026-01-06 UTC  
**Effective:** Upon Bitcoin confirmation of the constitutional anchor  

---

## 1. Purpose

This document formally declares the **Genesis completion** of the CLAW Protocol version 0 (“CLAW v0”).

CLAW v0 is hereby fixed as an immutable, public proof standard.  
All future versions of CLAW MUST fork explicitly from this Genesis.

This declaration establishes the constitutional baseline from which all future protocol evolution must proceed.

---

## 2. Governing Specification (Constitution)

The sole canonical governing document for CLAW v0 is:

**`CLAW-PROOF-v0.md`**

That specification is **normative** and defines all authoritative rules for:

- Canonical hashing
- Receipt construction
- Merkle tree formation
- Receipt commitments
- Bitcoin OP_RETURN anchoring semantics
- Verification requirements

No other document in this repository has equal or higher authority.

In the event of conflict, ambiguity, or inconsistency,  
**`CLAW-PROOF-v0.md` SHALL prevail.**

---

## 3. On-Chain Constitutional Anchor

The governing specification (`CLAW-PROOF-v0.md`) has been cryptographically committed to the Bitcoin blockchain via OP_RETURN.

This anchor serves as the **constitutional root** of CLAW v0.

Verification of the Genesis requires:

1. Hashing `CLAW-PROOF-v0.md` according to the specification
2. Computing the CLAW receipt commitment
3. Matching the computed value to the value embedded in the referenced Bitcoin transaction

Once confirmed, this anchor establishes an immutable, timestamped, public root of trust.

---

## 4. Immutability & Fork Rule

CLAW v0 MUST NOT be modified.

Any future version of the protocol:

- MUST declare a new version identifier
- MUST explicitly reference this Genesis
- MUST publish a new governing specification
- MUST anchor independently on-chain

Failure to do so constitutes a **non-canonical fork**.

---

## 5. Frozen Surface Area (Genesis v0)

Upon tagging, the following files are **frozen for verification purposes** and MUST NOT change:

- `CLAW-PROOF-v0.md`
- `PROTOCOL.md`
- `VERIFY.md`
- `LAUNCH_INDEX.md`
- `HASHES.genesis-v0.sha256`
- `GENESIS.md`

The SHA-256 digests of these files are recorded in `HASHES.genesis-v0.sha256`.

Any alteration invalidates Genesis integrity.

---

## 6. Post-Genesis Runtime Implementations (Non-Governing)

After Genesis declaration, implementation code, tooling, UI components, and auxiliary documentation MAY evolve within this repository.

Such materials:

- Are explicitly **non-governing**
- MUST conform to the rules defined in `CLAW-PROOF-v0.md`
- MUST NOT reinterpret, override, or supersede the governing specification
- MAY change without constituting a protocol fork

In all cases, the governing specification and its on-chain anchor SHALL prevail.

---

## 7. Scope of This Document

This document:

- Declares Genesis finality
- Establishes constitutional authority
- Records historical provenance

This document does NOT:

- Define protocol mechanics
- Replace cryptographic verification
- Grant authority beyond what is anchored on-chain

---

**CLAW v0 is hereby declared complete.**
