# CLAW v1.x — 1-Page Verifier Diagram

This page provides a court-safe, non-technical visual model for how a third party
independently verifies a CLAW v1.x receipt.

It is intentionally minimal and scope-limited.

---

## Verifier Mental Model (One Page)

┌───────────────────┐
│ Digital Artifact │
└─────────┬─────────┘
│
┌─────────▼─────────┐
│ Canonicalization │
└─────────┬─────────┘
│
┌─────────▼─────────┐
│ Commitment Hash │
└─────────┬─────────┘
│
┌─────────▼─────────┐
│ Receipt │
└─────────┬─────────┘
│
┌─────────▼─────────┐
│ Verification │
└───────────────────┘

yaml
Copy code

---

## Box-by-Box Meaning (Plain English)

### 1) Digital Artifact
A file, text, or structured dataset in a specific digital form (bytes).

### 2) Canonicalization
The artifact (or derived structure) is converted into a deterministic byte representation
using published rules, so independent implementations produce identical bytes.

### 3) Commitment Hash
A cryptographic hash is computed from the canonicalized bytes, producing a stable commitment.

### 4) Receipt
A CLAW receipt records the commitment (and associated identifiers such as protocol version and
time reference) so others can later re-check the commitment deterministically.

### 5) Verification
Any third party can independently recompute hashes from the same inputs and confirm that the
receipt’s commitments are consistent with the claimed artifact and the published rules.

---

## Boundary (Non-Negotiable)

**Important:** CLAW verification confirms **cryptographic commitment consistency** (existence, sequence,
and integrity of referenced data). It does **not** evaluate truth, legality, intent, authorship, consent,
admissibility, enforceability, or merits. CLAW does **not** adjudicate disputes, issue rulings, or confer
legal authority. Any legal significance, if any, arises solely from external law or voluntary agreement.

---

## Canonical References

Use these as the authoritative entry points for verification and interpretation:

- **Verification procedure:** `docs/VERIFY.md`
- **Verifier entry (non-technical):** `docs/VERIFIER_ENTRY.md`
- **Reproduction pack (frozen example + one-command verifier):** `repro/README.md`
- **Interpretation / meaning lock:** `docs/INTERPRETATION.md`
- **Semantic lock (anti-authority drift):** `docs/SEMANTIC_LOCK.md`