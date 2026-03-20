# CLAW v1 — Receipt & related schemas

Versioned payloads for **receipt**, **sign**, **ingest**, **timeline**, and **verification bundle**. Aligns with [`CLAW_GTM_MASTER_PLAN.md`](CLAW_GTM_MASTER_PLAN.md) and [`SERVICE_BOUNDARIES.md`](SERVICE_BOUNDARIES.md).

---

## Global rules (all v1 schemas)

- **Canonical JSON bytes** for any hashed object: UTF-8, `sort_keys=True`, `separators=(",", ":")`, `ensure_ascii=False` (same spirit as `CLAW_V1_CANON.md`).
- **Hex hashes:** lowercase `a-f`, length 64 for SHA-256 hex.
- **Field order in this doc** is descriptive only; **canonical serialization order = sorted JSON keys**.
- **Arrays** that enter a hash MUST use a **documented sort** (e.g. lexicographic by stable string key) so two honest implementations agree.
- **Never** put **LLM-generated strings** into required hashed fields unless the field is explicitly an optional, human-only attachment **excluded** from every hash boundary below (v1 default: **no such attachment in receipt/sign_packet**).

---

## 1. `sign_packet.v1`

**Purpose:** Frozen e-sign attestation: what document bytes were signed, by which stable signer identity, with structured field metadata. Input to `receipt.v1`.

| Field | Req | Type | Notes |
|--------|-----|------|--------|
| `schema_version` | R | string | literal `sign_packet.v1` |
| `document_id` | R | string | opaque id from document service |
| `document_content_sha256` | R | string | SHA-256 hex of **raw stored document bytes** |
| `signer_ref` | R | string | stable handle (account id, key fingerprint, etc.); **not** free-form display name from LLM |
| `intent` | R | string | small enum set (e.g. `agree_and_sign`); extend only via new schema version |
| `signed_at` | R | string | UTC end time of sign action, `YYYY-MM-DDTHH:MM:SS.sssZ` |
| `field_manifest` | R | array | see below |
| `client_manifest_sha256` | O | string | if UI sends a frozen manifest object, hash of its **canonical JSON** (64 hex); omit if unused |
| `detached_signature_b64` | O | string | PKCS/other detached sig; base64; omit if unused |

**`field_manifest` items** (each object, same key set; omit optional keys entirely if unused):

| Field | Req | Type |
|--------|-----|------|
| `field_id` | R | string |
| `page_index` | R | int ≥ 0 |
| `x` | R | number |
| `y` | R | number |
| `w` | R | number |
| `h` | R | number |

**Array ordering:** sort `field_manifest` elements by **UTF-8 lexicographic order** of `canon_json(item)` (each item’s canonical JSON string).

**Hashing boundary (standalone):**  
`sign_packet_digest_sha256` = SHA-256( `canon_json(sign_packet_object)` ) where `sign_packet_object` is the full `sign_packet.v1` object **including** optional fields present (absent keys omitted).

**LLM:** Must not author `signer_ref`, `intent`, coordinates, or `document_content_sha256`. No “summary” or “legal meaning” fields in v1.

---

## 2. `ingest_packet.v1`

**Purpose:** Versioned OCR/ingest result bound to document bytes. Optional input to UX and **optional** reference from `receipt.v1` only if product explicitly includes ingest in the receipt (default GTM: **omit from receipt**).

| Field | Req | Type | Notes |
|--------|-----|------|--------|
| `schema_version` | R | string | literal `ingest_packet.v1` |
| `ingest_id` | R | string | opaque |
| `document_id` | R | string | |
| `content_sha256` | R | string | must equal document bytes hash |
| `ocr_engine_id` | R | string | e.g. vendor + model id |
| `ocr_engine_version` | R | string | |
| `ingest_completed_at` | R | string | UTC `Z` suffix |
| `ocr_text_sha256` | R | string | SHA-256 hex of **normalized OCR text bytes** (define normalization: NFC UTF-8, LF newlines only) |
| `layout_ref_uri` | O | string | pointer to sidecar (e.g. storage key); **not** fetched during receipt hash |
| `locale` | O | string | BCP 47 |

**Hashing boundary:**  
`ingest_packet_digest_sha256` = SHA-256( `canon_json(ingest_packet_object)` ).

**LLM:** OCR text must come from OCR pipeline only. If an LLM post-processes text, that output is **out of scope** for `ocr_text_sha256` unless renamed (new schema) and treated as a new artifact with its own hash.

---

## 3. `receipt.v1`

**Purpose:** Deterministic record binding **document bytes** + **`sign_packet.v1`**, with optional refs to ingest/timeline **by digest/id** only.

