# CLAW Genesis Proof Specification (v0)

Protocol Identifier: CLAW-PROOF-v0
Status: Draft (intended for permanent compatibility once anchored)
Digest Algorithm: SHA-256

Normative language in this document uses MUST, MUST NOT, SHOULD, and MAY as described in RFC 2119.

---

## 1. Plain-English Summary (Non-Normative)

### What is CLAW v0?

CLAW v0 is a public technical proof standard that allows anyone to demonstrate, using cryptographic methods and public blockchain data, that a specific piece of text existed in a specific digital form no later than the time of a blockchain transaction accepted under consensus rules.

CLAW does this by:

1. Converting text into a fixed digital fingerprint using cryptographic hashing
2. Grouping many such fingerprints together efficiently
3. Anchoring the result to the Bitcoin blockchain, which provides a publicly verifiable, economically secured ordering of events that is substantially more tamper-resistant than conventional timestamping methods

Anyone can later verify a CLAW proof independently by following the public rules of this specification, without relying on the continued availability or authority of CLAW or its authors.

---

### What does a CLAW proof demonstrate?

A valid CLAW proof demonstrates, as a matter of cryptographic verification, that:

* The exact text shown existed
* In the exact digital form shown
* Prior to or contemporaneously with the Bitcoin transaction used as the anchor

---

### What does a CLAW proof not demonstrate?

A CLAW proof does not demonstrate:

* That the text is true or false
* That it is legally binding, enforceable, or admissible
* That any person authored, agreed to, or was aware of it
* That it is complete, accurate, or contextual

Any legal significance, if any, is determined solely by applicable law and the fact-finder.

---

## 2. Scope and Non-Goals (Normative)

CLAW-PROOF-v0 intentionally and expressly does not define or require:

* Identity, authorship, or signatures
* Legal intent, consent, or enforceability
* Evidentiary admissibility or evidentiary weight in any legal proceeding
* Governance mechanisms, economics, or incentives

These matters are explicitly out of scope to preserve clarity, neutrality, and long-term verifiability.

---

## 3. Canonical JSON Serialization (Normative)

When hashing any JSON object under this specification, the object MUST be serialized deterministically so that independent implementations produce identical byte sequences.

The serialization rules are:

* Encoding MUST be UTF-8
* JSON objects MUST have keys sorted lexicographically
* JSON arrays MUST preserve element order
* No additional whitespace outside string values is permitted
* Invalid JSON values such as NaN or Infinity MUST NOT be used
* If numeric values appear in hashed objects, they MUST be integers

A compliant implementation MAY use the following reference approach (illustrative only):

```python
json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
```

---

## 4. Text Normalization Rules (Normative)

Because visually identical text can be represented differently across systems, claim text MUST be normalized prior to hashing.

The following normalization steps MUST be applied in order:

1. Convert all CRLF (`\r\n`) line endings to LF (`\n`)
2. Convert all CR (`\r`) line endings to LF (`\n`)
3. Remove trailing spaces and tabs at the end of each line
4. Do NOT otherwise modify spacing, punctuation, capitalization, or Unicode characters

Unicode normalization is intentionally not applied. Visually identical but byte-distinct Unicode sequences will hash differently.

---

## 5. Document Hash (Normative)

The source document referenced by a claim MUST be identified by a document hash.

The document hash MUST be the lowercase hexadecimal SHA-256 digest of the raw bytes of the source file as ingested.

No normalization, re-encoding, or format-specific canonicalization is permitted.

---

## 6. Claim Object (Leaf Payload) (Normative)

Each claim is represented as a Claim object and is the sole payload hashed into the Merkle tree.

### Required fields

A Claim object MUST include:

* protocol: MUST equal "CLAW-PROOF-v0"
* type: a string describing the claim category
* text: the normalized claim text
* source: an object containing:

  * doc_hash: the document hash
  * locator: a stable string indicating the claim’s location in the document

### Field constraints

Claim objects MUST NOT include:

* Timestamps
* Random or environment-specific identifiers
* Floating-point numbers

Optional fields SHOULD be avoided unless their values are stable across implementations.

---

## 7. Leaf Hashing (Normative)

Each Claim object MUST be serialized using the canonical JSON rules and hashed as follows:

```
leaf = SHA256(canonical_json_bytes)
```

Each leaf hash is exactly 32 bytes.

---

## 8. Merkle Tree Construction (Normative)

Leaf hashes are combined into a Merkle tree according to the following rules:

* Leaves MUST be ordered exactly as provided
* Parent nodes are computed as SHA256(left || right)
* If a level has an odd number of nodes, the final node is duplicated
* The final remaining hash is the Merkle root

---

## 9. Receipt Object (Non-Hashed, Recommended)

A Receipt object MAY be generated to provide contextual information.

---

## 10. Inclusion Proof Format (Normative)

An inclusion proof MUST include:

* leaf_index: zero-based index
* path: an ordered list of sibling hashes with left/right position indicators

---

## 11. Anchor Commitment (Normative)

The Merkle root MUST be committed to Bitcoin via a version-bound commitment:

```
commitment = SHA256("CLAW" || 0x00 || merkle_root)
```

---

## 12. Verification Algorithm (Normative)

Verification proceeds by:

1. Reconstructing the Claim object
2. Normalizing text
3. Computing the leaf hash
4. Recomputing the Merkle root using the inclusion proof
5. Recomputing the commitment
6. Comparing it to the anchored value

---

## Appendix A — Mathematical Description (Informative)

Let H(x) = SHA-256(x)

doc_hash = H(document_bytes)
leaf_i = H(canonical_json(claim_i))
parent = H(left || right)
C = H("CLAW" || 0x00 || R)
