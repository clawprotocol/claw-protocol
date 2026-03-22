# Vertical slice 01 — Backend implementation tasks

**Scope:** Backend only for [`VERTICAL_SLICE_01_AGREEMENT_SIGN.md`](VERTICAL_SLICE_01_AGREEMENT_SIGN.md). **Excluded:** frontend, OCR/ingest, timeline, anchor, repo-wide refactors.

**Normative:** [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md), [`SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md), [`ADR-001`](../adr/ADR-001-deterministic-core.md), [`ADR-002`](../adr/ADR-002-ai-vs-proof-boundary.md).

---

## 1. Build order (sequence)

Execute in this order; each row is one Cursor-sized pass.

| Step | Task ID | Summary |
|------|---------|---------|
| 1 | **VS01-B01** | `proof/`: canonical JSON bytes + SHA-256 hex primitive (single implementation). |
| 2 | **VS01-B02** | `proof/`: `field_manifest` sort + `sign_packet_digest_sha256`. |
| 3 | **VS01-B03** | `proof/`: `receipt_body` construction + `receipt_hash_sha256` + digest consistency check. |
| 4 | **VS01-B04** | Unit tests + golden vectors for B01–B03. |
| 5 | **VS01-B05** | `document_service`: persist raw bytes, compute/store `content_sha256`, issue `document_id`. |
| 6 | **VS01-B06** | `POST` finalize document + `GET` document by id (metadata and/or byte stream). |
| 7 | **VS01-B07** | `signature_service`: validate inputs, normalize `field_manifest`, build frozen `sign_packet.v1` dict (no HTTP). |
| 8 | **VS01-B08** | Optional: sign-session row + `POST` create session bound to `document_id` + expected hash. |
| 9 | **VS01-B09** | `receipt_service`: given `sign_packet` + `protocol_version`, produce full `receipt.v1` (calls `proof/` only); assign `receipt_id`. |
| 10 | **VS01-B10** | `POST` complete sign: orchestrate document read → `signature_service` → `receipt_service` → persist receipt. |
| 11 | **VS01-B11** | `GET` receipt by id. |
| 12 | **VS01-B12** | Bundle export: build `verification_bundle.v1` manifest + zip (`manifest.json`, `receipt.json`, document bytes, `VERIFY.md`). |
| 13 | **VS01-B13** | Integration test: finalize → complete sign → GET receipt → GET bundle. |
| 14 | **VS01-B14** | Golden-path + determinism test (fixed `signed_at` / frozen time). |

---

## 2. Task list

### VS01-B01 — Canon + hash primitive

| Field | Content |
|--------|---------|
| **Purpose** | Single source for UTF-8 canonical JSON bytes per ADR-001 / [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md) global rules. |
| **Files / modules (likely)** | `backend/proof/` (or extend existing `backend/utils/canonical_json.py` **only if** it already matches ADR-001; otherwise isolate under `proof/` to avoid accidental drift). |
| **Schemas** | None (primitives only). |
| **Endpoints** | None. |
| **Tests** | Unit: known object → known canon bytes; hex lowercase 64. |
| **Completion** | One function used by all later digest code; documented `sort_keys`, `separators`, `ensure_ascii=False`. |
| **Dependencies** | None. |
| **Determinism** | Fully deterministic. **No AI.** |
| **Stop point** | Optional micro-commit after B01 alone if repo already has partial canon—prefer batching with B02. |

---

### VS01-B02 — Sign packet digest + manifest sort

| Field | Content |
|--------|---------|
| **Purpose** | Implement `sign_packet_digest_sha256` and stable `field_manifest` ordering per schema §1. |
| **Files / modules** | `backend/proof/sign_packet.py` (or equivalent under `proof/`). |
| **Schemas** | `sign_packet.v1` (hash boundary only). |
| **Endpoints** | None. |
| **Tests** | Unit: two permutations of `field_manifest` → same digest after sort; invalid hex rejected. |
| **Completion** | Digest matches hand-computed or frozen golden for a minimal packet. |
| **Dependencies** | VS01-B01. |
| **Determinism** | Deterministic given packet dict. **No AI.** |
| **Stop point** | Safe commit after B02 + B01. |

---

### VS01-B03 — Receipt body + receipt hash

| Field | Content |
|--------|---------|
| **Purpose** | Build `receipt_body` (omit `receipt_id`, `receipt_hash_sha256`; omit ingest/timeline keys for this slice), compute `receipt_hash_sha256`, verify `sign_packet_digest_sha256` matches embedded `sign_packet`. |
| **Files / modules** | `backend/proof/receipt.py` (or under `proof/`). |
| **Schemas** | `receipt.v1` (hashing subset). |
| **Endpoints** | None. |
| **Tests** | Unit: mismatch digest fails; wrong `document_content_sha256` vs sign_packet fails. |
| **Completion** | Full receipt object assembly helper returns `{ receipt_body fields..., sign_packet, sign_packet_digest_sha256 }` plus computed `receipt_hash_sha256` for attachment to stored JSON. |
| **Dependencies** | VS01-B02. |
| **Determinism** | Deterministic for fixed `sign_packet`, `protocol_version`. **No AI.** |
| **Stop point** | **Strong stop:** commit after **VS01-B04** (proof layer complete + tests). |

---

### VS01-B04 — Proof unit tests + golden vectors

| Field | Content |
|--------|---------|
| **Purpose** | Lock B01–B03 behavior; CI fails on canon drift. |
| **Files / modules** | `backend/tests/test_vs01_proof_*.py` (or under existing test layout). |
| **Schemas** | `sign_packet.v1`, `receipt.v1` (fixtures). |
| **Endpoints** | None. |
| **Tests** | Golden vectors committed for at least one minimal sign+receipt chain. |
| **Completion** | `pytest` green for new module; documents expected hashes in test or adjacent `.json` fixture. |
| **Dependencies** | VS01-B01–B03. |
| **Determinism** | Assertions on exact digests. **No AI.** |
| **Stop point** | **Strong stop:** proof package done. |

---

### VS01-B05 — Document service persistence

| Field | Content |
|--------|---------|
| **Purpose** | Store immutable finalized bytes; persist `content_sha256` (raw bytes SHA-256); opaque `document_id`. |
| **Files / modules** | `document_service` (path per repo: e.g. `backend/services/document_service.py` + minimal DB migration or sqlite table + blob path). |
| **Schemas** | None (storage metadata only; not `receipt_body`). |
| **Endpoints** | None yet (library/API next). |
| **Tests** | Unit/integration: upload fixture bytes → id + hash round-trip. |
| **Completion** | Read-back bytes equal input; hash matches recompute. |
| **Dependencies** | None (parallelizable after B04, but **before** B07). |
| **Determinism** | `content_sha256` is deterministic from bytes. **No AI** in this module. |
| **Stop point** | Commit after B05 alone OK. |

---

### VS01-B06 — Document HTTP: finalize + get

| Field | Content |
|--------|---------|
| **Purpose** | Expose finalize and read for signing/bundle (per vertical slice §3). |
| **Files / modules** | API router + `document_service` calls. |
| **Schemas** | Response: `document_id`, `content_sha256`, `mime_type`. |
| **Endpoints** | `POST /api/v1/documents` (or `.../finalize`); `GET /api/v1/documents/{id}`. |
| **Tests** | Integration: POST then GET; hash stable. |
| **Completion** | Client can obtain binding hash for sign session. |
| **Dependencies** | VS01-B05. |
| **Determinism** | Same bytes → same hash. **No AI** in handler. |
| **Stop point** | Safe commit after B06. |

---

### VS01-B07 — Signature service (library)

| Field | Content |
|--------|---------|
| **Purpose** | From `document_id`, loaded `content_sha256`, `signer_ref`, `intent`, `signed_at`, client `field_manifest`: produce schema-valid `sign_packet.v1` dict with sorted manifest. |
| **Files / modules** | `signature_service` (e.g. `backend/services/signature_service.py`). |
| **Schemas** | `sign_packet.v1`. |
| **Endpoints** | None (called from orchestration). |
| **Tests** | Unit: rejects hash mismatch vs document store; rejects malformed manifest. |
| **Completion** | Output passes through `proof/` digest without mutation. |
| **Dependencies** | VS01-B02, VS01-B05 (read binding). |
| **Determinism** | Deterministic given inputs; `signer_ref` must come from auth context injection in B10, **not** from any LLM route. |
| **Stop point** | Commit after B07 + tests. |

---

### VS01-B08 — Sign session (optional but recommended)

| Field | Content |
|--------|---------|
| **Purpose** | Bind `document_id` + expected `content_sha256` before complete-sign; optional idempotency key storage. |
| **Files / modules** | `signature_service` + small DB table; router. |
| **Schemas** | None (session row is operational). |
| **Endpoints** | `POST /api/v1/sign-sessions`. |
| **Tests** | Integration: create session with wrong hash → complete fails. |
| **Completion** | Session id returned; complete-sign requires valid session. |
| **Dependencies** | VS01-B06. |
| **Determinism** | N/A (operational). **No AI.** |
| **Stop point** | Can merge B08 with B10 in one pass if scope creep risk is low—prefer separate commit. |

---

### VS01-B09 — Receipt service (build + persist)

| Field | Content |
|--------|---------|
| **Purpose** | Wrap `proof/` to build full stored `receipt.v1` JSON including `receipt_id`, `receipt_hash_sha256`; persist row linked to `document_id`. |
| **Files / modules** | `receipt_service` + DB; **must not** import LLM (ADR-002). |
| **Schemas** | `receipt.v1` (full persisted object). |
| **Endpoints** | None (internal), until B11. |
| **Tests** | Unit: persisted JSON verifies with `proof/` recompute. |
| **Completion** | Single entrypoint e.g. `issue_receipt(sign_packet, protocol_version) -> receipt dict`. |
| **Dependencies** | VS01-B03, VS01-B04. |
| **Determinism** | Same logical inputs + same `signed_at` in sign_packet → same `receipt_hash_sha256`. **No AI.** |
| **Stop point** | Commit after B09 + tests. |

---

### VS01-B10 — Complete sign HTTP orchestration

| Field | Content |
|--------|---------|
| **Purpose** | `POST .../sign-sessions/{id}/complete` (or single-shot complete without session if B08 skipped): load document → `signature_service` → `receipt_service` → transactionally persist. |
| **Files / modules** | Router/handler only; compose existing modules. |
| **Schemas** | Request: `field_manifest`, optional `intent`; Response: `receipt_id`, `receipt_hash_sha256`, receipt JSON. |
| **Endpoints** | `POST /api/v1/sign-sessions/{id}/complete` (or equivalent). |
| **Tests** | Integration: happy path + hash mismatch error. |
| **Completion** | Matches vertical slice contract §3. |
| **Dependencies** | VS01-B07, VS01-B09, VS01-B06; VS01-B08 if implemented. |
| **Determinism** | Orchestration passes **only** structured fields to `signature_service` / `receipt_service`. Draft/LLM routes, if present elsewhere, **must not** call this handler’s internals (ADR-002). |
| **Stop point** | **Strong stop:** “signed receipt issuable over HTTP.” |

---

### VS01-B11 — GET receipt

| Field | Content |
|--------|---------|
| **Purpose** | Read persisted receipt for UI/verify. |
| **Files / modules** | Router + `receipt_service` read. |
| **Schemas** | `receipt.v1` (read model). |
| **Endpoints** | `GET /api/v1/receipts/{receipt_id}`. |
| **Tests** | Integration: GET after complete. |
| **Completion** | JSON matches stored row. |
| **Dependencies** | VS01-B10. |
| **Determinism** | Read-only. **No AI.** |
| **Stop point** | Commit with B10 or immediately after. |

---

### VS01-B12 — Verification bundle zip

| Field | Content |
|--------|---------|
| **Purpose** | `GET .../receipts/{id}/bundle`: stream zip per vertical slice §6; `manifest.json` = `verification_bundle.v1`; `artifacts` sorted by `path`; include `receipt.json`, document bytes, `VERIFY.md`. |
| **Files / modules** | Export handler or **small helper module** in monolith (not a new *service* name—e.g. `bundle_export.py` next to handlers). |
| **Schemas** | `verification_bundle.v1`. |
| **Endpoints** | `GET /api/v1/receipts/{receipt_id}/bundle`. |
| **Tests** | Integration: unzip; verify each file’s SHA-256 against manifest; recompute `receipt_hash` from `receipt.json`. |
| **Completion** | Meets vertical slice acceptance §8 items 3–4 at API level. |
| **Dependencies** | VS01-B11, VS01-B05 (document bytes read). |
| **Determinism** | Manifest `artifacts[].content_sha256` from actual file bytes; paths/roles from constants in code. **No AI**; never trust client-supplied paths (ADR-002). |
| **Stop point** | **Strong stop:** slice export complete. |

---

### VS01-B13 — End-to-end integration test

| Field | Content |
|--------|---------|
| **Purpose** | Single test chain: finalize → complete sign → GET receipt → GET bundle. |
| **Files / modules** | `backend/tests/test_vs01_e2e.py` (or marker `e2e`). |
| **Schemas** | All three touched. |
| **Endpoints** | All slice endpoints. |
| **Tests** | One full HTTP journey (TestClient). |
| **Completion** | Green in CI. |
| **Dependencies** | VS01-B12. |
| **Determinism** | Assert manifest hashes and receipt hash recomputation. |
| **Stop point** | Commit after B13. |

---

### VS01-B14 — Determinism / golden-path regression

| Field | Content |
|--------|---------|
| **Purpose** | Two complete-sign calls with identical controlled inputs (inject/freeze `signed_at`) → identical `receipt_hash_sha256`. |
| **Files / modules** | Test only; may add test-only clock or constructor param for `signed_at`. |
| **Schemas** | `receipt.v1`. |
| **Endpoints** | Via TestClient. |
| **Tests** | Dedicated determinism test + documented golden hash in repo. |
| **Completion** | Meets vertical slice §7 determinism + ADR-001. |
| **Dependencies** | VS01-B10 minimum (B13 optional). |
| **Determinism** | This task *is* the safeguard check. |
| **Stop point** | **Final stop** for backend slice. |

---

## 3. First-pass module plan (names only)

| Module | First deliverable in slice |
|--------|----------------------------|
| **`proof/`** | B01–B04: canon, sign digest, receipt hash, tests. |
| **`document_service`** | B05–B06: bytes + hash + HTTP finalize/get. |
| **`signature_service`** | B07–B08: sign_packet build + optional session HTTP. |
| **`receipt_service`** | B09 + B11: build/persist/read receipt. |
| **Router / handler** | B06, B08, B10–B12: HTTP surface only; thin composition. |
| **Bundle helper** (non-service) | B12: zip + `verification_bundle.v1` assembly next to handler or `backend/utils/`—**not** a sixth service. |

No **`ingest_service`**, **`timeline_service`**, or **`anchor adapter`** work in this doc.

---

## 4. Determinism safeguards (summary by layer)

| Layer | Must be deterministic | Must NOT use AI / model output |
|--------|------------------------|--------------------------------|
| **`proof/`** | Canon bytes, all digests, sort orders | Entire module (ADR-002). |
| **`receipt_service`** | Receipt build path | Entire module; no LLM imports. |
| **`signature_service`** | `sign_packet.v1` from explicit inputs | Do not accept LLM-generated `signer_ref`, `intent`, geometry, or document hash. |
| **`document_service`** | `content_sha256` from bytes | No “smart” normalization of bytes unless spec’d and version-bumped (out of slice). |
| **Bundle helper** | `content_sha256` over written files; sorted `artifacts` | No LLM; fixed path strings in code. |
| **Routers** | Delegate only | Draft/LLM endpoints (if any) live separately; never pass model text into `receipt_service.build`. |

---

## 5. Stop points (recommended commits)

| After | Label | Rationale |
|-------|--------|-----------|
| **VS01-B04** | `proof: vs01 sign+receipt digests` | Deterministic core mergeable without DB/API. |
| **VS01-B06** | `feat: document finalize + get` | Storage + first HTTP vertical leg. |
| **VS01-B07** | `feat: signature_service sign_packet builder` | Sign logic testable without receipt persist. |
| **VS01-B10** | `feat: complete sign issues receipt` | Core product transaction. |
| **VS01-B12** | `feat: verification bundle zip export` | Exporter mergeable. |
| **VS01-B14** | `test: vs01 golden path + determinism` | Slice closure per vertical slice §8. |

---

*Frontend, OCR, timeline, and anchor tasks belong in other docs.*
