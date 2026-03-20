# Vertical slice 01 — Agreement draft → sign → receipt → bundle export

**Scope:** First CLAW v1 vertical slice only. **Out of scope for this slice:** OCR/ingest, timeline/case events, anchor adapter.

**Normative refs:** [`CLAW_GTM_MASTER_PLAN.md`](../architecture/CLAW_GTM_MASTER_PLAN.md), [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md), [`SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md), [`GTM_ARCHITECTURE.md`](../architecture/GTM_ARCHITECTURE.md), [`V1_SCOPE.md`](../product/V1_SCOPE.md), [`ADR-001`](../adr/ADR-001-deterministic-core.md), [`ADR-002`](../adr/ADR-002-ai-vs-proof-boundary.md).

---

## 1. Goal

**What this slice proves**

- End-to-end: user produces **frozen document bytes** → completes **e-sign** → system emits **`receipt.v1`** with stable **`receipt_hash_sha256`** → user downloads a **`verification_bundle.v1`** that a third party can check **offline** (byte hashes + receipt recompute per schema).

**Why first**

- It establishes the **deterministic proof spine** (`sign_packet.v1` → `receipt.v1` → bundle manifest) before optional features (ingest, timeline, anchor) complicate orchestration or storage.
- It satisfies the core GTM invariant: **receipt integrity independent of AI** (ADR-002); drafting stays **upstream** of hashing.

---

## 2. User flow

1. **Start / disclaimers** — User sees non-binding, not-legal-advice copy; optional auth/login so `signer_ref` is stable.
2. **Draft** — User enters intake (prompt and/or structured fields). System shows draft text; user edits. **Optional LLM assist** only affects displayed/edited text until user **finalizes** (no LLM in sign/receipt path).
3. **Finalize document** — User clicks “Finalize for signing.” Backend persists **raw document bytes** (e.g. exported PDF or canonical UTF-8 artifact per product choice), returns `document_id`, `content_sha256`.
4. **Place sign fields** — User places signature (and optional initial/date) regions on the document preview; client holds geometry until submit.
5. **Sign** — User confirms intent (e.g. `agree_and_sign`). Backend validates binding to current `document_id` + `content_sha256`, builds frozen **`sign_packet.v1`**, then **`receipt.v1`** (no `ingest_packet_digest_sha256`, no `timeline_event_id`).
6. **Signed record** — UI shows `receipt_id`, `receipt_hash_sha256`, link/button **Download verification bundle**.
7. **Export** — User downloads zip (or tarball) containing `manifest.json`, `receipt.json`, `document.bin` (or `.pdf`), and `VERIFY.md` (short steps).

---

## 3. Backend scope

### Modules (monolith)

| Module | Role in this slice |
|--------|---------------------|
| **`document_service`** | Create/update finalized bytes; compute/store `content_sha256`; serve bytes for export. |
| **`signature_service`** | Sign session + validate binding; assemble **`sign_packet.v1`** (sorted `field_manifest`, server `signed_at` or validated client time). |
| **`receipt_service`** | Build **`receipt_body`**, call **`proof/`** for digests; persist receipt; **no** LLM/OCR/anchor imports. |
| **`proof/`** | `canon_json`, `sign_packet_digest_sha256`, `receipt_hash_sha256` per [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md). |

### Endpoints (illustrative names)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/v1/documents` or `.../finalize` | Body: finalized document upload or server-rendered export; returns `document_id`, `content_sha256`. |
| `GET` | `/api/v1/documents/{id}` | Metadata + optional download URL for signing preview. |
| `POST` | `/api/v1/sign-sessions` | Create session bound to `document_id` + expected `content_sha256`. |
| `POST` | `/api/v1/sign-sessions/{id}/complete` | Body: `field_manifest` (+ optional detached sig); server fills `signer_ref`, `intent`, `signed_at`; runs signature → receipt orchestration; returns **`receipt.v1`** fields including `receipt_hash_sha256`. |
| `GET` | `/api/v1/receipts/{receipt_id}` | Read persisted receipt JSON. |
| `GET` | `/api/v1/receipts/{receipt_id}/bundle` | Stream **zip** (or redirect to short-lived signed URL) built from stored artifacts. |

Draft/LLM endpoints (if any) **must not** call `receipt_service.build` or `proof/` with model output as hash input.

### Contracts (high level)

- **Finalize:** multipart or JSON+base64 document bytes → `{ document_id, content_sha256, mime_type }`.
- **Complete sign:** `{ field_manifest, intent? }` + auth context → `{ receipt_id, receipt_hash_sha256, receipt: { … } }` (full `receipt.v1` for client display; storage is source of truth).
- **Bundle:** binary archive; **`manifest.json`** = `verification_bundle.v1` object (per schema: no embedded receipt object in manifest JSON—`receipt.json` listed under `artifacts`).

### Persistence

- **Document row:** id, blob pointer, `content_sha256`, mime, created_at, owner/tenant id (ACL only).
- **Sign session row (optional):** id, `document_id`, expected hash, status, expiry.
- **Receipt row:** `receipt_id`, full receipt JSON (including `receipt_hash_sha256`), `document_id`, created_at; idempotency key on complete-sign if retried.

---

## 4. Frontend scope

### Screens / components (minimum)

| # | Screen / component | Responsibility |
|---|----------------------|----------------|
| 1 | **Disclaimer shell** | Static copy; gate to draft. |
| 2 | **Draft workspace** | Intake + editor; “Finalize for signing.” |
| 3 | **Finalize confirmation** | Shows hash snippet / doc id after finalize. |
| 4 | **Sign layout** | Document preview + place/adjust fields; submit sign. |
| 5 | **Signed result** | Receipt id + hash + download bundle. |

### Minimum UI states

- Drafting (dirty/clean), finalizing (loading), finalized (read-only doc), signing (loading), signed (success), error (recoverable vs fatal).

### Safe stubs

- LLM draft button → **mock** canned paragraphs or no-op.
- PDF renderer → simple HTML/text preview if document is text; or single-page placeholder if PDF pipeline deferred (bytes still stored server-side from finalize).
- Auth → dev user id fixed in `.env` for slice demo.

---

## 5. Deterministic proof path

| Artifact | Where created | Rule |
|----------|----------------|------|
| **`sign_packet.v1`** | **`signature_service`** on **complete sign** | All required fields set; `field_manifest` sorted per schema; `document_content_sha256` copied from **document_service**; `signer_ref` from auth, not LLM. |
| **`receipt.v1`** | **`receipt_service`** immediately after valid `sign_packet` | `receipt_body` per [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md): **omit** `ingest_packet_digest_sha256`, `timeline_event_id`; compute `sign_packet_digest_sha256`, then `receipt_hash_sha256`. |
| **`verification_bundle.v1`** | **Export handler** (or small `bundle_assembler` helper in monolith, not a new “service”) | Build `artifacts` list: at minimum `receipt.json`, `document` file; sort by `path`; set `manifest_body` keys only; compute `bundle_manifest_sha256` for optional display/audit. |

**Reproducible**

- Given the same **document bytes** and same **`sign_packet.v1`** (and same `protocol_version`), **`receipt_hash_sha256`** is identical on any machine (ADR-001).
- Given the same files on disk, **`artifacts[].content_sha256`** and recomputed `receipt_hash_sha256` match manifest and `receipt.json`.

**Not reproducible (by design)**

- `receipt_id`, `bundle_id`, wall-clock `created_at` on bundle do not need to match across runs; they are **not** inside `receipt_body` (except bundle timestamps in manifest for human audit).

---

## 6. File outputs (downloadable)

Suggested **zip** layout:

| Path | Role (`verification_bundle.v1`) | Contents |
|------|-----------------------------------|----------|
| `manifest.json` | — (this file is the manifest object serialized) | `verification_bundle.v1` with `artifacts` sorted by `path`. |
| `receipt.json` | `receipt` | Full `receipt.v1` including `receipt_hash_sha256`. |
| `document.pdf` (or `document.bin`) | `document_bytes` | **Exact** bytes whose SHA-256 is `document_content_sha256`. |
| `VERIFY.md` | optional human file | Steps: hash files, recompute `sign_packet_digest` and `receipt_hash` per [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md); link to `CLAW_V1_CANON.md` / verifier entry if repo ships one. |

**Suggested download filename:** `claw-bundle-{receipt_id_short}.zip`.

---

## 7. Test plan

| Layer | What to test |
|-------|----------------|
| **Unit (`proof/`)** | `canon_json` golden vectors; `sign_packet_digest_sha256`; `receipt_hash_sha256`; `field_manifest` sort stability; rejection of invalid hex / missing keys. |
| **Unit (services)** | `signature_service` rejects hash mismatch vs stored document; `receipt_service` rejects bad `sign_packet_digest_sha256`. |
| **Integration** | HTTP: finalize → complete sign → GET receipt; bundle GET returns zip; manifest parses; each listed file hashes match. |
| **Golden-path E2E** | One scripted journey: create doc bytes (fixture) → sign with fixed `field_manifest` + mocked time if needed → assert receipt hash matches expected vector committed in repo. |
| **Determinism** | Two runs with identical inputs (control `signed_at` in test via injection or frozen clock) produce **identical** `receipt_hash_sha256`. |

**Explicitly not in this slice:** ingest tests, timeline events, anchor jobs.

---

## 8. Acceptance criteria

Slice is **complete** when all are true:

1. A user can **finalize** a document and obtain **`document_id`** + **`content_sha256`** stored server-side.
2. **Complete sign** produces a persisted **`receipt.v1`** with valid **`sign_packet_digest_sha256`** and **`receipt_hash_sha256`** per [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md), with **no** ingest or timeline fields present.
3. **Download bundle** includes **`manifest.json`** (`verification_bundle.v1`), **`receipt.json`**, and **document** bytes; every `artifacts[].content_sha256` matches file bytes.
4. **Offline check** (script or documented manual steps) recomputes **`receipt_hash_sha256`** from `receipt.json`’s `receipt_body` rules and **passes** using only bundle files.
5. **`proof/`** and **`receipt_service`** contain **no** imports of LLM providers (ADR-002); drafting codepath does not pass model output into receipt build.
6. **Tests:** golden-path + determinism tests green in CI (or documented equivalent).

---

*Next slices (separate docs): ingest binding to receipt (optional field), timeline refs, anchor enqueue.*
