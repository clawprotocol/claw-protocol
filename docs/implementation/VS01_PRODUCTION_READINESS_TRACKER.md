# CLAW Production Readiness Tracker (VS01)

**Scope (LOCKED)** — Ship only:

1. **Agreement Creator** (thin VS01 path: finalize bytes → sign → receipt → bundle)
2. **E-Sign + Counterparty Flow** (incremental: proof spine first; multi-party envelope layered on)

Everything else is **deferred** (draft/LLM workspace, timeline, anchor, enterprise CLM, legacy `/v1/agreements/*` product).

**Last reviewed:** repo state — see “Implementation notes” at bottom.

---

## Current Live Flow (Truth Only)

| Item | Status | Notes |
|------|--------|--------|
| Agreement intake → structured draft | **Deferred** | Not VS01; use legacy agreements product if needed |
| Agreement render (clean HTML) | **Deferred** | Not VS01 thin path |
| Revise agreement via instruction | **Deferred** | LLM/draft surface |
| Finalize agreement → `document_id` + `content_sha256` | **Done** | `POST /v1/documents`; UI: `StepFinalize` |
| Creator signing session | **Done** | `POST /v1/sign-sessions` + complete; UI: `StepSign` |
| Signature placement (basic UX) | **Done** | Single `field_manifest` rectangle (numeric) |
| Receipt generation (deterministic) | **Done** | `receipt_service` + `backend/proof/*` |
| Receipt visible in UI | **Done** | `StepDone` + optional refresh |
| Bundle generation | **Done** | `GET /v1/receipts/{id}/bundle` → `claw-bundle.zip` |

---

## Envelope Flow (Multi-Party)

| Item | Status | Notes |
|------|--------|--------|
| Add counterparties (name + email) | **Partial** | `CounterpartyList`, `StepCreateAgreement`, `types.ts` (`Vs01Counterparty`) exist under `frontend/src/vs01/` — **not wired** into `Vs01Wizard.tsx` yet (wizard still uses `StepFinalize` → `StepSign` → `StepDone`) |
| Store envelope state (frontend or backend) | **Partial** | Frontend-only types/helpers; no backend envelope API in this slice |
| Prepare creator signature | **Done** | Same as creator sign step when wired |
| Send signing request to counterparties | **Stub** | `StepCompleteAndSend` — “Prepare send package” preview only; **no** email/API |
| Counterparty signing flow | **Not done** | Requires envelope backend + routed links or sessions |
| Multi-sign receipt aggregation | **Not done** | Orchestration product; each signer still gets **distinct** `receipt_id` per VS01 model |

---

## UX Requirements (Production Bar)

| Item | Status | Notes |
|------|--------|--------|
| Mobile usable (≤520px) | **Partial** | VS01 shell uses max-width column + tokens; responsive tweaks in `vs01.css` (e.g. counterparty grid) — verify on device |
| No dead-end screens | **Partial** | Wizard has back/continue; full envelope flow needs wiring |
| Clear next-step CTAs | **Partial** | Strongest on wired steps 0–2 |
| Minimal clicks | **Partial** | Thin path is 3 steps |
| No confusing technical language | **Partial** | Human copy in newer step components; step 0 finalize still developer-oriented in places |
| “DocuSign-level clarity” | **Aspirational** | Track as polish milestone |

---

## Determinism / Integrity (CLAW Core)

| Item | Status | Notes |
|------|--------|--------|
| Canonical JSON stable | **Done** | `backend/proof` + tests |
| `content_sha256` consistent across flow | **Done** | Bound at finalize; sign session validates |
| `receipt_hash_sha256` reproducible | **Done** | For fixed inputs; `document_id` changes per finalize (see `VS01_REVIEW_AND_COMPRESSION.md`) |
| No nondeterministic fields in receipt body | **Done** | Per schema/tests |
| Same input → same output hash | **Done** | Determinism tests for fixed doc + inputs |

---

## Verified Commands

```bash
# Backend VS01 slice (use project venv / uv if `python -m pytest` is unavailable)
uv run pytest -q backend/tests/test_vs01_*
# or: python3 -m pytest -q backend/tests/test_vs01_*

# Frontend
cd frontend && npm run build && cd ..
```

---

## Implementation Notes (Repo)

- **Active wizard:** `frontend/src/vs01/Vs01Wizard.tsx` → `StepFinalize` → `StepSign` → `StepDone`.
- **Envelope UI (present, integrate later):** `StepCreateAgreement.tsx`, `StepPrepareSignature.tsx`, `StepCompleteAndSend.tsx`, `CounterpartyList.tsx`.
- **API surface (VS01 proof spine):** `frontend/src/vs01/vs01Api.ts` — `/v1/documents`, `/v1/sign-sessions`, `/v1/receipts`.
- **Backend:** `backend/routers/vs01_*.py`, `document_service`, `signature_service`, `receipt_service`, `backend/proof/*`.

---

## Changelog

| Date | Change |
|------|--------|
| (add as you ship) | |
