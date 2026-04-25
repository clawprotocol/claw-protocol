# CLAW Anchoring Model

LawDog / CLAW uses **Bitcoin** as the **canonical** public anchor: tamper-evident proof that specific commitments (e.g. batch Merkle roots) existed by a given time. **Dogecoin** is a **mandatory mirror** of the same commitment at launch (operational pairing); it is **not** the proof source of truth — verification still centers on Bitcoin.

Anchoring occurs at two distinct layers: **Genesis** and **Epochs**.

---

## Genesis Anchor

The Genesis anchor establishes the **protocol itself**.

It commits:
- The CLAW protocol identifier
- The canonical proof format
- The verification rules that future proofs must follow

Once anchored, the Genesis rules are immutable.  
All future proofs are evaluated relative to this Genesis definition.

Genesis anchoring answers the question:

> “What does a valid CLAW proof mean?”

---

## Epoch Anchors

Epochs represent **operational activity** under the Genesis rules.

Each Epoch:
- Batches one or more proof payloads
- Commits their Merkle root
- Produces a public, verifiable receipt

An Epoch receipt is valid **immediately upon creation**.  
Anchoring an Epoch to Bitcoin adds an external, censorship-resistant timestamp.

Epoch anchoranswers the question:

> “When did these specific proofs exist?”

---

## Pre-Anchor vs Anchored Epochs

An Epoch may exist in one of two states:

- **Pre-anchor**:  
  The receipt exists, is verifiable, and can be independently checked, but has not yet been committed 
on-chain.

- **Anchored**:  
  The Epoch’s Merkle root has been embedded in a Bitcoin transaction (OP_RETURN), providing a globally 
verifiable timestamp. (Optional: a **mirror** transaction on Dogecoin may exist with the same commitment.)

Both states are valid; anchoring increases evidentiary strength. On-chain anchoring is **not** legal finality or a compliance certification.

---

## Example

See:  
- `receipts/epoch-0001.json`

This file demonstrates a complete Epoch receipt, including payload hashes, Merkle paths, and verification 
metadata.

---

## Summary

- Genesis defines verification rules
- Epochs record verification events
- Bitcoin anchoring provides a **public, independently verifiable** time commitment for the batched root (not “legal finality”)

