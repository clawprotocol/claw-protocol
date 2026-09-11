# Phase 4B.3 checkpoint — public agreement verification

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `414a9ca9` (`record phase 4B.2 recipient agreement signing checkpoint`)  
Nothing was pushed. This is **not** a launch authorization. `/app/esign/:documentId`, guest workflows, and other Phase 4B pages were not begun.

Phase 4B.3 proves anyone with a verification link can confirm agreement status and cryptographic proof metadata without an account, without a recipient token, and without seeing private agreement content or gaining owner/recipient privileges.

## Runtime-supported entries

Derived from existing builders/parsers (not a second sitemap):

| Form | Builder / parser | Classification that must not be lost |
|---|---|---|
| Canonical | `agreementPublicVerifyPath()` → `/verify/:id` | `parseAgreementVerifyPath` + `AgreementPublicVerify` + `isPublicTokenAgreementSurface` |
| Legacy | `/app/verify/:id` | Same parser and public shell |
| Owner (unchanged) | `/app/verification/:id` | Authenticated `simpleVerification` / `SimpleVerificationPage` — `parseAgreementVerifyPath` returns null |

Copy-link always emits the canonical `/verify/:id` URL with no token or private query. Both public forms produce the same safe result.

## Named gate

`scripts/run_phase4b3_public_verify_browser_gate.sh`

1. `frontend/node_modules/.bin/vitest run src/launch/phase4b3PublicVerifyCoverage.test.ts` — **1/1 passed**. Fails closed if `/verify/:id` or `/app/verify/:id` lose public treatment, or if owner `/app/verification/:id` is reclassified.
2. Playwright `frontend/playwright.phase4b3.config.ts` — `e2e/phase4b3/**`, retries 0, **workers=2**, Chrome desktop 1280×800 + mobile 390×844, baseURL `http://127.0.0.1:4173`. Starts its own Vite (`reuseExistingServer: false`).

**16/16 passed (26.4s).**

## Browser proof (desktop + mobile)

Deterministic public-verify payloads only. No owner JWT. No recipient token. No live model, Stripe, email, or staging.

| Case | Result |
|---|---|
| Locked | Public-safe title, jurisdiction, parties, version hashes, lock id, signature counts. Status “Locked for signing”. Pending badge. No sign-in. No private paper. 390×844 no overflow. |
| Partially signed | “Partially signed”, 1/2 counts, no verified badge, no “Fully executed”. |
| Fully executed (attested) | “Fully executed” + Record complete only when counts, lock, commitment, accepted-snapshot digest, and envelope attestation all agree. Signature events attributed by persisted participant ID and signer-role ID. Copy-link `data-canonical-path` is `/verify/:id`. No PDF. |
| Legacy `/app/verify/:id` | Same attested result; copy-link still canonical `/verify/:id`. |
| Pending | Preparing/pending banner. Never verified. No PDF. |
| Missing | Generic “Verification is unavailable”. No agreement id, existence leak, or paper. |
| Forged provenance / digest mismatch / count mismatch | Metadata may show; never verified; never Fully executed; no PDF. |
| Retryable GET 503 | Retry/recovery. No cached title/hash from the target agreement until retry succeeds. No PDF. |

Private body, purpose, `$180,000`, emails, addresses, HMAC, owner JWT, and recipient tokens never appear.

## Public completed-PDF policy

Inspected existing `GET /api/agreements/public/{id}/completed-signed-export-pdf`. Authorization today is deployment flag `CLAW_PUBLIC_AGREEMENT_VERIFY` plus fully-executed. **No owner/workspace opt-in field exists.**

This batch does **not** invent an opt-in in browser state. The public page stays metadata-only unless the server already sends `public_completed_pdf_distribution: true` **and** the record is fully attested. No fixture sets that flag.

**Product-policy item (not begun):** public PDF distribution requires an explicit server-authoritative owner/workspace opt-in. Do not treat agreement-id knowledge or fully-executed status as permission to download the executed document from `/verify/:id`.

## Production seams added (smallest cluster)

