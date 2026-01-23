# CLAW Anchoring Model

CLAW uses Bitcoin anchoring to provide public, tamper-evident proof that specific data existed in a specific 
form no later than a given point in time.

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
  The Epoch’s Merkle root has been embedded in a Bitcoin transaction P_RETURN), providing a globally 
verifiable timestamp.

Both states are valid; anchoring increases evidentiary strength.

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
- Bitcoin anchoring provides **public finality**

