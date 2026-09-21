# Phase 4B.2 checkpoint — recipient agreement signing

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `09c2ba8d` (`record phase 4B.1 recipient agreement review checkpoint`)  
Nothing was pushed. This is **not** a launch authorization. `/app/esign/:documentId`, public verification, receipts, and other Phase 4B pages were not begun.

Phase 4B.2 proves the intended signer can open a personalized signing link without an account, read the exact locked agreement, complete only their signing ceremony, and produce one durable completion event. No other agreement, signer, or version is exposed or modified.

## Runtime-supported entry

Derived from existing builders/parsers (not a second sitemap):

| Form | Builder / parser | Classification that must not be lost |
|---|---|---|
| Canonical | `agreementSigningPath()` → `/agreements/:id/sign?t=…&p=…` | `parseAgreementSignPath` + `AgreementSignGate` + `AgreementRecipientReview(entry.kind === "sign")` + `isPublicTokenAgreementSurface` |

`routeRequiresAuthenticatedSession("recipient_token")` stays false. A legacy `?v=` link fails closed when `recipient_link_token_required` is enabled. Bare `/agreements/:id/sign` still classifies as the sign surface so session recovery after token strip can remount. `/app/esign/:documentId` must not parse as this path.

Path builders live in `frontend/src/agreement/agreementRecipientSigningPaths.ts` (CSS-free) and are re-exported from `AgreementRecipientReview.tsx` so coverage and Playwright can import them without pulling `joy.css`.

## Named gate

`scripts/run_phase4b2_recipient_signing_browser_gate.sh`

1. `frontend/node_modules/.bin/vitest run src/launch/phase4b2RecipientSigningCoverage.test.ts` — **1/1 passed**. Fails closed if `/agreements/:id/sign` loses public recipient-token treatment.
2. Playwright `frontend/playwright.phase4b2.config.ts` — `e2e/phase4b2/**`, retries 0, **workers=2**, Chrome desktop 1280×800 + mobile 390×844, baseURL `http://127.0.0.1:4173`. Starts its own Vite (`reuseExistingServer: false`).

**16/16 passed (1.5m).**

## Browser proof (desktop + mobile)

Deterministic API fixtures only. Frozen paper is the Phase 4A SaaS corpus (`PHASE4A_FROZEN_BODY` / SHA). No owner JWT. No live model, Stripe, email, or staging.

| Case | Result |
|---|---|
| Valid sign-mode token | Exact locked paper, title, parties, version, length, corpus hash. Intended signer legal entity, name, role/title, and signing action. Other parties visible with read-only fields. No sign-in. No dashboard nav. Token stripped from URL and absent from DOM/console. 390×844 no horizontal overflow. |
| Complete once / reload / replay | POST once with token-bound agreement ID, locked version, participant ID, and signer-role ID. Completed state persists after refresh. Replaying the consumed token does not add another event. |
| Second-signer isolation | URL `p` / `v` / role tampering cannot complete another signer. One completion does not mark the other signer done or fully execute the agreement. |
| Missing / malformed / expired / revoked / superseded / review-mode / wrong-party / wrong-role / missing-lock | No agreement paper. No signing action. Honest invalid/expired recovery. |
| Wrong-version / corpus-hash-mismatch | No paper. No signing action. Foreign corpus text does not leak. |
| Retryable GET failure | Retry/recovery. No cached paper. No local completion. |

Production signing requires a valid sign-mode recipient token. The server-authorized locked version is authoritative over URL or browser state. Frozen operative bytes stay exact; signing adds only the authorized execution metadata/tail. Review tokens cannot sign. Signing tokens cannot review or propose revisions. Client/session caches are never authorization.

## Production seams added (smallest cluster)

