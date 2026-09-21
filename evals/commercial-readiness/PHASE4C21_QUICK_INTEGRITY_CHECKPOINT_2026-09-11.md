# Phase 4C.2.1 checkpoint — Quick uploaded-PDF integrity

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `a64434e7` (`a64434e72819d81d6947d90307c373902a9e299a`) — Phase 4C.2 checkpoint  
Product/backend authority: `0310fc36` (`0310fc365d53605f2c21d554a81b3cb7488630a7`)  
Gate/tests: `1f7ecfe7` (`1f7ecfe72a214c250e63177641880192a2d096db`)  
Nothing was pushed. This is **not** a launch authorization. Admin, live-service testing, leftover Vitest cleanup, and the next sitemap page were not begun.

Phase 4C.2.1 is containment of Phase 4C.2. It replaces Quick PDF shortcuts with an honest uploaded-final-PDF signing authority, real field placement, explicit owner signing, and one durable receipt. It is not a LawDog drafting path and does not claim LawDog reviewed the uploaded paper.

## Production defects confirmed and repaired

The 4C.2 green gate was insufficient. These defects were present at `a64434e7` and are closed here:

| Defect | Repair |
|---|---|
| Padded `LAWDOG_QUICK_PDF_ENVELOPE_V1` stored as `accepted_review_snapshot` / `corpusPlain` | `build_quick_pdf_lock_corpus` removed. Uploaded PDFs never write drafted-paper fields. |
| Packet `authorityMode` was `accepted_review_snapshot`; PDF hash treated as corpus hash | Server-owned `uploaded_final_pdf` authority. Packet validation supports both modes and checks each by its own semantics. |
| UI used `defaultOwnerRecipientFields()` on hardcoded page 1 | Owner places signer, page, and geometry against a real PDF preview. Server validates page/hash/role/org. |
| “Prepare recipient link” also called `ownerCompleteQuickPdf` | Prepare locks and mints only. Owner ceremony is a separate Agree-and-sign step. |
| Raw recipient token / `t=` path persisted on the envelope | Persist JTI/hash and lifecycle only. Raw token returned on mint/reissue. Reissue supersedes the old JTI. |
| Receipt reconstructed on GET | `receipt_service.issue_and_persist_receipt` once, after every required signer completes. Refresh/bundle return the same ID and digest. |
| Dashboard/verify could present snapshot metadata as paper | Surfaces label “Uploaded final PDF signed through LawDog — not a LawDog-drafted agreement” and hide accepted-snapshot rows for this kind. |

## Authority

| Rule | Behavior |
|---|---|
| Authority kind | `uploaded_final_pdf` bound to organization, owner, durable agreement/document IDs, exact PDF SHA-256, length, MIME type, actual page count, packet revision, and signer/field manifest. |
| Drafted-paper isolation | `accepted_review_snapshot` remains exclusively for LawDog-drafted agreements. Bind rejects `corpusPlain` and accepted-snapshot IDs on uploaded PDFs. The PDF hash is never claimed as a synthetic `corpusPlain` hash. |
| Owner mutations | Envelope create/get/fields/prepare/reissue/copy/owner-complete/receipt/bundle use authenticated owner headers. |
| Bind | Owner org, durable document ID, exact PDF SHA-256, byte length, content type, and page count must match. Wrong page/hash/role/org fail closed. |
| Placement | Owner chooses signer, page, and field geometry on the real PDF. No static default-placement happy path. One-recipient MVP is stated and enforced (`max_recipients: 1`). |
| Owner ceremony | Typed signature, affirmative consent, explicit “Agree and sign”, signer identity/role, packet revision, PDF hash, server timestamp, idempotent completion. Missing signature or consent blocks. |
| Prepare | May lock the packet and mint a recipient token. Does not sign for the owner. |
| Token | Raw token is not persisted, not logged, not returned on later GET, and not placed on post-bootstrap URLs. Reissue invalidates the prior JTI. |
| Receipt | Issued once after every required signer completes. Stable `receipt_id` and digest bind exact PDF hash, packet revision, field-manifest digest, required signer set, and durable completion event IDs/timestamps. |
| Bundle | ZIP contains the exact uploaded PDF, the exact persisted receipt, and the validated manifest. |
| Refresh | Same persisted receipt ID and digest. Receipt stays pending until all required signers complete. |

## Named gate

`scripts/run_phase4c21_quick_integrity_gate.sh`

1. Contract vitest: `phase4c21QuickIntegrityCoverage`, `phase4c2QuickCompletionCoverage`, `quickPdfEnvelope`, `esignDocumentAccess`.
2. Shared Vite on **4179**, warmup of `/app/quick` and recipient esign (compile only). Process-group cleanup on exit.
3. Playwright `frontend/playwright.phase4c21.config.ts` — desktop 1280×800 + mobile 390×844, `--workers=1`, `retries=0`.

Official script: **PASS — 10/10** browser proofs (5 desktop + 5 mobile). Fixtures use a real two-page PDF. No static default-placement happy path.

