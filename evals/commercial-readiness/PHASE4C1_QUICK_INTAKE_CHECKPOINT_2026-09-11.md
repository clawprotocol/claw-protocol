# Phase 4C.1 checkpoint — Quick intake (draft interview or owned PDF)

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `2edbf7e4` (`2edbf7e45de2984964395a70c7c15d40bfe27074`) — Phase 4B.5.1 checkpoint  
Product repair: `9ef6d375` (`9ef6d3757dd21bebb99db665dd6ed504d62011a7`)  
Gate/tests: `4e2f3404` (`4e2f34040535043e328a05b22f22adad7c4fad13`)  
Nothing was pushed. This is **not** a launch authorization. Phase 4C.2 placement/sending/receipt, admin, and leftover Vitest cleanup were not begun.

Phase 4C.1 makes `/app/quick`, `/app/esign`, and `/app/esign/new` a safe public entry for either LawDog’s canonical clarifying interview or an already-final PDF prepared for e-sign. It does not add a second drafting path inside Quick. Authoritative PDF intake stops at the document-details step (ID, SHA-256, byte length, content type).

Live email delivery, Supabase exchange, Google OAuth, and staging configuration still require operator proof. This gate does not claim those.

## Access and ownership

| Rule | Behavior |
|---|---|
| Public entry | `/app/quick` stays `guest_workflow`. No document bytes, document record, sign session, or paid capability until authenticated server identity and entitlement resolve. |
| Caller `next` | `/app/quick` and `/app/quick?start=pdf` remain rejected by `isAllowlistedInternalPath` / `resolveSafeRedirectPath`. |
| Server continuation | `auth_purpose=quick_pdf_return` may store and restore exactly `/app/quick?start=pdf` (approved attribution `src`/`aff` only). Any other purpose that tries Quick is stripped to `/app`. |
| Signed-out PDF | Sign-in via `/app/sign-in?intent=quick_pdf`. After auth, server dest wins over a forged `next`. |
| Entitlement | Free / expired / unresolved / auth-failure cannot upload. Stale React `claw_tier=paid` cannot grant. Stale `claw_tier=free` cannot block a server-confirmed paid owner. |
| Upload authority | Paid POST `/v1/documents` uses `ownerApiFetch` (authenticated owner headers). Backend stamps the current organization. Another org cannot read, continue, or enumerate. |
| Bytes | Uploaded PDF bytes are preserved exactly. Binding is the returned document ID, size, content type, and SHA-256. Session hint `claw_quick_pdf_document_id_v1` is not authority; refresh restores only from GET of an owner-readable document. |
| Validation | Empty, non-`%PDF`, wrong MIME, and >25 MB fail at or before the server boundary with codes `empty_document` / `document_not_pdf` / `document_too_large`. UI shows sanitized copy only. |
| Submit | File select does not upload. Explicit **Save & continue**. Duplicate click while pending does not create a second document. Network failure keeps an honest retry and never claims the PDF was saved. |
| Typed intake | Hands off once to `/app/create` with the user’s text. Sparse SaaS still asks who the parties are. Complete facts are not re-asked for parties. No `/v1/documents` and no sign session from Quick. |
| Speaking | Enters `/app/create` voice/intake when `mediaDevices.getUserMedia` exists. Otherwise an honest typed fallback. No silent blank page. |
| Aliases | `/app/esign` and `/app/esign/new` canonicalize to `/app/quick?start=pdf` plus approved attribution. Tokens, document IDs, owner-bridge, recipient modes, and unknown query params are stripped. `/app/esign/:documentId` stays Phase 4B.4 dual-mode. |

Customer language: “Draft a new agreement” uses the structured clarifying interview. “Sign an existing PDF” assumes the customer is providing final paper and does not claim LawDog reviewed its legal or commercial sufficiency.

## Named gate

`scripts/run_phase4c1_quick_intake_browser_gate.sh`

1. Contract vitest: `phase4c1QuickIntakeCoverage`, `quickAliasCanonicalize`, `quickIntakeAccess`, `quickPdfUpload`, `safeRedirectResolver`.
2. Shared Vite on **4177**, warmup of `/app/quick` and `/app/create` (compile only).
3. Playwright `frontend/playwright.phase4c1.config.ts` — desktop 1280×800 + mobile 390×844, `--workers=1`, `retries=0`.

Official script: **PASS — 12/12** browser proofs. Fixtures intercept `/api/**`, `/v1/**`, `/health`, `/version`, and `__supabase` only. `page.route("**/*")` is not used.

## Browser proof (desktop + mobile)

| Case | Result |
|---|---|
| Public choice | Draft vs existing-PDF copy is visible. No hidden identifiers. No overflow. |
| Speaking | Microphone unavailable → honest typed fallback. Capture available → `/app/create` voice handoff. |
| Aliases | `/app/esign` and `/app/esign/new` become `/app/quick?start=pdf`; `src` kept; tokens / bridge / recipient / unknown params stripped. |
| Sparse typed SaaS | One handoff to `/app/create`; text preserved; clarifying party question. No document POST. |
| Complete typed intake | Parties/economics/law/scope present; party question is not re-asked. No document POST. |
| Signed-out PDF | Sign-in CTA. After mocked provider session + server continuation, return is `/app/quick?start=pdf` over forged `next`. |
| Free user | Blocked before file control despite stale paid tier. |
| Paid owner | One small PDF, one POST with auth + org headers, details show matching ID / SHA-256 / bytes / type. |
| Invalid / 401 / 403 / network | Sanitized errors. No raw backend codes. Retry after network does not claim saved. Double-click does not create a second document. |
| Refresh | Wrong-org GET clears details. Local/session hint is not authority. |

