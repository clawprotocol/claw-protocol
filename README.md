# CLAW Protocol

**CLAW** is an administrative-less **legal proof and verification protocol** for creating, anchoring, and verifying **tamper-evident timelines and receipts**.

CLAW produces cryptographic evidence of:
- existence
- sequence
- integrity
- time-ordering

…and nothing more.

It does **not** adjudicate disputes, render judgments, or exercise authority.

---

## Start Here (Canonical Entry Point)

New to CLAW?

👉 **[`docs/LAUNCH_INDEX.md`](docs/LAUNCH_INDEX.md)**

This is the **Protocol Launch Index**.  
It links to the authoritative specifications, examples, and architectural documents.

If you read only one file, read that one.

---

## Protocol Semantics (v1.x)

CLAW v1.x semantics are **explicitly frozen**.

Interpretation of implemented behavior is governed by:
- [`docs/COURT_SUMMARY.md`](docs/COURT_SUMMARY.md)
- [`docs/VERIFICATION_MODEL.md`](docs/VERIFICATION_MODEL.md)
- [`docs/ANCHORING_MODEL.md`](docs/ANCHORING_MODEL.md)
- [`docs/SEMANTIC_LOCK.md`](docs/SEMANTIC_LOCK.md)

If any description, example, or future document conflicts with these files,  
**the above documents control**.

---

## 🚀 Protocol Launch Index

New to CLAW?  
Start here → **[`docs/LAUNCH_INDEX.md`](docs/LAUNCH_INDEX.md)**

Court-safe, non-technical summary (CLAW v1.x):  
→ **[`docs/COURT_SUMMARY.md`](docs/COURT_SUMMARY.md)**

Canonical architecture boundaries (v1.x vs v2+):  
→ **[`docs/CLAW-PROTOCOL-LAYERS.md`](docs/CLAW-PROTOCOL-LAYERS.md)**

Verification guarantees (deterministic, reproducible):  
→ **[`docs/VERIFICATION_MODEL.md`](docs/VERIFICATION_MODEL.md)**

Anchoring semantics (Bitcoin time-bounding & reorg posture):  
→ **[`docs/ANCHORING_MODEL.md`](docs/ANCHORING_MODEL.md)**

---

## What CLAW Is — and Is Not

### CLAW **IS**
- A deterministic timeline construction protocol
- A canonical receipt and verification system
- A cryptographic anchoring mechanism (e.g. Bitcoin OP_RETURN)
- A tool for evidentiary integrity and procedural transparency
- An automation substrate usable **only by explicit agreement**

### CLAW **IS NOT**
- A court
- A judge
- An arbitration system
- A DAO with governance authority
- A replacement for due process
- A forced marketplace

All authority in CLAW flows from:
1. cryptographic proofs, and  
2. voluntary human agreement (contracts, filings, opt-in clauses).

---

## Protocol Status & Versioning

CLAW uses **two complementary versioning concepts**:

### 1. Semantic Versions (Human-Facing)
Used by developers and integrators.

- Current line: **v1.x**
- Focus: deterministic verification, canonical receipt hashing, invariant stability

### 2. Cryptographic Milestones (Verifier-Facing)
Used by auditors, courts, and reviewers to reproduce behavior exactly.

- Example milestone:  
  **`claw-milestone-local-verify-2026-01-21`**
  - End-to-end timeline creation + verification
  - Canonical receipt identity stabilized
  - `verify` and `verify_tree` invariants hardened
  - Legacy receipts supported

When reproducing results, **milestones take precedence over semantic versions**.

---

## Canonical Design Authority

All authoritative design, legal, and architectural documents live in:

👉 **[`/docs`](./docs)**

The canonical index is:

👉 **[`docs/README.md`](./docs/README.md)**

If any code, UI, blog post, AI output, or third-party explanation conflicts with the documents in `/docs`,  
**the documents control**.

---

## High-Level Architecture (Non-Normative)

At a high level, CLAW consists of:

- **Timeline Layer**  
  Deterministic event sequencing and hashing

- **Manifest & Commitment Layer**  
  Aggregation of event hashes into a frozen commitment

- **Anchoring Layer**  
  Immutable public anchoring (e.g. Bitcoin)

- **Receipt Layer**  
  Canonical, self-verifying receipts with stable identity

- **Verification Layer**  
  Deterministic `verify` and `verify_tree` logic

- **Optional Automation Layer**  
  Activated only by explicit contractual clauses

No layer confers adjudicative authority.

---

## Repository Structure (Orientation Only)

backend/ Backend services and verification logic
clawctl/ CLI tooling
docs/ Canonical protocol documentation (authoritative)
examples/ Example epochs, anchors, and demos
scripts/ Local tooling and helpers
tests/ Verification and invariant tests

yaml
Copy code

Details belong in `/docs`, not here.

---

## Intended Use Cases

CLAW is designed to support:
- litigation and regulatory timelines
- contractual dispute records
- public accountability archives
- evidentiary integrity for human or AI-generated content
- automated determinations **by agreement only**

CLAW does **not** determine truth, liability, guilt, or damages.

---

## License

MIT License.  
Use is permitted subject to license terms.

---

## Final Rule

If you remember only one thing:

> **CLAW produces receipts, not rulings.  
> Proofs, not power.  
> Verification, not authority.**

Everything else follows from that.