## Browser proof (desktop + mobile)

| Case | Result |
|---|---|
| Integrity contracts | Fail closed if uploaded-PDF authority, page-2 placement, or token-hiding contracts are lost. |
| Place + ceremony | Owner places fields on page 2; prepare does not sign; missing signature/consent blocks. |
| Reissue | Owner reissue invalidates the previous token. |
| Recipient | Fresh browser; old token fails after reissue; recipient signs only assigned fields. |
| Receipt + surfaces | One persisted receipt; refresh keeps the same ID and digest; dashboard/verify never render padded metadata as paper. |

Also proved in backend/fixture coverage: bundle byte-identical PDF and receipt; wrong page/hash/role/org fail closed; no raw token persisted; receipt pending until all required signers complete.

## Remaining limitations

- One recipient only. UI and backend both enforce `max_recipients: 1`.
- Email delivery is unavailable. Manual copy is the honest fallback. Refresh after mint requires reissue to obtain a new raw token.
- Public verify for uploaded PDFs is labeled honestly and does not receive the drafted-agreement “verified” badge (`isPublicVerifyFullyAttested` still requires accepted-snapshot SoT).
- No live email, Supabase session exchange, Google OAuth, Stripe entitlement, or staging-host claim.
- Drawn signatures are accepted by the ceremony contract; this MVP UI is typed-signature plus consent.

## Remaining live-service proof

Live email send, Supabase session exchange, Google OAuth, Stripe entitlement, and staging host configuration remain operator-staging proof and must not be claimed here.

## Verification (required order)

| Step | Result |
|---|---|
| Phase 4C.2.1 named gate | Official script **PASS** — **10/10** Playwright |
| Phase 4C.1 | Official script **PASS** — **12/12** |
| Phase 4C.2 | Official script **PASS** — **14/14** |
| Phase 4B.4 | **16/16** Playwright (`--workers=1`, retries=0) |
| Phase 4B.2 | Official split **14/14 + 2/2** |
| Batch 5 commercial interview | **2/2** |
| Phase 1 | **18 files / 100 passed** |
| Phase 2 | **exit 0** (frontend **97 files / 930 passed**; backend ownership/security dots **121**) |
| Relevant backend document / sign / receipt / token / ownership / replay / bundle | **117 passed / 0 failed** including 4C.2.1 envelope (4), 4C.1 PDF intake, accepted-snapshot authority, safe redirect, VS01 document/content/sign, receipt/bundle, signer-complete, JTI, packet token, layout auth |
| Production build | `tsc -b && vite build` — **✓ built in 8.68s** |
| Complete frontend suite (exactly once) | **9,533 / 9,320 / 213** (JSON reporter only) |

## Comparison with remainder `9,505 / 9,309 / 196`

| Check | Compare-to | This run |
|---|---:|---:|
| Inventory | 9,505 | 9,533 |
| Passed | 9,309 | 9,320 |
| Raw failed assertions | 196 | 213 |

Inventory +28 is prior 4C.1 unit (+22 to 9,527), 4C.2 unit (+4 to 9,531), plus this-batch files (+2 to 9,533): `phase4c21QuickIntegrityCoverage` (1) and one additional `CreatorDashboardAgreementList` case. Those identities passed. Failed +17 / passed +11 versus `9,505 / 9,309 / 196` is leftover remainder class, not a new 4C.2.1 product failure. Versus the prior 4C.2 suite (`9,531 / 9,321 / 210`), inventory +2 are the new passing identities; passed −1 / failed +3 is leftover order-dependent remainder. Do **not** establish `9,519`, `9,527`, `9,531`, `9,533`, `222`, `235`, `210`, or `213` as a new baseline.

Touched leftover identities still failing (source-window / remainder; not 4C.2.1 gate regressions): `Vs01Wizard.bridge.test.ts` (static `sid.startsWith("doc_")` scan), `recipientSigningPipeline.test.ts` (static bootstrap source scan), `paidProTest473474475RecipientInitialsBootstrap.test.ts`. Leftover Vitest cleanup was not begun.

Playwright counts are outside this inventory.

## Terminal cleanup

Cursor `terminals/` was empty at the start of this continuation. Gate scripts kill their Vite child trees. After preservation and the one JSON suite, ports **4176–4179** were idle and no leftover Vite/Playwright/Vitest processes from this repo remained. No `pkill node` / `pkill python`. Unrelated user processes were not touched.

## Authority contracts preserved

- Phase 4C.1 details and aliases are unchanged.
- Phase 4C.2 completion coverage remains green after the ceremony/page-2 fixture update.
- `/app/esign/:documentId` remains 4B.4 dual-mode.
- Phase 4B.2 `/agreements/:id/sign` is unchanged.
- Batch 5 commercial drafting interview is unchanged.
- Phase 1 access and Phase 2 paid-journey gates remain green.
- Backend ownership/security and production build remain green.
- No launch claim.

## How to re-run

```bash
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
