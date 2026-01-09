# CLAW Signature Oracle

## Overview

The Signature Oracle is the primary gateway into the CLAW protocol.

It verifies and attests to a **legally meaningful act of intent** — not merely the existence of a document.
Every higher-order CLAW capability (proofs, disputes, jurisdictional logic) begins with a verified signature event.

CLAW treats signing as an **oracle-verified event**, not a terminal product.

---

## Design Principles

- **Intent-first**: the oracle verifies that intent was asserted
- **Deterministic**: all inputs produce stable hashes
- **Composable**: outputs feed attestations, proofs, and disputes
- **Freemium-safe**: default operation is off-chain and batch anchored
- **Challengeable**: every event can later be disputed or contextualized

---

## Canonical Content

Before signing, all content is canonicalized.

### CanonicalContent Object