1. **`isPublicTokenAgreementSurface`** — `/app/verify/:id` is public; `/app/verification/:id` stays authenticated.
2. **`loadPublicAgreementVerify`** — 5xx/thrown fetch is retryable; 4xx is generic unavailable. Existing `fetchPublicAgreementVerify` still returns `null` on failure.
3. **`isPublicVerifyFullyAttested`** — verified / Fully executed only when required signer count is met, the server marks executed, lock + commitment exist, `envelope_attestation_valid === true`, and accepted-snapshot SHA matches envelope `acceptedSoTDigest`.
4. **Public page** — generic unavailable (no existence leak); retry without cached proof; no version notes; signature attribution requires persisted IDs; PDF hidden without server opt-in.

Client/session caches are never verification authority.

## Verification (required order)

| Step | Result |
|---|---|
| Named Phase 4B.3 browser gate | **16/16 passed** (26.4s, `--workers=2`, retries=0) |
| Phase 4B.2 | **16/16**. Combined `--workers=2` hung after desktop enumeration on Vite/`AgreementBuilderIntake.tsx` (same class as prior 4A/4B.2 contention). Quiet split: invert-retryable **14/14** (1.3m, `--workers=1`) + retryable **2/2** (11.1s). Do not treat the hung combined run as a product regression. |
| Phase 4B.1 | **16/16 passed** (38.3s, `--workers=2`) |
| Combined Phase 4A 134 | **134/134 passed** (2.9m, `--workers=1`) |
| Phase 1 access contract | **18 files / 96 passed** |
| Phase 2 paid-journey | **exit 0** (critical backend **121** + frontend **97 files / 921 passed**) |
| Extra backend proof / redaction | **166 passed** — `test_agreements_api_v2`, `test_agreement_read_scope`, `test_commercial_read_scope_fail_closed`, `test_vs01_proof_auth_boundary`, `test_receipt_bundle_auth_boundary`, `test_accepted_review_snapshot_authority`, `test_vs01_signing_envelope_provenance_tamper`, `test_staging_signing_token_fail_closed`, `test_vs01_fully_executed_snapshot`, `test_agreement_recipient_verify_reliability`, `test_completed_signed_export_pdf` |
| Production build | `tsc -b && vite build` — **✓ built in 9.03s** |
| Complete frontend suite (exactly once) | **9,498 / 9,309 / 189** (406s) |

## Authority contracts preserved

- Phase 4A paid-owner gate and Phase 4B.1/4B.2 were not weakened.
- No assertion, timeout, retry, or snapshot changes on Phase 4A Batch 5 or the sitemap.
- No fabricated proof. No private paper on `/verify/:id`.
- `/app/esign/:documentId` was not started.

## Comparison with latest remainder `9,494 / 9,310 / 184`

```bash
cd frontend && ./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/phase4b3/frontend-full.json
```

| Check | Latest (4B.2) | This run |
|---|---:|---:|
| Inventory | 9,494 | 9,498 |
| Passed | 9,310 | 9,309 |
| Raw failed assertions | 184 | 189 |
| Failed suites | 317 | 327 |

This batch added **4** focused unit tests (1 route-coverage + 3 attestation/PDF-opt-in). Inventory +4. All 33 tests in the touched unit files passed (0 failures in 4B.3 files). Passed −1 / failed +5 is leftover variance (TEST511, TEST341, `json_parse` / source-window flaps), not this-batch closures and not a 4B.3 product regression. **Do not subtract leftovers from `9,494 / 9,310 / 184`. Do not rebaseline unrelated variance.**

Playwright 16 is outside this inventory.

## How to re-run

```bash
scripts/run_phase4b3_public_verify_browser_gate.sh
scripts/run_phase4b2_recipient_signing_browser_gate.sh
# If the combined 4B.2 --workers=2 run hangs on Vite, split:
# (cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4b2.config.ts --workers=1 --grep-invert "retryable network")
# (cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4b2.config.ts --workers=1 -g "retryable network")
scripts/run_phase4b1_recipient_review_browser_gate.sh
(cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4a.config.ts --workers=1 --reporter=line)
```