| Field | Req | Type | Notes |
|--------|-----|------|--------|
| `schema_version` | R | string | literal `receipt.v1` |
| `protocol_version` | R | string | CLAW protocol semver string |
| `document_id` | R | string | |
| `document_content_sha256` | R | string | duplicate of sign packet for verify convenience; **must match** sign packet |
| `sign_packet` | R | object | must satisfy `sign_packet.v1` |
| `sign_packet_digest_sha256` | R | string | must equal digest of embedded `sign_packet` per §1 |
| `ingest_packet_digest_sha256` | O | string | set only if receipt explicitly binds ingest; else omit key |
| `timeline_event_id` | O | string | opaque; no timeline body inside receipt |
| `receipt_id` | O | string | **excluded from receipt hash** (runtime id) |
| `receipt_hash_sha256` | O | string | **excluded from receipt hash** (computed) |

**Object for hashing (`receipt_body`):**  
All **required** fields above, plus **optional** fields **present**, **except** `receipt_id` and `receipt_hash_sha256`.

**Hashing boundary:**  
`receipt_hash_sha256` = SHA-256( `canon_json(receipt_body)` ).

**Verification:** Recompute digest of `sign_packet`; check `sign_packet_digest_sha256`; check `document_content_sha256` matches sign packet; recompute `receipt_hash_sha256`.

**LLM:** No LLM fields in `receipt_body`. Draft/agreement text from assistants must never flow into these keys.

---

## 4. `timeline_event.v1`

**Purpose:** Append-only case/timeline event for UX and cross-reference; **not** a substitute for receipt proof.

| Field | Req | Type | Notes |
|--------|-----|------|--------|
| `schema_version` | R | string | literal `timeline_event.v1` |
| `event_id` | R | string | opaque |
| `timeline_id` | R | string | |
| `event_type` | R | string | closed set for v1, e.g. `signature_completed`, `ingest_completed`, `receipt_issued`, `notice` |
| `created_at` | R | string | server UTC `Z` |
| `refs` | R | object | only optional sub-keys below, omit absent |
| `refs.document_id` | O | string | |
| `refs.receipt_id` | O | string | |
| `refs.ingest_id` | O | string | |
| `payload_digest_sha256` | O | string | if arbitrary payload stored separately, hash of **canon_json(payload_object)** |

**`payload_object` (if used):** Must be JSON-serializable; versioned under product ADR; **no LLM prose in v1 required keys**—use refs + digests.

**Hashing boundary (per-event, if timeline integrity needed):**  
`timeline_event_digest_sha256` = SHA-256( `canon_json(timeline_event_object)` ) **excluding** any future `anchor_ref` fields if defined as out-of-band (v1: no anchor inside event).

**LLM:** Do not generate `event_id`, `event_type`, or digest inputs.

---

## 5. `verification_bundle.v1`

**Purpose:** Manifest for **offline** verification: lists artifacts by path/role and the hashes a verifier checks. Does not replace `receipt_hash_sha256`.

**On-disk layout:** The serialized `receipt.v1` JSON lives as a normal artifact, e.g. path `receipt.json` (role `receipt`). The **manifest object** does not embed the full receipt—only metadata + `artifacts` list.

| Field | Req | Type | Notes |
|--------|-----|------|--------|
| `schema_version` | R | string | literal `verification_bundle.v1` |
| `bundle_id` | R | string | opaque |
| `created_at` | R | string | UTC `Z` |
| `protocol_version` | R | string | |
| `artifacts` | R | array | includes `receipt.json` and `document` bytes, etc. |

**`artifacts` items:**

| Field | Req | Type |
|--------|-----|------|
| `path` | R | string | relative path within bundle |
| `role` | R | string | e.g. `receipt`, `document_bytes`, `ingest_sidecar`, `optional_attachment` |
| `content_sha256` | R | string | raw file bytes |

**Array ordering:** sort by `path` ascending (UTF-8 byte order).

**Hashing boundary (manifest only):**  
`bundle_manifest_sha256` = SHA-256( `canon_json(manifest_body)` ) where `manifest_body` = `{ schema_version, bundle_id, created_at, protocol_version, artifacts }` (only those keys, optional keys omitted if unused).

**LLM:** Manifest and artifact list must be assembled by system code from known paths/hashes; never accept LLM-generated paths or hashes.

---

## Summary table

| Schema | Primary digest |
|--------|----------------|
| `sign_packet.v1` | SHA-256(canon full sign packet) |
| `ingest_packet.v1` | SHA-256(canon full ingest packet) |
| `receipt.v1` | SHA-256(canon `receipt_body`) |
| `timeline_event.v1` | SHA-256(canon event) if used for integrity |
| `verification_bundle.v1` | SHA-256(canon manifest per chosen bundle rule) |

Bump to `.v2` when any required key, normalization, or hash composition changes.
