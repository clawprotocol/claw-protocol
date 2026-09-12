# Phase 4C.2.3 checkpoint — shared recipient-completion truth

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `1d2e6363` (`1d2e6363856f2984d4e5734ea607effd2d335f03`) — Phase 4C.2.2 checkpoint  
Product/backend authority: `b26fde25` (`b26fde25fbde8ea98b615497c0881068b36ad554`)  
Gate/tests: `1fc3f0e8` (`1fc3f0e82369fa67dfd5aba8002571569ac9e2f1`)  
Nothing was pushed. This is **not** a launch authorization. Billing, Settings, admin, live-service testing, leftover Vitest cleanup, and the next sitemap page were not begun.

Phase 4C.2.3 repairs the shared commercial signing path used by Quick and LawDog-drafted agreements. Success is server-confirmed completion, not a local “You’re all set.” flag.

## Production gaps confirmed and repaired

| Gap at `1d2e6363` | Repair |
|---|---|
| `Vs01Wizard` set `recipientSigningFinished=true` before `recordVs01SignerCompletion` received server confirmation. A 403/409/503/network failure could show success. | The UI enters a submitting state. Success paints only when the server confirms the exact agreement, document, packet revision, signer role, participant, and completion (`result.serverSynced`). |
| `uploaded_final_pdf_receipt.signature_artifacts_from_env` hashed recipient completion-event metadata and used a constant `recipient_completion` consent marker. | Receipt artifacts are built from persisted `signature_artifact_digest` and `consent_artifact_digest` on the `signature_completed` event. Missing digests fail closed. |
| `Vs01SignerCompleteBody.signed_at` could become authoritative event time. | Authoritative `signed_at` is always `_utc_now_iso()`. Caller dates may be kept only as non-authoritative display dates and never enter receipt evidence. |
| `vs01_signer_complete_lock` is process-local. | Completion and receipt issuance use a SQLite ledger (`UNIQUE` on signer identity and on `agreement_id` for receipts) with `BEGIN IMMEDIATE`. The Python `RLock` is not the uniqueness guarantee. |

## Server-confirmed UI

| Surface | Behavior |
|---|---|
| `/app/esign` (`RecipientSigningView` + `Vs01Wizard`) | Assigned fields stay local while submitting. “Agree and sign” is disabled until fields and the consent checkbox are complete. Success / local signed state is written only after `res.ok`. |
| `/agreements/:id/sign` (`AgreementRecipientReview`) | Same consent + “Agree and sign” contract. Ceremony complete sends versioned consent and assigned fields. |
| Network / 503 | Fields are preserved. Copy offers retry (`try Agree and sign again`). No local signed stamp. |
| Expired / revoked / wrong-party | Fail closed. Signer is told to request a new link. No local signed stamp. |
| Refresh | Packet GET may return `signer_already_completed`. The wizard restores server-confirmed success from that flag, not from local packet status. |

## Evidence binding

Consent statement (frontend and backend must match):

`I agree to use an electronic signature. By selecting Agree and sign, I adopt the completed assigned signature fields as my electronic signature and affirm my intent to be bound.`

| Rule | Behavior |
|---|---|
| Contract | One typed body: assigned fields + versioned consent (`lawdog_esign_consent.v1`, action `agree_and_sign`). |
| Validation | Every field must belong to the token-bound signer and the locked packet. Missing consent, empty signature, or another signer’s field fails closed. |
| Digests | Signature-artifact digest is SHA-256 of canonical validated field evidence (field id/type/page + value hash). Consent-artifact digest is SHA-256 of the versioned intent statement and accepted action. |
| Privacy | Raw signature values live only in private `vs01_signer_execution_v1`. Recipient projection strips that record. Receipts and logs contain hashes, never raw signatures, tokens, emails, or URLs. |
| Audit | `signature_completed` carries server `signed_at`, both digests, signer role, participant, document hash, and packet revision. |
| Receipt | Uploaded-PDF receipt reads those persisted event digests. Changing the actual signature changes the artifact digest. |
| Replay | Exact evidence is idempotent (`already_signed`). Different evidence after completion is `409 completion_evidence_mismatch`. |
| API | Completion returns structured `completion` plus `receipt_status` / receipt pointer. Final-signer response supplies the stable receipt ID/digest before owner refresh. |

## Concurrency — genuinely cross-process when the ledger path is shared

| Condition | Safety |
|---|---|
| Workers share `CLAW_DATA_DIR` or `CLAW_VS01_COMPLETION_LEDGER_PATH` | **Cross-process safe.** SQLite `UNIQUE` + `BEGIN IMMEDIATE` is the authority. Proven with the process `RLock` stubbed out, and with two spawned TestClient processes against the same data dir producing one receipt. |
| Ledger path unset | **Not** multi-worker production-ready. The API logs `vs01_completion_ledger_unconfigured` and must not be deployed across workers. Do not claim the Python `RLock` is durable uniqueness. |
| Independent unsynchronized disks | **Not** safe. |

Revoked or superseded tokens that never completed still fail closed (`403`). `allow_completed_signer_replay` applies only after this participant already has a completion event or ledger row.

## Named gate

`scripts/run_phase4c23_recipient_completion_truth_gate.sh`

