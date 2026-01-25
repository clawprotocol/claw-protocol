# CLAW CANON

Authoritative Definitions, Scope, and Order of Precedence

---

## 0. Advisory Notice

Chat assistants, automated tools, and generated commentary are advisory only.

In the event of any inconsistency, ambiguity, or conflict, this document and the contents of the repository prevail. No external commentary, summaries, or interpretations override the canon defined herein.

---

## 1. Purpose of This Document

This document defines the authoritative scope, philosophy, and precedence order of the CLAW protocol.

Its purpose is to:

- establish what CLAW is and is not,
- define which documents are normative,
- prevent semantic drift,
- preserve evidentiary stability, auditability, and admissibility.

This document is normative.

---

## 2. What CLAW Is

CLAW is a verifier-first evidentiary protocol designed to:

- record time-bound attestations immutably,
- classify liability mechanically and non-advisorially,
- enable agreements to consume classifications without interpreting facts,
- preserve human adjudication and discretion.

CLAW does not adjudicate disputes, enforce outcomes, or interpret law.

---

## 3. What CLAW Is Not

CLAW is not:

- legal advice,
- a compliance engine,
- a decision-maker,
- a substitute for counsel or courts,
- an enforcement mechanism.

Any use of CLAW outputs beyond evidentiary or mechanical computation occurs outside the protocol.

---

## 4. Canonical Order of Authority

In the event of conflict, documents SHALL be interpreted in the following order of precedence:

1. **docs/CLAW_CANON.md**  
   Definitions, scope, philosophy, and authority model (this document)

2. **docs/CLAW_V1_UTILITIES.md**  
   Canonical description of v1 user-facing utilities, including:
   - e-sign
   - timelines
   - personal liability classification
   - automated determination inputs

3. **STATE.md**  
   Current operational and implementation state of the protocol

4. **ROADMAP.md**  
   Forward-looking, non-binding plans and potential extensions

5. **Repository Code**  
   Implementation details that SHALL conform to the above documents

Lower-order artifacts may not contradict higher-order canon.

---

## 5. Normative vs Non-Normative Documents

### Normative Documents

Normative documents define protocol meaning and constraints. They include:

- CLAW_CANON.md
- CLAW_PERSONAL_LIABILITY.md
- CLAW_AUTOMATED_DETERMINATION_CLAUSE_V1.md
- CLAW_V1_UTILITIES.md

Normative documents may only be modified with explicit versioning.

---

### Non-Normative Documents

Non-normative documents are explanatory, demonstrative, or illustrative. They include:

- sample agreements
- demo scripts
- diagrams
- examples
- UX drafts
- whitepapers

Non-normative documents SHALL NOT redefine protocol semantics.

---

## 6. CLAW v1 Freeze Declaration

CLAW v1 is hereby frozen with respect to:

- personal liability classification schema,
- deterministic mapping rules,
- automated determination outputs,
- agreement consumption boundaries.

No new liability categories, flags, warnings, or determination states SHALL be introduced under v1.

All substantive extensions MUST target v2 or later versions.

This freeze exists to preserve evidentiary stability, auditability, and legal admissibility.

---

## 7. Interpretation Rule

Where ambiguity exists:

- favor verifier-readability over user convenience,
- favor immutability over flexibility,
- favor classification over prescription,
- favor human adjudication over automated outcomes.

---

## 8. Canonical Principle

Timelines record facts.  
Liability classifies exposure.  
Clauses compute outcomes.  
Humans decide.

---

## 9. Amendment Policy

Amendments to this document require:

- explicit versioning,
- clear migration semantics,
- preservation of prior canon for verification and audit purposes.

Silent modification is prohibited.

---

End of CLAW CANON.
