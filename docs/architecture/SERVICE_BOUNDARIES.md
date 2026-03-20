# CLAW v1 — Service Boundaries

**Deployment model:** one API monolith with **clean modules** (not separate deployable services). This doc defines **logical** boundaries, ownership, and forbidden overlaps.

**Cross-cutting rule:** **Receipt / proof code paths must not import LLM providers or non-deterministic helpers.** Draft/ingest may call AI only **before** or **beside** the inputs handed to `receipt_service`; AI output is never an implicit hash input unless explicitly versioned in schema and hashed by design.

See also: [`CLAW_GTM_MASTER_PLAN.md`](CLAW_GTM_MASTER_PLAN.md).

---

## 1. Document service

| | |
|--|--|
| **Purpose** | Own the lifecycle of user-visible document artifacts: bytes on disk/object store, stable identity, metadata, and **content hash** used for binding. |
| **Core responsibilities** | Create/update document records; store and retrieve raw bytes; compute and persist `content_sha256` (raw bytes); expose canonical “document version” for sign/receipt binding; soft-delete / retention flags if needed. |
| **Inputs** | Upload streams, client-declared MIME, optional `document_id` for updates, auth context (tenant/user id for ACL only—not hashed). |
| **Outputs** | `document_id`, `content_sha256`, storage URI or handle, version/revision pointer, metadata for UI. |
| **Dependencies** | Blob/object storage; DB for metadata; **no** receipt builder (callers pass hashes into receipt flow). |
| **Does NOT** | Build receipts; run OCR; place signature fields; interpret legal meaning; canonicalize JSON for protocol receipts (that is **proof / receipt**). |
| **v1** | **Required** — signing and receipts need a bound document artifact. |

---

## 2. Signature service

| | |
|--|--|
| **Purpose** | Capture **e-sign attestation**: who signed what document state, when, with what field placements / intent flags—producing a **stable sign payload** for the receipt layer. |
| **Core responsibilities** | Manage signature sessions; validate document binding (`document_id` + `content_sha256` or equivalent version hash); collect signer identity handles (non-crypto or crypto per product); emit **frozen** `sign_packet` / attestation object matching `schemas/` v1. |
| **Inputs** | `document_id`, bound hash(es), signer claims, field geometry / completion events, optional witness/co-sign rules. |
| **Outputs** | Immutable sign record: structured attestation JSON + any detached signature blobs; references only to document hashes already computed by **document service**. |
| **Dependencies** | Document service (read binding); DB for sessions; crypto libs if used for signer keys (still out of receipt canon unless specified). |
| **Does NOT** | Compute `receipt_hash`; append timeline events (unless orchestrator asks **timeline**); run OCR or drafting; prove blockchain inclusion. |
| **v1** | **Required** for e-sign GTM path. |

---

## 3. OCR / ingest service

| | |
|--|--|
| **Purpose** | Turn uploaded PDFs/images into **searchable text and layout references** for review/draft assist, while keeping **proof** on raw bytes + explicit hashed fields only. |
| **Inputs** | `document_id` or new upload; raw bytes (or handle from document service); OCR engine config flags. |
| **Outputs** | `ingest_id`, OCR text (versioned), optional bounding-box refs, engine metadata, `content_sha256` echo (must match document bytes). |
| **Dependencies** | Document service (bytes + hash); OCR provider or local engine; DB for ingest rows. |
| **Does NOT** | Replace `content_sha256` of stored bytes; silently inject OCR text into receipt inputs; act as source of truth for “what was signed” (signed binding stays document hash from **document** + **signature**). |
| **v1** | **Required** if v1 ships ingest (per GTM); **optional** for a “sign-only” slice (upload PDF as opaque blob, no OCR). |

---

## 4. Receipt service

| | |
|--|--|
| **Purpose** | **Deterministic** construction and persistence of protocol receipts: canonical serialization, stable `receipt_hash`, linkage to document + sign inputs per frozen schema. |
| **Core responsibilities** | Accept **only** versioned, explicit fields; call **proof** helpers (`canonical_json`, hash rules); persist receipt + idempotency keys; expose read API for bundles/verify. |
| **Inputs** | Frozen structs: document binding hashes, sign/attestation payload, protocol version, optional timeline event id **if** schema includes it (explicit). |
| **Outputs** | `receipt_id`, `receipt_hash_sha256`, full receipt JSON, pointers for export bundle. |
| **Dependencies** | **`proof/` module only** for hashing/canon (pure); DB persistence; **must not** depend on LLM, OCR engines, or anchor networks. |
| **Does NOT** | Call AI; fetch external URLs for hash inputs; “fix up” or normalize user text beyond documented canon rules; imply legal enforceability. |
| **v1** | **Required** — core invariant. |

---

## 5. Timeline / case service

| | |
|--|--|
| **Purpose** | Ordered, append-only **case** or **timeline** records: events (notice, signature completed, ingest completed, etc.) for UX and optional receipt linkage—not a second truth for hashes. |
| **Inputs** | Event type, payload refs (`document_id`, `receipt_id`, `ingest_id`), timestamps from server clock (recorded as data, not re-interpreted by proof without schema). |
| **Outputs** | `timeline_id` / `case_id`, ordered `event_id` list, event bodies for UI and export. |
| **Dependencies** | DB; optional read of other services’ ids only (no circular import with receipt **proof** code). |
| **Does NOT** | Redefine receipt canonicalization; verify Merkle roots (optional **verifier** script or separate read path); replace audit log for security forensics. |
| **v1** | **Optional** — ship a thin timeline (signature + receipt events only) or defer to post-v1 if UX allows “flat” artifacts. |

---

## 6. Anchor adapter

| | |
|--|--|
| **Purpose** | **Asynchronously** publish an **optional** commitment (e.g. batch root or receipt hash) to an external anchor (chain, log, third-party timestamp)—**evidence of publication**, not proof definition. |
| **Inputs** | `receipt_hash` or batch Merkle root, network/config, idempotency key. |
| **Outputs** | Job id, anchor tx/ref, status; stored pointer on receipt/batch row when complete. |
| **Dependencies** | Queue or worker loop; outbound RPC to anchor; DB for job state. **Reads** receipt/batch records; **never** writes back into hashed receipt body after issuance. |
| **Does NOT** | Block HTTP request/response for sign or receipt creation; change `receipt_hash`; substitute for local verification; imply on-chain “legal validity.” |
| **v1** | **Optional / post-v1** — off by default; async only. |

---

## Orchestration note (monolith)

Routers/handlers **compose** modules: e.g. complete sign → `signature_service` → `receipt_service.build` → optionally enqueue `anchor_adapter`. **Draft/LLM** routes must not import `receipt_service` builders with model output as hash input unless covered by an explicit ADR and schema bump.
