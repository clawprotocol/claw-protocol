# Phase 4B.1 checkpoint — recipient agreement review

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `a142f2cc` (`record phase 4A.1 verified paid-review paper checkpoint`)  
Nothing was pushed. This is **not** a launch authorization. Recipient signing and other Phase 4B pages were not begun.

Phase 4B.1 proves a recipient with a personalized review link can securely read the exact owner-approved agreement, approve it or propose changes, and return after refresh — without a LawDog account and without access to any other agreement or party.

## Runtime-supported entries

Derived from existing builders/parsers (not a second sitemap):

| Form | Builder / parser | Classification that must not be lost |
|---|---|---|
| Primary | `agreementMagicLinkPath()` → `/agreements/:id/review?t=…` | `parseAgreementReviewPath` + `isPublicTokenAgreementSurface` |
| Legacy | `/app/agreements/:id?token=…` (also `?t=`) | `matchAppRoute(…).access === "recipient_token"` |

Both forms keep `role` and `p` (participant-party) when supplied. An empty token must not grant `recipient_token` access. `routeRequiresAuthenticatedSession("recipient_token")` stays false.

Path builders live in `frontend/src/agreement/agreementRecipientReviewPaths.ts` (CSS-free) and are re-exported from `AgreementRecipientReview.tsx` so coverage and Playwright can import them without pulling `joy.css`.

## Named gate

`scripts/run_phase4b1_recipient_review_browser_gate.sh`

1. `frontend/node_modules/.bin/vitest run src/launch/phase4b1RecipientReviewCoverage.test.ts` — **1/1 passed**. Fails closed if either route loses recipient-token classification.
2. Playwright `frontend/playwright.phase4b1.config.ts` — `e2e/phase4b1/**`, retries 0, **workers=2**, Chrome desktop 1280×800 + mobile 390×844, baseURL `http://127.0.0.1:4173`.

**16/16 passed (30.3s).**

## Browser proof (desktop + mobile)

Deterministic API fixtures only. Frozen paper is the Phase 4A SaaS corpus (`PHASE4A_FROZEN_BODY` / SHA). No owner JWT. No live model, Stripe, email, or staging.

| Case | Result |
|---|---|
| Valid primary magic link | Exact accepted paper, title, parties, version, length, corpus hash. No sign-in. No dashboard nav. Token stripped from URL and absent from DOM/console. Recipient header present; no owner JWT / owner-only APIs. 390×844 no horizontal overflow. |
| Valid legacy `?token=` | Same paint and authority meta. |
| Approve once | Submits once, waiting panel persists after reload, replay does not increment. Frozen body unchanged. |
| Propose changes | Compare against frozen original; submit is a proposal only; GET corpus / SHA unchanged after reload. |
| Missing / malformed / expired / revoked / wrong-agreement / wrong-party / wrong-mode | No agreement text. Honest invalid/expired recovery. |
| Token A on agreement B | No paper, no act. |
| Retryable GET 503 | Retry/recovery. No cached paper. |

Recipient paper comes only from the token-authorized server response. Display title/signer metadata do not alter frozen bytes. Session storage is not authorization (validate on every load). Review tokens cannot sign; signing-mode tokens cannot revise.

## Production seams added (smallest cluster)

1. **Authority strip** — `selectRecipientReviewAuthorityMeta` reads version / length / SHA-256 from the token-authorized payload (`accepted_review_snapshot`, optional lock). Display-only `data-testid="recipient-review-authority-meta"`. Version may come from the accepted snapshot so an active signing lock is not required to show hash/length (an active lock would close review actions).
2. **Retryable validate** — 5xx / thrown fetch → `network_retryable` + Try again. Invalid/expired copy unchanged when not retryable.
3. **Failed paper load** — GET/render failure clears draft/html/meta so cached paper cannot leak. `recipient-review-load-retry` recovers.

Do not treat browser/session cache as authorization. Do not fall back to intake, local drafts, filler, another agreement, or Free Starter content.

## Verification (required order)

| Step | Result |
|---|---|
| Named Phase 4B.1 browser gate | **16/16 passed** (30.3s, `--workers=2`, retries=0) |
| Phase 4A leftover `-g "Batch 5\|simple-ready /app/ready"` | **6/6 passed** (22.1s) |
| Phase 4A Batch 5 only | **2/2 passed** (12.1s) |
| Phase 4A sitemap only | **132/132 passed** (3.3m, `--workers=2`) |
| Combined Phase 4A 134 | **134/134 passed** (7.4m, `--workers=1`). Combined `--workers=2` deadlocks Vite on `AgreementBuilderIntake.tsx` (>500KB) when Batch 5 and the sitemap share workers (stuck after desktop enumeration; same class as the default 4-worker deadlock). A contended earlier `--workers=2` run ended **86 passed** after Phase 2 was overlapped — do **not** treat that 86 as a product regression. 4A.1’s 2.1m `--workers=2` 134 is unchanged as product proof; this batch’s quiet-machine combined 134 used `--workers=1` so Batch 5 could finish. |
| Phase 1 access contract | **18 files / 96 passed** |
| Phase 2 paid-journey | **exit 0** (critical backend **121** + frontend **97 files / 921 passed**) |
| Extra backend security | First combined pytest: **144 passed / 1 failed** (`test_workspace_index_uses_subject_ids_not_global_draft_list` — isolation flake). Isolated rerun of that file: **passed**. Recipient read scope, expiry/revocation, JTI fail-closed, party mismatch, and proposal stage/finalize were in the passing set. |
| Production build | `tsc -b && vite build` — **✓ built in 8.86s** |
| Complete frontend suite (exactly once) | **9,489 / 9,301 / 188** (381s) |

## Authority contracts preserved

- Phase 4A paid-owner gate and Phase 1–5 freeze/authority contracts were not weakened.
- No assertion, timeout, retry, or snapshot changes on Phase 4A Batch 5.
- No test-only production authority. Tokens are not rendered.
- Signing (`/agreements/:id/sign`, VS01 recipient-esign) was not started.

## Comparison with official remainder `9,483 / 9,299 / 184`

```bash
cd frontend && ./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/phase4b1/frontend-full.json
```

| Check | Official remainder | This run |
|---|---:|---:|
| Inventory | 9,483 | 9,489 |
| Passed | 9,299 | 9,301 |
| Raw failed assertions | 184 | 188 |
| Failed suites | 317 | 323 |

This batch added **6** focused unit tests (3 authority-meta + 1 route-coverage + 1 role/`p` path + 1 validate retryable). Inventory +6. All 11 tests in the touched unit files passed (0 failures in 4B.1 files). Passed +2 / failed +4 is leftover variance (TEST511, TEST341, `json_parse` / source-window flaps), not this-batch closures and not a 4B.1 product regression. **Do not subtract leftovers from `9,483 / 9,299 / 184`.**

Playwright 16 is outside this inventory.

## How to re-run

```bash
scripts/run_phase4b1_recipient_review_browser_gate.sh
# Combined 134 on a quiet machine. Prefer --workers=1 if Batch 5 and the sitemap
# deadlock Vite; --workers=2 is enough for sitemap-only or leftover 6.
(cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4a.config.ts --workers=1 --reporter=line)
```
