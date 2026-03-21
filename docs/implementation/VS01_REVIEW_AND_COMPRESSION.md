# VS01 backend slice — review & compression (GTM)

Scope reviewed: VS01 routers (`/v1/documents`, `/v1/sign-sessions`, `/v1/receipts`), three filesystem-backed services, `backend/utils/vs01_verification_bundle.py`, and `backend/tests/test_vs01_*`. Legacy `/v1/receipts` overlap checked via `backend/main.py` grep.

---

## 1. What VS01 covers (capabilities + confidence)

### Capabilities (concrete)

| Area | Behavior |
|------|----------|
| **Documents** | `POST /v1/documents` finalize base64 bytes → `document_id`, `content_sha256`, metadata; `GET /v1/documents/{id}` meta; `GET /v1/documents/{id}/content` raw bytes; `POST /v1/documents/{id}/sign-prep` frozen `sign_packet.v1` + digest (no receipt). |
| **Sign sessions** | `POST /v1/sign-sessions` binds `document_id` + expected `content_sha256`; `POST /v1/sign-sessions/{id}/complete` builds sign packet + issues and persists `receipt.v1`. |
| **Receipts** | `GET /v1/receipts/{receipt_id}` loads JSON from `receipt_service`; `GET /v1/receipts/{receipt_id}/bundle` streams a zip (`manifest.json`, `receipt.json`, `document.bin`, `VERIFY.md`) via `build_verification_bundle_zip_bytes`. |
| **Storage** | Separate roots: `CLAW_DOCUMENTS_DIR`, `CLAW_SIGN_SESSIONS_DIR`, `CLAW_RECEIPTS_DIR` (defaults under `artifacts/`). No DB for VS01 path. |
| **Proof** | `receipt_service` / `signature_service` delegate to `backend.proof` for normalization and digests (not re-audited in this pass). |

### Confidence (tests)

| Module | Files | Notes |
|--------|--------|--------|
| Proof | `test_vs01_proof.py` | Golden vectors + mismatch cases for canon, sign digest, receipt hash. |
| Services + HTTP | `test_vs01_receipt_sign.py`, `test_vs01_documents_sign.py` | Session errors, complete-sign, GET receipt patterns. |
| Bundle | `test_vs01_receipt_bundle.py` | GET receipt/bundle, manifest vs bytes, failure cases. |
| E2E | `test_vs01_e2e.py` (marker `e2e`) | Full chain: finalize → session → complete → GET receipt → bundle unzip + hash checks. |
| Determinism | `test_vs01_determinism.py` | Two completes on **same** document + identical inputs → same `sign_packet` / digests / `receipt_hash_sha256`; proof-recompute consistency; bundle zip stable when `bundle_id` + `created_at` fixed. |

**Overall:** High confidence for the **VS01 slice** in isolation (tmp_path env isolation in tests). **Production** confidence is **moderate** until auth, ACL, durable storage, and ops runbooks are defined (see risks).

---

## 2. Route overlap: `/v1/receipts`

**VS01 (filesystem `receipt.v1`):**

- `GET /v1/receipts/{receipt_id}` — `vs01_receipts_api`
- `GET /v1/receipts/{receipt_id}/bundle` — same

**Legacy (SQLite / timeline store),** registered on `app` in `main.py` (not VS01 routers):

- `GET /v1/timeline/receipts/{receipt_id}` — raw timeline receipt JSON
- `GET /v1/timeline/receipts/{receipt_id}/verify` — verifier-style read via `get_receipt_for_verify`

**Verdict:** `/v1/receipts/*` is **not** duplicated with timeline routes after the prefix split. Clients must treat **`rcpt_*` (VS01)** vs **timeline receipt ids** as different namespaces; **no ID collision** is guaranteed if both systems issue opaque strings—document in API docs and product UI.

**Other prefixes** (`/v1/esign`, `/v1/agreements/*`, `/v1/workflow/*`): not re-scanned here; they remain **parallel product surfaces** (draft/legacy flows). VS01 does not replace them without an explicit integration story.

---

## 3. Risks (concise)

| Category | Risk |
|----------|------|
| **Determinism** | `receipt_hash_sha256` is stable for fixed `sign_packet` + `protocol_version`; **`document_id` and content hash change per finalize**, so cross-run “golden” receipt hashes are invalid unless document + inputs are fixed. Tests encode this correctly. |
| **Bundle** | HTTP download uses default `bundle_id` / `created_at` from helper → **zip bytes vary** by time unless API later exposes fixed metadata (tests use direct helper with fixed ids for determinism). |
| **Storage** | Local filesystem: no durability/replication; **lost disk = lost evidence**; no tenant isolation; paths reject traversal but **no auth** on routes. |
| **Routing** | Mitigated: legacy receipt reads live under `/v1/timeline/receipts/...`; verifier-only middleware allows `/v1/receipts/` per `main.py`. |
| **Operational** | `receipt_id` is random; **no idempotency** on complete-sign retry beyond session state (409 after first success). |

---

## 4. Simplest path to ship as v1 backend

1. **Freeze the VS01 surface** for the agreement-signing utility: `documents` → `sign-sessions` → `receipts` + bundle only; document **draft** can stay on existing `/v1/agreements*` until product unifies.
2. **Env** — set `CLAW_*_DIR` to persistent volumes in production; keep defaults for dev.
3. **Docs** — one-page “VS01 vs timeline receipts” for integrators (id prefixes, which GET to call).
4. **Minimal hardening** (post-v1 acceptable if internal pilot): auth, rate limits, backup/retention, optional DB mirror of receipt JSON.

**Do not touch yet:** broad refactors of `main.py`, merging `esign` with VS01, or timeline anchor paths.

**Postpone:** OCR, timeline binding fields on `receipt.v1`, anchor jobs, multipart ingest—out of VS01 scope.

---

## 5. Blockers for launch

| Blocker? | Detail |
|----------|--------|
| **Proof correctness** | **No** — covered by `test_vs01_proof.py` + service tests. |
| **End-to-end path** | **No** — `test_vs01_e2e.py` exercises the full HTTP chain. |
| **Product** | **Maybe** — auth/tenancy, legal copy, and **which** frontend calls which route remain product decisions, not code gaps in VS01. |
| **Multi-tenant production** | **Yes** until auth + storage isolation are specified—acceptable for **single-tenant / controlled pilot**. |

**Recommendation:** **Yes** — VS01 can serve as the **backend basis** for a v1 agreement-signing utility **for the proof spine** (finalize → sign → receipt → bundle). Remaining work is **operational and product** (auth, persistence SLA, UI wiring), not replacing the proof layer.

---

*Last updated: VS01 slice review (routers + services + tests + `/v1/receipts` grep in `main.py`).*
