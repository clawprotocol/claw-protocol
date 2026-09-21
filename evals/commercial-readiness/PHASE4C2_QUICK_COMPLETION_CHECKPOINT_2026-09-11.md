# Phase 4C.2 checkpoint — Quick existing-final-PDF completion

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `8248812b` (`8248812b0ccd94069d22159b17443b73c9b2bc74`) — Phase 4C.1 checkpoint  
Product/backend authority: `c7683a5f` (`c7683a5fbb2d30997ecc98500e5b0ade9a2a09d9`)  
Gate/tests: `074b10a2` (`074b10a2bd1a47ea4cb8b821aab1896f1a5ef1ae`)  
Nothing was pushed. This is **not** a launch authorization. Admin and leftover Vitest cleanup were not begun.

Phase 4C.2 completes `/app/quick` for an already-final uploaded PDF: parties, field placement, recipient delivery, signing, and final receipt. It is not a second LawDog drafting path and does not claim LawDog reviewed the uploaded paper’s legal or commercial sufficiency.

## Did a durable envelope already exist?

**No.** `POST /v1/documents` stamped document ID, SHA-256, bytes, type, and owner org. Quick 4C.1 omitted `agreement_id`. The thin VS01 sign-session/receipt stack is single-signer and is not Phase 4B.4. Agreement VS01 packet/token/signer-complete required a drafted accepted snapshot.

The smallest owner-guarded bridge was added: `POST /api/agreements/quick-pdf-envelope` creates/reuses an agreement, binds `document.agreement_id`, accepts a snapshot whose corpus is a padded `LAWDOG_QUICK_PDF_ENVELOPE_V1` identity record (not drafted paper), writes the signing lock, and persists `quick_pdf_envelope_v1`. Phase 4B.4 packet mint, sign-mode tokens, `/app/esign/:documentId?vs01_recipient_sign=1`, and `POST /api/agreements/{id}/vs01-signer-complete` are reused. This completed 4C.2; it did not stop at 4C.2A.

## Authority

| Rule | Behavior |
|---|---|
| Owner mutations | Envelope create/get/fields/prepare/copy/owner-complete/receipt/bundle and sign-session create/complete use authenticated owner headers (`ownerApiFetch` / commercial owner principal). |
| Bind | Server checks owner org, durable document ID, exact PDF SHA-256, byte length, content type, and signing session/agreement. |
| Not authority | Document ID, receipt ID, browser cache, URL params, and local tier cannot grant access. |
| Envelope | Durable server-owned agreement binding exists before placement completion and before recipient delivery. Document ID is not substituted for agreement ID. |
| Lock | Exact uploaded PDF hash is locked before the first signature. After lock, bytes, page count, and operative PDF content are immutable. Hash mismatch is 409 on fields, prepare, send, sign, and receipt. |
| Parties | Valid owner and recipient names/emails required. Placeholders (`Owner`, `you@email.com`, etc.) are rejected. Each signer has a server party ID and role (`qs_owner`, `qs_recipient`). |
| Fields | Bound to page, signer role, type, and geometry. Both required signatures must exist; off-page, malformed, overlapping, and unassigned required fields fail. |
| Refresh | Valid owner document hint restores the binding from GET. Envelope GET restores parties/placement/delivery/receipt from the server. |
| Idempotency | Duplicate create/prepare/owner-complete/recipient-complete do not mint extra agreements, packets, invites, signatures, or receipts. |

## Recipient delivery

- Browser-authorized links with names, emails, manifests, or portable paper in query params are not used.
- Server mints a sign-mode token bound to agreement, document, locked hash, packet revision, signer role, participant, expiry, and replay/JTI.
- Recipient opens Phase 4B.4 `/app/esign/:documentId?vs01_recipient_sign=1` (plus document/agreement/role/index). Token is stripped after bootstrap and is not shown in owner copy.
- Missing, malformed, expired, revoked, replayed, wrong-document, wrong-party, review-mode, and cross-org tokens fail closed without paper or signer disclosure.
- Delivery states: **link prepared**, **copied manually**, **email unavailable**. This gate never claims an email was sent. Manual copy is the honest fallback. Live email is not configured here.

## Receipt semantics

- Owner-only signature is recorded as “your signature is recorded” — **not** fully executed / verified.
- Fully executed requires both required signer roles and matching server provenance.
- Recipient completion is one-time and attributed to `qs_recipient` + persisted participant ID.
- Final receipt binds original PDF hash, locked packet revision, field manifest, required signer set, completion events, and server timestamps.
- Owner refresh recovers the same receipt. Cross-org receipt and bundle are 403.
- Hash/provenance mismatch removes verified presentation (409 `receipt_hash_mismatch`).
- Verification ZIP contains the exact uploaded PDF bytes plus receipt JSON, and only after full execution.

## Named gate

`scripts/run_phase4c2_quick_completion_browser_gate.sh`

1. Contract vitest: `phase4c2QuickCompletionCoverage`, `quickPdfEnvelope`, `esignDocumentAccess`.
2. Shared Vite on **4178**, warmup of `/app/quick` and recipient esign (compile only). Process-group cleanup on exit.
3. Playwright `frontend/playwright.phase4c2.config.ts` — desktop 1280×800 + mobile 390×844, `--workers=1`, `retries=0`.

