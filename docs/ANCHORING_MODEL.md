# CLAW Anchoring Model (Canonical)

## Status
Normative for CLAW v1.x

This document defines how the CLAW protocol uses external public blockchains for anchoring commitments, and what anchoring does and does not prove.

If any implementation, explanation, marketing material, or third-party interpretation conflicts with this document, this document controls.

---

## Purpose

The CLAW Anchoring Model specifies:

- what it means for a CLAW commitment to be “anchored”
- what cryptographic and temporal properties anchoring provides
- how external blockchain behavior is interpreted
- which claims CLAW explicitly does not make about blockchains

This document exists to prevent over-claiming, misinterpretation, or implied authority arising from blockchain anchoring.

---

## Core Principle

CLAW anchoring provides **public, append-only timestamping and immutability evidence**, not finality, settlement, or legal effect.

Anchoring answers the question:

Did this commitment appear in a public, append-only system no later than a specific external event?

Anchoring does not answer:
- whether the anchor is irreversible
- whether the anchor is economically secure
- whether the anchor is legally binding
- whether the anchor implies truth, consent, or validity

**LawDog launch profile:** **Bitcoin** is the **canonical** chain for public batch commitments; **Dogecoin** is a **mandatory mirror** of the same root for launch operations (social/community layer). Verification and “what we treat as anchored” still prefer **Bitcoin**; Dogecoin is secondary in proof semantics.

---

## Definition of Anchoring

In CLAW, anchoring means:

- embedding a cryptographic commitment into an external public system
- obtaining a publicly observable reference (e.g. transaction identifier)
- binding the commitment to that external context

The anchor system is treated as an **external witness**, not an authority.

---

## Anchor Systems

CLAW v1.x supports anchoring to external systems that are:

- publicly observable
- append-only in normal operation
- independently verifiable by third parties

Examples include:
- Bitcoin mainnet
- Bitcoin testnet

Support for additional systems is a protocol extension and must be explicitly declared.

---

## Anchor Artifacts

An anchored CLAW receipt may reference the following artifacts:

- anchor network identifier (e.g. bitcoin-mainnet)
- transaction identifier (txid)
- embedded commitment (e.g. OP_RETURN payload)
- issuance timestamp of the receipt

These artifacts are sufficient to allow independent observers to locate the anchor.

---

## Time Semantics

Anchoring establishes a **latest possible existence bound**.

Specifically:

- the committed content existed **no later than** the anchoring event
- the commitment cannot be altered without detection after anchoring

Anchoring does not establish:
- the earliest time the content may have existed
- continuous availability prior to anchoring
- authorship or intent at anchoring time

Time claims must always be interpreted conservatively.

---

## Pending Anchors

A receipt may reference an anchor that is marked as **pending**.

Pending means:
- the anchor transaction has been constructed or broadcast
- the transaction may not yet be included in a block
- the anchor may still fail, be replaced, or be reorged out

Pending anchors:
- are not final
- must not be treated as confirmed
- provide weaker evidentiary value

Implementations should clearly distinguish pending from confirmed anchors.

---

## Confirmed Anchors

A confirmed anchor is one that appears in a block accepted by the external network.

Confirmation implies:
- inclusion in a publicly observable block
- resistance to trivial modification

Confirmation does not imply:
- irreversibility
- economic finality
- protection against deep reorganizations
- legal conclusiveness

CLAW does not specify a required confirmation depth.

---

## Reorganization (Reorg) Posture

CLAW explicitly assumes that reorganizations are possible.

Accordingly:
- anchors may be invalidated by external chain reorgs
- receipts referencing reorged anchors may lose anchoring status
- verification systems must detect and surface such conditions

CLAW implementations must:
- treat anchoring as probabilistic
- degrade safely when anchors are invalidated
- avoid asserting permanence

Reorg risk is a property of the anchor system, not CLAW.

---

## Independence from Economic Assumptions

CLAW makes no claims regarding:
- hash power distribution
- mining incentives
- censorship resistance
- attack cost
- security budgets

Such properties belong to the anchor network and may change over time.

CLAW verification remains valid even if external assumptions fail, provided artifacts are interpreted conservatively.

---

## Legal and Evidentiary Interpretation

Anchoring provides evidence analogous to:
- publication in a public registry
- cryptographic timestamping
- notarization of existence

Anchoring does not:
- create legal rights
- imply consent
- substitute for filing requirements
- establish jurisdiction

Any legal effect arises from external law and agreements, not from anchoring itself.

---

## Interaction with Verification Model

Anchoring supplements, but does not replace, CLAW verification.

Specifically:
- receipt verification establishes integrity and identity
- anchoring adds public observability and time bounding
- anchoring failure does not retroactively invalidate receipt integrity

Verification and anchoring must be evaluated together, not conflated.

---

## Canonical Constraints

1. CLAW must not claim blockchain finality.
2. CLAW must not infer legal meaning from anchoring.
3. Anchoring must be explicitly declared and observable.
4. Pending and confirmed states must be distinguished.
5. Reorg risk must be acknowledged and surfaced.

---

## Canonical Rule

When interpreting anchors:

Assume reversibility.  
Assume uncertainty.  
Interpret conservatively.

Anchors witness existence — nothing more.

---

## End of Anchoring Model