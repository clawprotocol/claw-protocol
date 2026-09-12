# Phase 4C.2.2 checkpoint — uploaded-PDF receipt integrity

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `1e252f65` (`1e252f65ecb00f56be26d42826c628a4c339e644`) — Phase 4C.2.1 checkpoint  
Product/backend authority: `f6ec9962` (`f6ec9962271608e30e53107a667169ddfb8dd5d5`)  
Gate/tests: `9e9e263c` (`9e9e263c5d396ba03551473dedc49e6339553c3b`)  
Nothing was pushed. This is **not** a launch authorization. Billing, Settings, admin, live-service testing, leftover Vitest cleanup, and the next sitemap page were not begun.

Phase 4C.2.2 is containment of the uploaded-PDF receipt. It makes that receipt a single immutable, cryptographically complete artifact issued during signer completion. It is not a drafted-agreement `receipt.v1` change.

## Production gaps confirmed and repaired

| Gap at `1e252f65` | Repair |
|---|---|
| `issue_uploaded_pdf_receipt` hashed a generic `receipt.v1` packet, then appended packet revision, field-manifest digest, signer set, and completion events. Displayed `receipt_hash_sha256` did not bind the returned evidence. | New typed `uploaded_final_pdf_receipt.v1` is assembled completely, then hashed, then persisted. |
| Artifact-store receipt and `quick_pdf_envelope_v1.final_receipt` were different payloads. | The artifact repository is the only authority. The draft stores receipt ID/digest only. |
| Envelope/receipt/bundle GET called `_persist_final_receipt_if_ready` and could mint. | Those GETs are read-only. Missing/mismatched artifacts return retryable `receipt_pending` / `receipt_unavailable`. |
| Recipient `vs01-signer-complete` did not issue the uploaded-PDF receipt when the second required signer finished. | Issuance runs inside `vs01_signer_complete_lock` when owner or recipient completion makes the required set complete. |

## Authority

| Rule | Behavior |
|---|---|
| Schema | `uploaded_final_pdf_receipt.v1` — typed extension. Drafted-agreement `receipt.v1` hashing is unchanged. |
| Construction | Complete payload first: PDF ID/hash/length/type/page count, agreement ID, packet revision, field-manifest digest, required signer role/participant IDs, durable completion-event IDs and server timestamps, signature/consent artifact hashes. |
| Secrets | Raw signatures, emails, tokens, and recipient URLs are rejected and never stored in the receipt. |
| ID then digest | Receipt ID is generated first. Digest is SHA-256 of canonical JSON excluding only `receipt_hash_sha256`. |
| Persistence | Exact canonical bytes are written once to the artifact repository (`uploaded_final_pdf_receipt`). Replay/concurrent completion returns the same ID and digest. |
| Draft | Stores `final_receipt_id` / `final_receipt_digest` only. A draft-carried copy never overrides the artifact. |
| Issuance | Only under the per-agreement completion lock, immediately when the required signer set becomes complete. |
| GET | Envelope, receipt, and bundle GET never mint. If fully executed but the artifact is missing or mismatched: honest `receipt_pending` / `receipt_unavailable`. |
| ZIP | `receipt.json` is the exact persisted artifact bytes. |

## GET read-only proof

Demonstrably read-only: after issuance, envelope GET, receipt GET, and bundle GET were run with `_save_draft_sync` and `ArtifactRepository.put_artifact` patched to raise. All three returned 200 and performed no writes.

## Named gate

`scripts/run_phase4c22_quick_receipt_integrity_gate.sh`

1. Backend pytest `test_phase4c22_quick_receipt_integrity.py` — authoritative issuance, identity, GET read-only, tamper, org isolation.
2. Contract vitest: `phase4c22QuickReceiptIntegrityCoverage`, `phase4c21QuickIntegrityCoverage`, `quickPdfEnvelope`.
3. Shared Vite on **4180**. Process-group cleanup on exit.
4. Playwright `frontend/playwright.phase4c22.config.ts` — desktop 1280×800 + mobile 390×844, `--workers=1`, `retries=0`.

Official script: **PASS** — backend **9/9**, contract **5**, Playwright **6/6**.

## Proofs

