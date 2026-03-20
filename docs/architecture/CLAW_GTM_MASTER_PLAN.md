# CLAW GTM Master Plan (v1)

Single source for launch-scope product architecture: drafting, e-sign, ingest, and deterministic receipts. Aligns with a minimal **backend / frontend / docs / schemas / tests** layout.

---

## v1 product scope (strict)

| Area | In |
|------|-----|
| **Agreement drafting** | Prompt-first intake → structured draft → review/export (non-binding templates; not legal advice). |
| **E-sign** | Simple flow: place fields, sign, capture attestation payload, bind to document hash. |
| **OCR / ingest** | Upload PDF/image → extract text + layout refs → store bytes + `content_sha256` → optional draft assist (AI never hashes). |
| **Deterministic receipts** | Canonical serialization → stable `receipt_hash` / proof inputs → verify offline from bundle. |

**Out of v1:** blockchain-required flows, DAO/tokenomics, multi-tenant marketplace, full CLM, court filing automation, AI as source of truth for hashes.

---

## System layers

1. **Presentation (Web)** — ChatGPT-simple drafting UI; DocuSign-simple sign UI; upload/ingest; download bundle; disclaimers visible.
2. **API (monolith)** — Auth (minimal), routing, orchestration, persistence, calls to deterministic **receipt** and **ingest** modules.
3. **Proof layer (library / pure functions)** — Canonical JSON, hash rules, receipt construction, verification. **No network, no LLM.** Same code path used in tests and production.

Optional later: async **anchor adapter** (writes commitment; does not define truth).

---

## Minimal architecture (text diagram)

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (frontend)                                          │
│  Draft · Sign · Upload · Export bundle · Verify (optional)   │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS (JSON + files)
┌───────────────────────────▼─────────────────────────────────┐
│  API (backend monolith)                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐   │
│  │ Draft routes │ │ E-sign routes│ │ Ingest/OCR routes    │   │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘   │
│         │                │                     │               │
│         └────────────────┼─────────────────────┘               │
│                          ▼                                    │
│              ┌───────────────────────┐                        │
│              │ Receipt service      │  ← deterministic only  │
│              │ (canon + hash + build)│                        │
│              └───────────┬───────────┘                        │
│                          │                                    │
│              ┌───────────▼───────────┐                        │
│              │ Storage (DB + blob)   │                        │
│              └───────────────────────┘                        │
└───────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │ LLM adapter (optional)   │  → suggestions only;
              │                            │    never mutates receipt inputs
              └───────────────────────────┘
```

---

## Proposed repo / module structure (not inferred from tree)

Use **names that match your repo** where they already exist; this is the target mental model.

```
backend/
  api/                 # HTTP routers, DTOs
  services/
    document_service.py
    signature_service.py
    ingest_service.py
    receipt_service.py   # deterministic core; thin I/O wrapper
    timeline_service.py  # optional v1: ordered events for a “case”
  proof/                 # canon_json, hash, receipt builders (pure)
frontend/
  src/                   # app routes, drafting, sign, upload
docs/
  architecture/          # this file, ADRs, boundaries
schemas/                 # JSON Schema or OpenAPI fragments for v1 payloads
tests/
  unit/                  # proof + receipt invariants
  integration/           # API + storage
```

**Rule:** `proof/` and `receipt_service` depend on nothing that imports LLM or random IDs into the hashed payload without explicit, versioned fields.

---

## Step-by-step build order

1. **Schemas v1** — Freeze field names for `sign_packet`, `ingest_packet`, `receipt`, `timeline_event` (even if stubbed in code).
2. **Proof module** — Canonical JSON + SHA-256 over defined boundaries; golden vectors in tests.
3. **Receipt service** — Build receipt from signed inputs only; unit tests for determinism and tamper detection.
4. **Document + storage** — Store file bytes, `content_sha256`, metadata; serve for sign/review.
5. **E-sign API + UI** — Field placement, completion, emit sign payload → receipt.
6. **Draft API + UI** — Prompt/structured draft; export; **LLM behind flag**, never in hash path.
7. **Ingest/OCR** — Pipeline: upload → hash → OCR → structured text refs; link to draft optionally.
8. **Verification bundle** — Zip or JSON manifest: artifacts + `receipt` + instructions to re-verify locally.
9. **Hardening** — Rate limits, audit log, `make validate` / CI parity.

---

## Out-of-scope (v1)

- On-chain settlement, smart-contract truth
- Token incentives, governance, DAOs
- Full identity/KYC marketplace
- AI-generated hashes, receipts, or “verified” flags without human/system inputs
- Multi-region active-active microservices
- Legal opinion or enforcement product claims

---

## Acceptance criteria (by phase)

| Phase | Done when |
|-------|-----------|
| **P0 Proof** | Two machines produce identical `receipt_hash` for identical inputs; changing one bit of hashed input changes hash; tests document serialization rules. |
| **P1 E-sign** | User can complete sign flow; receipt includes document binding (hash of canonical doc state); export includes verify instructions. |
| **P2 Draft** | Single-intake draft + review; exports; LLM optional and isolated from `receipt_service`. |
| **P3 Ingest** | Upload → stored hash + OCR text; ingest record versioned; no OCR text in receipt unless explicitly in schema and hashed. |
| **P4 GTM** | One golden doc path: draft or upload → sign → receipt → download bundle; README points to `docs/architecture/CLAW_GTM_MASTER_PLAN.md`. |

---

## Versioning

- Bump **schema** (`receipt.v1` → `receipt.v2`) when hashed fields change.
- Keep **verifiers** able to validate old versions from frozen docs under `schemas/` and `docs/adr/`.

---

*This plan is the v1 GTM contract: minimal moving parts, proof integrity isolated from AI and optional anchoring.*
