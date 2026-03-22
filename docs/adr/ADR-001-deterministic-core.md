# ADR-001: Deterministic core (canonical JSON, hashing, receipts)

**Status:** Accepted  
**Scope:** CLAW v1 proof path (`proof/`, `receipt_service` deterministic build, verifiers)

---

## Context

Evidence integrity requires **local, deterministic** recomputation of hashes and receipts without trusting operators or network. Aligns with `CLAW_V1_CANON.md` and [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md).

---

## Decision

### Canonical JSON

- Encoding: **UTF-8**.
- Serialization: JSON with **`sort_keys=True`**, **`separators=(",", ":")`**, **`ensure_ascii=False`**.
- Object key order in docs is irrelevant; **wire/hash order = sorted keys**.
- Hex: SHA-256 as **64 lowercase** hex chars.

### Arrays in hashed objects

Any array that affects a digest MUST use a **fixed, documented** sort (e.g. per `RECEIPT_SCHEMAS.md`: `field_manifest` by UTF-8 lexicographic `canon_json(item)`; bundle `artifacts` by `path`).

### Receipt reproducibility

- **`receipt_hash_sha256`** = SHA-256( `canon_json(receipt_body)` ) where `receipt_body` is exactly the set of keys defined for hashing in `receipt.v1` (excludes `receipt_id`, `receipt_hash_sha256`).
- **`sign_packet_digest_sha256`** must match SHA-256(canon(full `sign_packet`)) of the embedded `sign_packet`.
- Verifiers recompute both; mismatch **fails** verification.

### Immutability

- Once `receipt_hash_sha256` is issued for a given logical receipt, **do not** mutate hashed fields in place. Corrections = **new** receipt / new artifact version.
- **Anchor adapter** (if used) stores pointers only; never rewrites hashed receipt payload.

---

## What requires a version bump

| Change | Action |
|--------|--------|
| Add/remove/rename **required** key in any hashed object | New schema (e.g. `receipt.v2`, `sign_packet.v2`) |
| Change canon rules (separators, sort_keys, encoding) | New schema + verifier update |
| Change array sort or normalization (e.g. OCR text NFC/LF) | New ingest/receipt schema as applicable |
| Change **composition** of `receipt_body` (which keys hashed) | New `receipt.vN` |
| Optional: new **optional** hashed field with safe default “omit key” | ADR + minor protocol note; if verifiers must distinguish old/new behavior, prefer new schema |

**Protocol version** string (`protocol_version` on receipt) should move with user-visible breaking verification changes.

---

## Consequences

- All implementations share one canon implementation or golden vectors in tests.
- Old bundles remain verifiable with frozen `schemas/` + versioned verifiers.

---

## References

- [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md)  
- [`SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md) § Receipt service  
- `CLAW_V1_CANON.md`
