# CLAW v1 — GTM architecture (summary)

**Deployment:** single **API monolith** with **service modules** (document, signature, OCR/ingest, receipt, optional timeline/case, optional anchor adapter). Not microservices.

Canonical detail: [`CLAW_GTM_MASTER_PLAN.md`](CLAW_GTM_MASTER_PLAN.md), [`SERVICE_BOUNDARIES.md`](SERVICE_BOUNDARIES.md), [`RECEIPT_SCHEMAS.md`](RECEIPT_SCHEMAS.md).

---

## Launch shape

| Layer | Role |
|--------|------|
| **Browser** | Draft, sign, upload/ingest, export verification bundle, disclaimers. |
| **API (monolith)** | Auth (minimal), routing, orchestration, persistence. |
| **`proof/`** | Pure canonical JSON + SHA-256 + receipt construction. No network, no LLM. |

---

## Core request flow (happy path: sign → receipt)

```
Browser
  → HTTPS (JSON / multipart)
    → API router/handler
      → document_service     (bytes + content_sha256)
      → signature_service    (sign_packet.v1 frozen)
      → receipt_service      (calls proof/; receipt_body → receipt_hash_sha256)
      → storage              (DB + blob; persist receipt, document refs)
  ← response (receipt_id, receipt_hash_sha256, …)
```

**Ingest path (when enabled):** same entry → **ingest_service** (OCR, `ingest_packet.v1`) **beside** signing; receipt binds ingest **only** if schema includes `ingest_packet_digest_sha256` (see [`RECEIPT_SCHEMAS.md`](RECEIPT_SCHEMAS.md)).

**Draft path:** API → draft/LLM **optional**; output becomes document bytes only through normal document flow—**not** inside `receipt_service` / `proof/`.

**Optional timeline:** handler may append **timeline_service** events **after** receipt (refs only); does not replace receipt proof.

---

## Optional anchor flow (async, separate)

```
After receipt persisted
  → enqueue anchor job (receipt_hash and/or batch Merkle root)
    → anchor_adapter worker
      → external anchor (chain / log / TSP)
      → store anchor ref + status on row (pointer only)
```

- **Does not** run on the critical path for sign/receipt HTTP.
- **Does not** mutate `receipt_hash_sha256` or hashed receipt body.
- **Does not** define truth; local verification remains authoritative per canon.

---

## Module composition (orchestration)

Handlers **compose** modules only—no new service types:

`complete_sign`: document (read binding) → signature → receipt → storage → optional timeline event → **optional** anchor enqueue.

See [`SERVICE_BOUNDARIES.md`](SERVICE_BOUNDARIES.md) for does-not-do boundaries per module.
