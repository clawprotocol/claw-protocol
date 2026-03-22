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
- Sort keys lexicographically by Unicode code point.
- No duplicate keys.

### 1.3 Whitespace
- No extra whitespace.
- Minimal JSON (`:` and `,` only).

### 1.4 Numbers
- No NaN or Infinity.
- No leading zeros.
- No trailing decimal zeros.

### 1.5 Arrays
- Preserve order.

### 1.6 Strings
- UTF-8 only.
- JSON escaping only.
- Newlines as `\n`.

---

## 2) Canonicalization examples

### Vector A

Input:
```json
{ "b": 2, "a": 1 }
