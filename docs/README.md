# CLAW Documentation Index (Canonical)

This directory contains the **authoritative design, legal, and architectural documents** for the CLAW protocol.

These documents define what CLAW **is**, **is not**, and **how it is intended to be used**.  
They are written to be readable by humans **and** interpretable by automated tools, auditors, and verifiers.

If any ambiguity exists between code, UI, commentary, or third-party descriptions,  
**the documents in this directory control.**

---

## Protocol Status & Stability

CLAW operates with two complementary forms of versioning:

### 1. Semantic Versions (Human-Facing)
Semantic versions (e.g. `v1.2.0`) communicate **backward compatibility guarantees** and expected behavior for operators and integrators.

### 2. Cryptographic Milestones (Verifier-Facing)
Milestone tags lock specific verification and hashing behavior for **reproducibility and audit**.

#### Current Stable State
- **Release:** `v1.2.0` — Deterministic verification and canonical receipt hashing
- **Milestone:** `claw-milestone-local-verify-2026-01-21`
  - Local end-to-end timeline creation, anchoring, and verification
  - Canonical receipt identity stabilized
  - `verify` and `verify_tree` invariants hardened
  - Legacy receipt compatibility preserved

Verifiers, auditors, and reviewers SHOULD anchor expectations to milestone tags when reproducing results.

---

## How to Read These Docs (Recommended Order)

If you are new to CLAW, read the documents in the following order:

1. **CLAW-OVERVIEW.md**  
2. **CLAW-PROTOCOL-LAYERS.md**  
3. **CLAW-GAME-THEORY.md**  
4. **CLAW-JUDGE-DIAGRAM.md**  
5. **CLAW-AUTOMATED-DETERMINATION-CLAUSE.md**  
6. **CLAW-PRICING.md**  
7. **CLAW-DOGINAL-PERKS.md**  
8. **AI-GUARDRAILS.md**

This sequence moves from **plain-language explanation** → **technical architecture** → **legal integration** → **economic and cultural layers**.

---

## Document Reference Guide

### 1. `CLAW-OVERVIEW.md`
**Audience:** General readers, lawyers, judges, partners, non-builders  

**Purpose:**  
Explains CLAW in plain English: the problem it solves, how it works at a high level, and what it explicitly does *not* do.

This is the **external-facing narrative anchor** for the protocol.

---

### 2. `CLAW-PROTOCOL-LAYERS.md`
**Audience:** Architects, reviewers, advanced readers  

**Purpose:**  
Describes the full CLAW stack layer by layer, including:
- Bitcoin anchoring
- Canonical hashing
- Privacy and ZK considerations
- Automation boundaries
- Coordination rails
- Escrow and settlement interfaces
- Cultural and distribution layers

Defines **where authority exists and where it explicitly does not**.

---

### 3. `CLAW-GAME-THEORY.md`
**Audience:** Strategists, skeptics, governance reviewers  

**Purpose:**  
Explains why CLAW is intentionally designed to avoid:
- administrative attrition (“death by process”)
- lawyer peer-capture
- zero-sum procedural games
- forced marketplaces

Documents the incentive logic underlying the architecture.

---

### 4. `CLAW-JUDGE-DIAGRAM.md`
**Audience:** Judges, auditors, hostile readers, regulators  

**Purpose:**  
Provides a **minimal, non-technical explanation** of how CLAW proves:
- existence
- sequence
- integrity
- time-ordering

This document is safe to attach to:
- affidavits
- declarations
- expert reports
- motions involving authentication or timelines

No cryptographic expertise is assumed.

---

### 5. `CLAW-AUTOMATED-DETERMINATION-CLAUSE.md`
**Audience:** Lawyers, contract drafters, counterparties  

**Purpose:**  
A model contractual clause allowing parties to **opt into automated determinations by agreement**, including:
- scope limits
- privacy protections
- appeal lanes
- escrow coordination
- explicit non-adjudication language

This document ensures CLAW does **not** create unauthorized courts or adjudication.

---

### 6. `CLAW-PRICING.md`
**Audience:** Operators, product teams, business development  

**Purpose:**  
Defines pricing tiers, unit economics, cost drivers, and anti-abuse logic.

Explains what users pay for:
- automated legal and verification services
- coordination and execution tooling

Not for “proofs” in isolation.

---

### 7. `CLAW-DOGINAL-PERKS.md`
**Audience:** Community members, growth partners  

**Purpose:**  
Defines how Doginal Dogs and Dogecoin integrate with CLAW as a **cultural and distribution layer**, providing:
- access benefits
- pricing perks
- community alignment

This layer carries **no legal authority, governance power, or adjudicative role**.  
Courts and auditors never need to reference this document.

---

### 8. `AI-GUARDRAILS.md`
**Audience:** AI tools, developers, contributors  

**Purpose:**  
Declares which documents are canonical and constrains AI-assisted development.

Prevents hallucinated authority, governance, or legal claims by automated systems.

---

## Canonical Rule

If any code, UI, blog post, AI output, or third-party explanation conflicts with these documents:

**These documents control.**

Changes to CLAW’s authority, scope, verification model, or architecture  
**must be reflected here before implementation**.

---

## End of Index