| Case | Result |
|---|---|
| Issued at final recipient completion | Receipt exists on `vs01-signer-complete` before owner refresh. |
| One receipt | Concurrent/replayed completion returns the same ID and digest. |
| Binding break | Altering PDF hash, packet revision, field manifest, signer set, completion event, or timestamp fails verification. |
| Byte identity | Stored artifact, receipt GET JSON, and ZIP `receipt.json` match. |
| GET writes | Envelope/receipt/bundle GET cause no draft or artifact writes. |
| Missing/tampered artifact | Fail closed (`receipt_pending` / `receipt_unavailable`). |
| Incomplete set | No receipt, no artifact, bundle 409. |
| Wrong org | Receipt and bundle 403. |
| Secrets | No raw token, signature, email, or URL in receipt evidence. |

## Remaining limitations

- One recipient, enforced in UI and backend.
- Email delivery is unavailable.
- Public verify for uploaded PDFs still does not use drafted-agreement `receipt.v1` attestation.
- No live email, Supabase, OAuth, Stripe, or staging claim.

## Verification (required order)

| Step | Result |
|---|---|
| Phase 4C.2.2 named gate | Official script **PASS** — backend **9/9**, Playwright **6/6** |
| Phase 4C.2.1 | Official script **PASS** — **10/10** |
| Phase 4C.1 | Official script **PASS** — **12/12** |
| Phase 4C.2 | Official script **PASS** — **14/14** |
| Phase 4B.4 | **16/16** |
| Phase 4B.2 | Official split **14/14 + 2/2** |
| Batch 5 | **2/2** |
| Phase 1 | **18 files / 100 passed** |
| Phase 2 | **exit 0** (frontend **97 files / 930 passed**; backend ownership/security dots **121**) |
| Relevant backend document / sign / receipt / token / ownership / replay / bundle | **126 passed / 0 failed** including 4C.2.2 (9) and 4C.2 envelope (4) |
| Production build | `tsc -b && vite build` — **✓ built in 10.83s** |
| Complete frontend suite (exactly once) | **9,534 / 9,310 / 224** (JSON reporter only) |

## Comparison with remainder `9,505 / 9,309 / 196`

| Check | Compare-to | This run |
|---|---:|---:|
| Inventory | 9,505 | 9,534 |
| Passed | 9,309 | 9,310 |
| Raw failed assertions | 196 | 224 |

Inventory +29 is prior 4C.1/4C.2/4C.2.1 unit plus this-batch `phase4c22QuickReceiptIntegrityCoverage` (1). That identity passed. Failed +28 / passed +1 versus `9,505 / 9,309 / 196` is leftover remainder class, not a new 4C.2.2 product failure. Versus the prior 4C.2.1 suite (`9,533 / 9,320 / 213`), inventory +1 is the new passing identity; passed −10 / failed +11 is leftover order-dependent remainder. Do **not** establish `9,519`, `9,527`, `9,531`, `9,533`, `9,534`, `210`, `213`, or `224` as a new baseline.

Touched leftover identities still failing (source-window / remainder): `Vs01Wizard.bridge.test.ts`, `recipientSigningPipeline.test.ts`, `paidProTest473474475RecipientInitialsBootstrap.test.ts`. Leftover Vitest cleanup was not begun.

Playwright counts are outside this inventory.

## Terminal cleanup

Cursor terminals were not used as live Vite hosts for this batch. Gate scripts kill their Vite child trees. After preservation and the one JSON suite, ports **4176–4180** were idle and no leftover Vite/Playwright processes from this repo remained. No `pkill node` / `pkill python`.

## Authority contracts preserved

- Phase 4C.2.1 uploaded-PDF authority, placement, owner ceremony, and JTI-only tokens remain.
- `/app/esign/:documentId` remains 4B.4 dual-mode.
- Phase 4B.2 `/agreements/:id/sign` is unchanged.
- Batch 5, Phase 1, Phase 2, backend ownership/security, and production build remain green.
- Drafted-agreement `receipt.v1` is unchanged.
- No launch claim.

## How to re-run

```bash
scripts/run_phase4c22_quick_receipt_integrity_gate.sh
scripts/run_phase4c21_quick_integrity_gate.sh
scripts/run_phase4c1_quick_intake_browser_gate.sh
scripts/run_phase4c2_quick_completion_browser_gate.sh
scripts/run_phase4b4_esign_browser_gate.sh
scripts/run_phase4b2_recipient_signing_browser_gate.sh
(cd frontend && npx playwright test --config playwright.phase4a.config.ts -g "Batch 5" --workers=1 --retries=0)
scripts/run_phase1_access_contract_gate.sh
scripts/run_phase2_paid_journey_release_gate.sh
(cd frontend && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build)
```
