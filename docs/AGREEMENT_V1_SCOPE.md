# CLAW Agreement Utility — v1 Scope

**Status:** Draft (Canon-forming)  
**Version:** v1  
**Applies to:** CLAW Protocol Agreement Utility

---

## 1. Purpose (Canonical)

CLAW Agreements automate the creation, negotiation, execution, and adjudication of multiparty legal agreements using verifiable timelines, cryptographic signatures, and machine-readable clauses—without acting as a court, giving legal advice, or forcibly enforcing outcomes.

---

## 2. Design Principles

CLAW Agreements are designed to:

- Automate **law itself**, not document storage
- Enable **deterministic and machine-assisted adjudication**
- Preserve **voluntary participation and consent**
- Remain **non-coercive and non-enforcing**
- Be **jurisdiction-aware but jurisdiction-agnostic by default**
- Produce records suitable for courts, arbitration, or private settlement

---

## 3. Agreement Lifecycle (v1)

### 3.1 Drafting & Construction

Agreements are assembled from versioned clauses.

Each draft iteration is recorded as a **timeline event**, including:
- Clause text
- Clause identifiers
- Party attribution
- Timestamps
- Redlines and deltas

All changes are additive and preserved; prior states are never overwritten.

---

### 3.2 Negotiation & Redlining

- Any party may propose edits
- Multiple competing drafts may coexist
- Acceptance or rejection is explicit
- Negotiation history is immutable and attributable

No agreement is legally operative until execution.

---

### 3.3 Execution (Signing)

Execution freezes the agreement state.

Execution binds:
- Identity
- Role
- Capacity
- Time
- Agreement hash
- Jurisdictional declarations (if included)

After execution:
- Agreement text is immutable
- Clause logic is immutable
- Adjudication permissions are frozen

Execution represents a **legal state transition**, not merely a signature.

---

## 4. Clause Model (v1)

Each clause may include:

- Human-readable text
- Optional structured logic
- Declared inputs it may reference
- Declared outputs it may produce
- Whether the clause is adjudicable
- Whether LLM interpretation is permitted

Clauses are:
- Pre-registered
- Versioned
- Hash-addressed
- Explicitly scoped

---

## 5. Disputes & Adjudication

Adjudication is **opt-in**, agreement-defined, and jurisdiction-sensitive.

### 5.1 Adjudication Authority

If **all parties explicitly agree**, and if permitted by their declared jurisdictions, CLAW **may determine outcomes** for civil agreement or contract disputes through:

- Deterministic clause evaluation, and/or
- LLM-assisted interpretation of agreement terms and evidence

This is consistent with U.S. law, where parties may:
- Waive judicial adjudication
- Consent to private decision-makers
- Accept automated or expert determinations in contract disputes

CLAW functions as a **mutually authorized decision system**, not a sovereign authority.

---

### 5.2 Inputs

Adjudication may reference only inputs permitted by the agreement, including:
- Executed agreement text
- Clause logic
- Timeline events
- Party attestations
- Linked evidence
- External references explicitly allowed by clause

No external inference beyond permitted inputs is allowed.

---

### 5.3 Outputs

Adjudication may output:

- Determinations (where authorized)
- Findings and reasoning
- Clause-by-clause evaluations
- Classification tags
- Warnings or limitations

Outputs are:

- **Binding only if explicitly agreed by all parties**
- **Non-binding by default**
- Reviewable
- Exportable
- Appeal-compatible

---

### 5.4 Enforcement Boundary

CLAW **does not enforce outcomes**.

Specifically, CLAW does not:
- Compel performance
- Levy penalties
- Transfer assets without authorization
- Execute judgments

Any enforcement, if desired, occurs:
- Voluntarily
- Via escrow mechanisms
- Through courts or arbitration
- By external systems

---

## 6. Relationship to Liability Utility

- Liability attestations may be referenced as adjudication inputs
- Agreements do not create liability determinations by default
- Liability and agreement utilities are independent but composable

---

## 7. Escrow Integration (Add-On Utility)

Escrow is optional and agreement-defined.

- Activated only if specified in the agreement
- Triggered by clause logic or adjudication outcomes
- No default custody by CLAW
- Initial integrations may include escrow.com

Escrow enables voluntary performance, not coercive enforcement.

---

## 8. Explicit Non-Goals (v1)

CLAW Agreements do **not**:
- Provide legal advice
- Act as a court
- Override jurisdictional law
- Enforce judgments unilaterally
- Impose outcomes without consent
- Replace human legal review

---

## 9. Evidentiary Posture

All agreement artifacts are:

- Time-stamped
- Identity-linked
- Immutable post-execution
- Machine-verifiable
- Human-reviewable

CLAW records are designed to function as **high-integrity legal evidence**.

---

## 10. Summary

CLAW Agreements transform legal agreements from static documents into executable, adjudicable legal systems—capable of determining outcomes when mutually authorized, while remaining voluntary, neutral, and non-enforcing by design.

This defines the Agreement Utility v1 scope.