1. Backend pytest `test_phase4c23_recipient_completion_truth.py` — forged `signed_at`, fail-closed evidence, digest change, exact replay, receipt identity, two-context race, private execution / no secrets.
2. Contract vitest: `phase4c23RecipientCompletionTruthCoverage`, `phase4c22QuickReceiptIntegrityCoverage`, `vs01SignerCompletionSync`.
3. Shared Vite on **4181**. Process-group cleanup on exit.
4. Playwright `frontend/playwright.phase4c23.config.ts` — desktop 1280×800 + mobile 390×844, `--workers=1`, `retries=0`.

Official script: **PASS** — backend **7/7**, contract **9**, Playwright **6/6**.

## Proofs

| Case | Result |
|---|---|
| Rejected or unreachable complete | No success UI, no local signed state. |
| Retry after 503 | One completion event. |
| Forged `signed_at` | Ignored; server timestamp is authoritative. |
| Missing consent / signature / foreign field | Fail closed. |
| Different signature | Different artifact digest. |
| Receipt | Matches persisted signature and consent digests. |
| Exact replay | Idempotent. Different evidence → 409. |
| Final signer | Stable receipt ID/digest on the completion response. |
| Two independent server/repository contexts | One durable receipt. |
| Refresh | Restores server-confirmed success. |
| Secrets | No raw signature, token, email, or URL in the receipt or logs. |

## Remaining limitations

- Email delivery is still unavailable / non-authoritative.
- Public verify for uploaded PDFs still does not use drafted-agreement `receipt.v1` attestation.
- Multi-worker production requires a shared ledger path. Unconfigured `CLAW_DATA_DIR` / `CLAW_VS01_COMPLETION_LEDGER_PATH` fails that readiness claim.
- No live email, Supabase, OAuth, Stripe, or staging claim.

## Verification (required order)

| Step | Result |
|---|---|
| Phase 4C.2.3 named gate | Official script **PASS** — backend **7/7**, Playwright **6/6** |
| Phase 4C.2.2 | Official script **PASS** — backend **9/9**, Playwright **6/6** |
| Phase 4C.2.1 | Official script **PASS** — **10/10** |
| Phase 4C.1 | Official script **PASS** — **12/12** |
| Phase 4C.2 | Official script **PASS** — **14/14** |
| Phase 4B.4 | **16/16** |
| Phase 4B.2 | Official split **14/14 + 2/2** (consent required before enable) |
| Batch 5 | **2/2** |
| Phase 1 | **18 files / 100 passed** |
| Phase 2 | **exit 0** (frontend **97 files / 931 passed**; backend ownership/security dots **121**) |
| Relevant backend document / sign / receipt / token / ownership / replay / bundle | **237 passed / 0 failed** including 4C.2.3 (7), 4C.2.2 (9), 4C.2 envelope, accepted-snapshot authority, JTI, packet token, layout auth, P0 complete/replay |
| Production build | `tsc -b && vite build` — **✓ built in 9.95s** |
| Complete frontend suite (exactly once) | **9,536 / 9,338 / 198** (JSON reporter only) |

## Comparison with remainder `9,505 / 9,309 / 196`

| Check | Compare-to | This run |
|---|---:|---:|
| Inventory | 9,505 | 9,536 |
| Passed | 9,309 | 9,338 |
| Raw failed assertions | 196 | 198 |

Inventory +31 is prior 4C.1/4C.2/4C.2.1/4C.2.2 unit plus this-batch `phase4c23RecipientCompletionTruthCoverage` (1) and the strengthened `vs01SignerCompletionSync` rejection case (1). Those identities passed. Failed +2 / passed +29 versus `9,505 / 9,309 / 196` is leftover remainder class, not a new 4C.2.3 product failure. Versus the prior 4C.2.2 suite (`9,534 / 9,310 / 224`), inventory +2 are the new passing identities; passed +28 / failed −26 is leftover order-dependent remainder. Do **not** establish `9,519`, `9,534`, `9,536`, `210`, `224`, or `198` as a new baseline.

Touched leftover identities still failing (source-window / remainder): `Vs01Wizard.bridge.test.ts`, `recipientSigningPipeline.test.ts`, `paidProTest473474475RecipientInitialsBootstrap.test.ts`. Leftover Vitest cleanup was not begun.

Playwright counts are outside this inventory.

## Terminal cleanup

Gate scripts kill their Vite child trees. After preservation and the one JSON suite, ports **4176–4181** were intended idle and leftover Vite/Playwright processes from this repo were not left running as live hosts. No `pkill node` / `pkill python`.

## Authority contracts preserved

- Phase 4C.2.2 uploaded-PDF receipt issuance, GET read-only, and artifact identity remain.
- Phase 4C.2.1 uploaded-PDF authority, placement, owner ceremony, and JTI-only tokens remain.
- `/app/esign/:documentId` remains 4B.4 dual-mode, now with server-confirmed completion.
- Phase 4B.2 `/agreements/:id/sign` still requires a public recipient token and now requires affirmative consent before enable.
- Batch 5, Phase 1, Phase 2, backend ownership/security, and production build remain green.
- Drafted-agreement `receipt.v1` hashing is unchanged.
- No launch claim.

## How to re-run

```bash
scripts/run_phase4c23_recipient_completion_truth_gate.sh
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
