# CLAW v1 — Product scope (strict)

Source architecture: [`docs/architecture/CLAW_GTM_MASTER_PLAN.md`](../architecture/CLAW_GTM_MASTER_PLAN.md).

---

## Included in v1 (exact)

| Feature | Definition of “in” |
|---------|---------------------|
| **Agreement drafting** | Prompt-first intake → structured draft → review/export. Non-binding; not legal advice. |
| **E-sign** | Field placement, completion, frozen `sign_packet.v1`, binding to **document raw-byte** `content_sha256`. |
| **OCR / ingest** | Upload PDF/image → stored bytes + hash → OCR text + versioned ingest record per `ingest_packet.v1`. **Optional product slice:** sign-only without OCR (opaque upload). |
| **Deterministic receipts** | `receipt.v1` via `proof/` + `receipt_service`; same inputs ⇒ same `receipt_hash_sha256`; offline recompute per [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md). |
| **Verification bundle** | Export path + manifest (`verification_bundle.v1`) + artifacts (e.g. `receipt.json`, document bytes) + instructions to verify locally. |
| **Minimal auth** | Enough to attribute `signer_ref` / ACL; not a full identity marketplace. |

**Optional in v1 (may ship off or thin):** timeline/case events (`timeline_event.v1`); anchor adapter (async, default off).

---

## Excluded from v1 (exact)

- Blockchain **required** for core flows; smart-contract as source of truth.
- DAOs, tokens, governance incentives.
- Multi-tenant marketplace / full CLM / court e-filing automation.
- Microservices or multi-region active-active **as a v1 requirement**.
- AI as source of truth for hashes, receipts, or “verified” without explicit human/system inputs per schema.
- Product claims of legal enforceability, jurisdiction, or legal conclusions.
- AI output inside hashed `receipt_body` / `sign_packet.v1` (see ADR-002).

---

## Launch-ready acceptance criteria

| ID | Criterion |
|----|-----------|
| **L1** | Two independent builds produce identical `receipt_hash_sha256` for identical `receipt_body` inputs; golden tests document canon rules. |
| **L2** | End-user can complete **sign** flow; receipt includes document binding consistent with `sign_packet.v1` + `RECEIPT_SCHEMAS.md`. |
| **L3** | User can **export** a bundle; verifier can check artifact `content_sha256` entries and recompute receipt hash without CLAW servers. |
| **L4** | **Draft** path: LLM optional; no import of LLM modules in `proof/` or deterministic receipt build path (CI/import guard or documented check). |
| **L5** | **Ingest** (if shipped): upload → stable `content_sha256` + `ocr_text_sha256` per schema; OCR text not in receipt unless optional `ingest_packet_digest_sha256` is explicitly set per product choice. |
| **L6** | **Golden path:** draft *or* upload → sign → receipt → download bundle; README links to `CLAW_GTM_MASTER_PLAN.md` (or this doc + architecture index). |

**Anchor (if enabled):** async only; receipt API success does not wait on anchor; anchor ref stored outside hashed receipt body.

---

## Scope lock

Anything not listed under **Included** is out of scope unless explicitly added in a new doc revision and schema/ADR bump.
