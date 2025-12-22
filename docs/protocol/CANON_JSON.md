# CLAW Protocol — Canonical JSON & Test Vectors (v0.1)
_Last updated: 2025-12-20_

This document defines canonical JSON rules and provides deterministic test vectors.
Implementations MUST pass these vectors or the protocol is NOT compatible.

---

## 1) Canonical JSON Rules (normative)

### 1.1 Encoding
- UTF-8 bytes
- No BOM
- Newlines normalized to `\n`

### 1.2 Object keys
- Sort keys lexicographically by Unicode code point (effectively byte order for ASCII keys).
- No duplicate keys (reject input with duplicates).

### 1.3 Whitespace
- No extra whitespace.
- Use the minimal JSON representation:
  - separators: `,` and `:`
  - no spaces after commas or colons

### 1.4 Numbers
- MUST be JSON numbers (not strings) when representing numeric fields.
- No NaN/Infinity.
- Integers must have no leading zeros (except `0`).
- Decimals must have no trailing zeros (e.g., `1.2300` -> `1.23`).

### 1.5 Arrays
- Preserve given order exactly.

---

## 2) Canonicalization examples (normative)

### Vector A — Key ordering + whitespace

**Input object (conceptual):**
```json
{ "b": 2, "a": 1 }