## Production seams

1. **`resolveServerAuthDestination` / `isApprovedServerQuickPdfReturn`** — server-only Quick PDF return, distinct from caller `next`.
2. **`auth_purpose=quick_pdf_return`** on continuation create; other purposes cannot store Quick.
3. **`decideQuickPdfAccess`** — auth + `fetchCommercialEntitlement` only. Local tier is not an input.
4. **`validate_finalize_upload_bytes`** on `POST /v1/documents`; internal `finalize_document()` still accepts seeded bytes.
5. **`uploadOwnerQuickPdf` / `ownerApiFetch`** — owner headers; bind returned ID/hash/size/type; sanitized errors.
6. **`canonicalizeEsignNewAliasPath`** — aliases only; `/app/esign/:documentId` untouched.
7. **Home anonymous create handoff** — `history.state.clawHeroFromHome` is not consumed on first paint, so StrictMode remount does not drop a legitimate Quick→create handoff.

No test-only product authorization path was added.

## Verification (required order)

| Step | Result |
|---|---|
| Phase 4C.1 named gate | Official script **PASS** — **12/12** Playwright (desktop + mobile) |
| Phase 4B.5.1 auth landing | Official script **PASS** (4 + 2 Playwright; contract unit) |
| Phase 4B.5 auth entry | **13** unit + **14/14** Playwright |
| Phase 4B.4 dual-mode e-sign | **16/16** Playwright (`--workers=1`, retries=0) |
| Phase 4B.2 recipient signing | Official split **14/14 + 2/2** |
| Batch 5 commercial interview | **2/2** (`playwright.phase4a.config.ts -g "Batch 5"`, `--workers=1`, retries=0) |
| Phase 1 | **18 files / 100 passed** |
| Phase 2 | **exit 0** (frontend **97 files / 930 passed**) |
| Backend PDF / ownership / sign-boundary | **37 passed / 0 failed** in 2.642s (`test_phase4c1_document_pdf_intake` 6, `test_safe_redirect` 3, VS01 finalize/content/sign files 28) |
| Production build | `tsc -b && vite build` — **✓ built in 14.39s** |
| Complete frontend suite (exactly once) | **9,527 / 9,305 / 222** (736.50s, JSON reporter). First `--reporter=dot` attempt hung with no new output after ~15 minutes and was killed; that hung run is not a result. |

## Comparison with remainder `9,505 / 9,309 / 196`

| Check | Compare-to | This run |
|---|---:|---:|
| Inventory | 9,505 | 9,527 |
| Passed | 9,309 | 9,305 |
| Raw failed assertions | 196 | 222 |

Inventory +22 is prior 4B.5.1 unit (+14 to 9,519) plus this-batch files (+8 to 9,527): `phase4c1QuickIntakeCoverage` (1), `quickAliasCanonicalize` (2), `quickIntakeAccess` (2), `quickPdfUpload` (3). All touched identities passed in the full suite (`phase4c1QuickIntakeCoverage`, `quickAliasCanonicalize`, `quickIntakeAccess`, `quickPdfUpload`, `safeRedirectResolver` 9, `RequireAuthenticatedDashboard` 14, `homeAnonymousCreateOrigin` 12). Failed +26 / passed −4 is leftover remainder class, not a new 4C.1 product failure. **Do not establish `9,519 / 9,284 / 235` or `9,527 / 9,305 / 222` as a new baseline. Do not subtract leftovers from `9,505 / 9,309 / 196`.** Leftover Vitest cleanup was not begun.

Playwright counts are outside this inventory.

## Remaining Quick work (Phase 4C.2)

Placement, sending, and receipt on the uploaded PDF are **not** started. `/app/quick` stops at document details.

## Remaining live-auth / staging requirement

Live email, Supabase session exchange, Google OAuth, and staging host configuration remain operator-staging proof and must not be claimed here.

## Remaining risks

- Combined Playwright workers > 1 can still hang Vite on `AgreementBuilderIntake.tsx`.
- A default-worker full suite with the dot reporter can stall the machine; use JSON output for the one official inventory run.
- Leftover full-suite Vitest failures remain at the prior remainder class.

## Authority contracts preserved

- Phase 4B.5.1 callback landing and paid-resume paper were not weakened.
- Phase 4B.4 `/app/esign/:documentId` dual-mode is unchanged.
- Phase 4B.2 `/agreements/:id/sign` is unchanged.
- Batch 5 commercial drafting interview is unchanged.
- Phase 1 access and Phase 2 paid-journey gates remain green.
- No launch claim.

## How to re-run

```bash
scripts/run_phase4c1_quick_intake_browser_gate.sh
scripts/run_phase4b51_auth_success_landing_gate.sh
scripts/run_phase4b5_auth_entry_browser_gate.sh
scripts/run_phase4b4_esign_browser_gate.sh
scripts/run_phase4b2_recipient_signing_browser_gate.sh
(cd frontend && npx playwright test --config playwright.phase4a.config.ts -g "Batch 5" --workers=1 --retries=0)
scripts/run_phase1_access_contract_gate.sh
scripts/run_phase2_paid_journey_release_gate.sh
(cd frontend && npm run build)
```