1. **Public sign surface** — `isPublicTokenAgreementSurface` treats `/agreements/:id/sign` like `/review`. No login redirect.
2. **`AgreementSignGate`** — validate must be `mode === "sign"` with `locked_version_id`. URL `p` mismatch vs token party fails closed. Token party/version win over URL. Retryable 5xx. `signer_role_id` passed on sign entry. Legacy `?v=` fails closed when token policy is on. Token stripped after validated bootstrap.
3. **Sign-mode paper** — fail closed on missing/mismatched lock or hash. Remount onto the server lock only when the payload has `signing_lock` **or** `entry.kind === "sign"`. Review must not activate a lock from snapshot `locked_version_id` alone (that closed Phase 4B.1 approve/propose).
4. **Signer identity overlay** — `overlayAuthorizedSignerIdentity` copies token-authorized `signerName` / `signerTitle` onto the in-memory sign draft only. Owner `normalizeAgreementDraftFromApi` must not carry those fields: doing so made paid-owner `/app/ready` jump into signature send (`Owner workspace`) and failed Phase 4A leftover 6.
5. **Completion** — POST includes `signer_role_id`. `already_signed` is treated as done. Replay cannot mint a second execution event.

Do not treat browser/session cache as authorization. Do not fall back to intake, local drafts, filler, another agreement, or Free Starter content.

## Verification (required order)

| Step | Result |
|---|---|
| Named Phase 4B.2 browser gate | **16/16 passed** (1.5m, `--workers=2`, retries=0) |
| Phase 4B.1 recipient-review gate | **16/16 passed** (29.0s, `--workers=2`, retries=0) |
| Phase 4A leftover `-g "Batch 5\|simple-ready /app/ready"` | **6/6 passed** (26.6s) after signer-identity overlay (the first combined 134 failed the two paid-owner `/app/ready` cases while signer names rode on owner draft normalize) |
| Combined Phase 4A 134 | **134/134 passed** (2.4m, `--workers=1`). Combined `--workers=2` still deadlocks Vite on `AgreementBuilderIntake.tsx` (>500KB) when Batch 5 and the sitemap share workers. |
| Phase 1 access contract | **18 files / 96 passed** |
| Phase 2 paid-journey | **exit 0** (critical backend **121** + frontend **97 files / 921 passed**) |
| Extra backend security / signing | **181 passed** — `test_agreement_read_scope`, `test_commercial_p0_auth_boundary`, `test_commercial_read_scope_fail_closed`, `test_signing_token_jti_registry_fail_closed`, `test_agreements_api_v2`, `test_vs01_signer_completion`, `test_vs01_signer_complete_api`, `test_auth_identity_enforcement`, `test_accepted_review_snapshot_authority` (frozen signing authority, recipient-token expiry/revocation/replay, JTI, wrong-party/wrong-document, signer completion, fully executed snapshot) |
| Production build | `tsc -b && vite build` — **✓ built in 8.10s** |
| Complete frontend suite (exactly once) | **9,494 / 9,310 / 184** (301s) |

## Authority contracts preserved

- Phase 4A paid-owner gate and Phase 1–5 freeze/authority contracts were not weakened.
- No assertion, timeout, retry, or snapshot changes on Phase 4A Batch 5 or the sitemap.
- No test-only production authority. Tokens are not rendered.
- `/app/esign/:documentId` and public verification were not started.

## Comparison with latest remainder `9,489 / 9,301 / 188`

```bash
cd frontend && ./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/phase4b2/frontend-full.json
```

| Check | Official remainder (4A) | Latest (4B.1) | This run |
|---|---:|---:|---:|
| Inventory | 9,483 | 9,489 | 9,494 |
| Passed | 9,299 | 9,301 | 9,310 |
| Raw failed assertions | 184 | 188 | 184 |
| Failed suites | 317 | 323 | 317 |

This batch added **5** focused unit tests (1 route-coverage + 3 lock/overlay + 1 sign-path parse). Inventory +5 vs `9,489`. All 32 tests in the touched unit files passed (0 failures in 4B.2 files). Passed +9 / failed −4 vs `9,489 / 9,301 / 188` is leftover variance (TEST511, TEST341, `json_parse` / source-window flaps), not this-batch closures and not a 4B.2 product regression. Failed 184 matches the earlier official remainder `9,483 / 9,299 / 184`. **Do not subtract leftovers from either comparator. Do not rebaseline unrelated variance.**

Playwright 16 is outside this inventory.

## How to re-run

```bash
scripts/run_phase4b2_recipient_signing_browser_gate.sh
scripts/run_phase4b1_recipient_review_browser_gate.sh
# Combined 134 on a quiet machine. Prefer --workers=1 if Batch 5 and the sitemap
# deadlock Vite; --workers=2 is enough for sitemap-only or leftover 6.
(cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4a.config.ts --workers=1 --reporter=line)
```