Official script: **PASS — 14/14** browser proofs. Fixtures intercept `/api/**`, `/v1/**`, `/health`, `/version`, and `__supabase` only.

## Browser proof (desktop + mobile)

| Case | Result |
|---|---|
| Resume 4C.1 details | Hint restore shows ID / SHA-256 / bytes / type; Continue opens completion. |
| Party validation | Placeholders rejected; valid parties create one envelope. |
| Placement | Owner + recipient signature fields saved; lock after prepare. |
| Owner sign | Owner-only receipt; not fully executed. Email unavailable. Token hidden. |
| Recipient 4B.4 | New browser, token stripped, locked PDF object, only recipient fields editable, one-time complete. |
| Owner after both | Fully executed + verification bundle GET. Refresh recovers receipt. |
| Fail closed | Network, hash 409, wrong org 403, revoked token, bare/wrong document. No overflow. |

## Delivery limitations

Email delivery is **unavailable** on this path. The UI says so. Copy-link is the fallback. No live email, Supabase exchange, Google OAuth, Stripe, or staging claim.

## Remaining live-service proof

Live email send, Supabase session exchange, Google OAuth, Stripe entitlement, and staging host configuration remain operator-staging proof and must not be claimed here.

## Verification (required order)

| Step | Result |
|---|---|
| Phase 4C.2 named gate | Official script **PASS** — **14/14** Playwright |
| Phase 4C.1 | Official script **PASS** — **12/12** |
| Phase 4B.5.1 | Official script **PASS** (4 + 2 Playwright; contract unit) |
| Phase 4B.4 | **16/16** Playwright (`--workers=1`, retries=0) |
| Phase 4B.2 | Official split **14/14 + 2/2** |
| Batch 5 commercial interview | **2/2** |
| Phase 1 | **18 files / 100 passed** |
| Phase 2 | **exit 0** (frontend **97 files / 930 passed**; backend ownership/security dots **121**) |
| Relevant backend document / sign / receipt / token / ownership / replay / bundle | **95 passed / 0 failed** including 4C.2 envelope (4), 4C.1 PDF intake, safe redirect, VS01 document/content/sign, receipt/bundle, signer-complete, JTI, packet token, layout auth |
| Production build | `tsc -b && vite build` — **✓ built in 10.39s** |
| Complete frontend suite (exactly once) | **9,531 / 9,321 / 210** (JSON reporter only) |

## Comparison with remainder `9,505 / 9,309 / 196`

| Check | Compare-to | This run |
|---|---:|---:|
| Inventory | 9,505 | 9,531 |
| Passed | 9,309 | 9,321 |
| Raw failed assertions | 196 | 210 |

Inventory +26 is prior 4C.1 unit (+22 to 9,527) plus this-batch files (+4 to 9,531): `phase4c2QuickCompletionCoverage` (1), `quickPdfEnvelope` (3). Those identities passed. Failed +14 / passed +12 versus `9,505 / 9,309 / 196` is leftover remainder class, not a new 4C.2 product failure. Do **not** establish `9,519`, `9,527`, `9,531`, `222`, `235`, or `210` as a new baseline.

Touched leftover identities still failing (source-window / remainder; not 4C.2 gate regressions): `Vs01Wizard.bridge.test.ts` (static `sid.startsWith("doc_")` scan), `recipientSigningPipeline.test.ts` (static bootstrap source scan), `paidProTest473474475RecipientInitialsBootstrap.test.ts`. Leftover Vitest cleanup was not begun.

Playwright counts are outside this inventory.

## Terminal cleanup

Cursor `terminals/` was empty at start. Seven orphaned Vite/npm groups from prior gates (PPID=1, cwd this repo) were inspected and TERM’d before work. After preservation, orphaned 4B.5.1 Vite remained: npm **95394** (PPID=1, `npm run dev --host 127.0.0.1 --port 4176`), vite **95411**, esbuild **95412**, cwd `lawdog-repo/frontend`. Those three were TERM’d after confirming command/PID/cwd. No `pkill node` / `pkill python`. Unrelated user processes were not touched. Gate scripts now kill their Vite child trees.

## Authority contracts preserved

- Phase 4C.1 details and aliases are unchanged; `/app/esign/:documentId` remains 4B.4 dual-mode.
- Phase 4B.5.1 callback landing and paid-resume paper were not weakened.
- Phase 4B.2 `/agreements/:id/sign` is unchanged.
- Batch 5 commercial drafting interview is unchanged.
- Phase 1 access and Phase 2 paid-journey gates remain green.
- No launch claim.

## How to re-run

```bash
scripts/run_phase4c2_quick_completion_browser_gate.sh
scripts/run_phase4c1_quick_intake_browser_gate.sh
scripts/run_phase4b51_auth_success_landing_gate.sh
scripts/run_phase4b4_esign_browser_gate.sh
scripts/run_phase4b2_recipient_signing_browser_gate.sh
(cd frontend && npx playwright test --config playwright.phase4a.config.ts -g "Batch 5" --workers=1 --retries=0)
scripts/run_phase1_access_contract_gate.sh
scripts/run_phase2_paid_journey_release_gate.sh
(cd frontend && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build)
```
