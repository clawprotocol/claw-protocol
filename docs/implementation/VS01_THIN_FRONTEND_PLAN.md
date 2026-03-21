# VS01 — thinnest frontend path (GTM validation)

**Goal:** Smallest UI that exercises the VS01 backend end-to-end: finalize → sign session → complete sign → receipt + verification bundle. **No** OCR, timeline, or anchor UI.

**Backend surface (actual paths):** `/v1/documents`, `/v1/sign-sessions`, `/v1/receipts` (see `vs01_*` routers). Not `/api/v1/...` — call the app’s `/v1/...` routes as deployed.

---

## 1. Exact user flow

| Step | User action | Outcome |
|------|-------------|---------|
| 1 | (Optional) Read static disclaimer / not-legal-advice copy | Mental gate only; no API. |
| 2 | Choose or paste **final document bytes** (e.g. small PDF or UTF-8 text exported client-side to binary) | Local file → base64 in memory. |
| 3 | **Finalize** — submit bytes to backend | Receive `document_id`, `content_sha256`, metadata. |
| 4 | **Create sign session** — confirm binding | Receive `session_id` (and stored expected hash). |
| 5 | **Place sign geometry** (minimal: one rectangle) | Client builds `field_manifest` array only (no server preview required for thin path). |
| 6 | **Complete sign** — submit intent + signer handle + manifest (+ optional `signed_at`) | Receive full `receipt.v1` + `receipt_id` + `receipt_hash_sha256`. |
| 7 | **Success screen** — show hashes and ids | Optional `GET /v1/receipts/{id}` to confirm read path. |
| 8 | **Download bundle** — user clicks download | Browser saves zip from `GET /v1/receipts/{id}/bundle`. |

**Omitted in thin path:** separate “draft workspace” with LLM, rich PDF viewer, `/v1/documents/.../sign-prep` preview (optional polish).

---

## 2. Minimum screens / components

| # | Screen | Must do |
|---|--------|---------|
| **A** | **Finalize** | File input (or textarea → UTF-8 bytes); button “Finalize”; show `document_id` + truncated `content_sha256`. |
| **B** | **Sign** | Inputs: `signer_ref` (text), `intent` (fixed dropdown e.g. `agree_and_sign`), numeric fields for **one** `field_manifest` entry (`field_id`, `page_index`, `x`, `y`, `w`, `h`). Button “Create session” then “Sign” (or one combined flow: finalize → auto session → complete in sequence). |
| **C** | **Done** | Display `receipt_id`, `receipt_hash_sha256` (copy); buttons: “Download bundle”, optional “Refresh receipt” (`GET`). |

**Components:** layout shell, toast/error for 4xx/5xx, loading states on POST/GET. **No** timeline, anchor, OCR, or agreement draft editors.

---

## 3. API mapping

| Frontend action | Method + path | Request (high level) | Response (high level) |
|-----------------|---------------|----------------------|------------------------|
| Finalize document | `POST /v1/documents` | JSON: `content_base64`, optional `content_type` | `{ ok, document_id, content_sha256, created_at, size_bytes, content_type }` |
| Create sign session | `POST /v1/sign-sessions` | JSON: `document_id`, `content_sha256` (64 hex, lower) | `{ ok, session: { session_id, document_id, content_sha256, status, ... } }` |
| Complete sign | `POST /v1/sign-sessions/{session_id}/complete` | JSON: `signer_ref`, `intent`, `field_manifest` (≥1 item), optional `signed_at`, optional `protocol_version`, optional `client_manifest_sha256` | `{ ok, receipt_id, receipt_hash_sha256, receipt }` — `receipt` is full `receipt.v1` |
| (Optional) Fetch receipt | `GET /v1/receipts/{receipt_id}` | — | `{ ok, receipt }` |
| Download bundle | `GET /v1/receipts/{receipt_id}/bundle` | — | `application/zip` stream; use `Content-Disposition` filename or client-named `claw-bundle.zip` |
| (Optional) Get doc meta | `GET /v1/documents/{document_id}` | — | `{ ok, document: { ... meta } }` |
| (Optional) Preview bytes | `GET /v1/documents/{document_id}/content` | — | Raw bytes (for a real preview later) |

**Not required for thin demo:** `POST /v1/documents/{id}/sign-prep` (dry-run sign packet without issuing receipt).

**CORS / base URL:** Point the SPA or static page at the same origin as the API or configure CORS on the FastAPI app for pilot hosts.

---

## 4. Stub strategy

| Item | Stub |
|------|------|
| **Auth** | Hardcode `signer_ref` (e.g. `pilot-user-1`) or read from a single env/config field. |
| **Draft / LLM** | Skip entirely: user uploads a file that is already “the contract PDF.” |
| **PDF preview** | Omit or show filename + hash only; optional `iframe` with object URL only if same-origin blob works. |
| **`field_manifest`** | Single fixed rectangle: e.g. `field_id: "sig1"`, `page_index: 0`, small box coordinates — enough to satisfy schema. |
| **`signed_at`** | Omit in request → server fills UTC `Z` time (`vs01_sign_api`). |
| **`protocol_version`** | Omit → defaults to `CLAW_PROTOCOL_VERSION` / `claw-v1` on server. |
| **Error handling** | Show `detail` string or JSON from FastAPI; 409 on second complete is expected if user double-clicks. |

---

## 5. Launch recommendation

**Smallest demo/pilot:** a **single-page** or **three-step wizard** static/React/Vue page (no separate “agreements” product) that:

1. POST finalize  
2. POST sign-session → POST complete with hardcoded manifest + `signer_ref`  
3. GET bundle as file download + display `receipt_hash_sha256`

That is enough to **validate GTM**: proof spine, bundle download, and stakeholder walkthrough. Add disclaimer copy and a **README for pilot users** listing VS01 vs `GET /v1/timeline/receipts/...` (legacy) so nobody confuses receipt namespaces.

**Later (not blocking thin pilot):** auth, prettier field placement, `sign-prep` preview, persistence of `document_id` in URL for refresh.

---

*Aligned with `VERTICAL_SLICE_01_AGREEMENT_SIGN.md` §2–4 and `VS01_REVIEW_AND_COMPRESSION.md`; routes from `vs01_documents_api.py`, `vs01_sign_api.py`, `vs01_receipts_api.py`.*
