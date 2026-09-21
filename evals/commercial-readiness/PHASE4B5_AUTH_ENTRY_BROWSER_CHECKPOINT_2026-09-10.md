# Phase 4B.5 checkpoint — authenticated customer entry

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `28f11941` (`28f11941516648fd9d2543707304a9f72f8dcc53`) — Phase 4B.4 checkpoint  
Product repair: `785c5080`  
Gate/tests: `4d94e39f`  
Nothing was pushed. This is **not** a launch authorization. `/app/quick`, admin, and leftover Vitest cleanup were not begun.

Phase 4B.5 proves `/app/sign-in` and `/app/auth/callback` can return a paid customer to a server-authorized `user-*` workspace and a safe LawDog destination. Browser/session state may assist recovery. It cannot grant ownership, entitlement, or agreement access.

Live email delivery, Supabase, Google OAuth, and staging configuration still require operator proof. This gate does not claim those.

## Routes covered

| Route | Classification | Proof |
|---|---|---|
| `/app/sign-in` | public | Email single-submit, generic success, sanitized failure, signed-in post-render redirect, recipient-token strip, production hide of staging controls |
| `/app/auth/callback` | public | Server continuation over forged `next`, sensitive query strip, fail-closed expired continuation, retry / dashboard / back, no infinite “Restoring your workspace” |

## Security invariants

1. Server-backed auth continuation is authority. Local/session state cannot grant paid access.
2. Magic-link and Google share the same continuation / finalize / bind path.
3. A new tab without session storage still talks to server continuation (mocked finalize + owner bind in the gate).
4. Finalize / claim / migration is idempotent for the same continuation (server + `completedRef` + consume-once fixture).
5. Authenticated users bind only to a server-authorized `user-*` workspace. Route, UI tier, query, and local state are not entitlement.
6. Server `destinationPath` wins over caller `next`. `next` is a fallback only when no valid continuation exists.
7. Prefix allowlists (`ALLOWED_PREFIXES`, `startsWith(prefix)`) are gone. Exact router-aware validation rejects `/app.evil`, `/app/evil`, `/reviewevil`, `/signature`, absolute/protocol-relative URLs, encoded/backslash variants, control characters, and `javascript:`.
8. Valid destinations preserved: dashboard (canonical `/app`), create + `agreementId`, create + `restore=starterReview`, checkout, send + `phase=send`, done, settings, billing. Recipient tokens and private paper never ride sign-in URLs.
9. Email submit is single-submit and enumeration-safe. Generic success. Provider/network/rate-limit copy is sanitized.
10. Expired, consumed, missing, wrong-user, wrong-org, or tampered continuation fails closed. Retry → `/app/sign-in`. Dashboard → `/app`. Back stays unavailable.
11. `code`, `continuation_id`, and token query keys are stripped after consumption and are not logged or sent to analytics.
12. Signed-in `/app/sign-in` redirects in `useEffect`, not during render.
13. Staging/direct-login controls stay hidden on public production hostnames.
14. Desktop 1280×800 and mobile 390×844 are in the named gate (`--workers=2`, `retries=0`).
15. Phase 1–4B.4 access, frozen-document, drafting-interview, signing, and verification contracts were not rewritten.

## Named gate

`scripts/run_phase4b5_auth_entry_browser_gate.sh`

1. Vitest `phase4b5AuthEntryCoverage.test.ts` + `AuthCallbackPage.test.tsx` + `safeRedirectResolver.test.ts` — **3 files / 12 passed**.
2. Playwright `frontend/playwright.phase4b5.config.ts` — `e2e/phase4b5/**`, retries 0, **workers=2**, Chrome desktop 1280×800 + mobile 390×844, baseURL `http://127.0.0.1:4175`. Starts its own Vite (`reuseExistingServer: false`). Fixtures intercept `/api/**`, `/v1/**`, `/health`, `/version`, and `/__supabase/**` only — not the Vite module graph.

**14/14 passed (29.5s)** on the final named-gate run after redirect-key and dashboard-canonicalize repairs.

Does **not** prove live email, Supabase, Google OAuth, or staging.

## Remainder cluster (not claimed green in Playwright)

Callback **success landing** on the server destination (for example `/app/done/:agreementId` or `/app/create?agreementId=`) is proven in unit tests (`resolveAuthCallbackDestination`, `AuthCallbackPage.test.tsx`). The Playwright e2e session + Vite + Supabase hydrate path did not reliably navigate off `/app/auth/callback` after a 200 finalize. Per the smallest-shared-cluster rule, that second cluster was not chased into `/app/create` (known `AgreementBuilderIntake.tsx` deadlock under workers=2).

The browser gate still proves: loading ends, no infinite restore, forged `next` is not followed, codes/continuation IDs are stripped, expired continuation is unavailable, retry/back/dashboard recover safely, and foreign paper never renders.

## Production seams

1. **`safeRedirectResolver` / `backend/security/safe_redirect.py`** — router-aware allowlist; server dest wins; `/dashboard` canonicalizes to `/app`; `restore` and `phase` kept for checkout/send returns.
2. **`SignInPage`** — post-render signed-in redirect; single-submit; generic copy; visible-URL sanitize; staging hidden on public production hostnames.
3. **`AuthCallbackPage`** — strip sensitive query first; wait for session; fail closed; `completedRef` idempotency; bind after success cannot undo finalize.
4. **`authUserFacingCopy`** — never returns raw provider/`err.message` copy.
5. **`AuthProvider` / `resolveBrowserAuthSession`** — DEV e2e session is not clobbered by a null Supabase `onAuthStateChange`.
6. **Continuation API / workspace auth logs** — no `continuation_id` in diagnostics.

## Verification (required order)

| Step | Result |
|---|---|
| Named Phase 4B.5 browser gate | **14/14 passed** (29.5s, `--workers=2`, retries=0) + coverage/unit **12/12** |
| Additional this-batch unit | `SignInPage` + `gtmAnonymousStarterUpgradePath` + `authCallbackFinalizeDedup` / continuation — **0 failures** |
| Relevant backend continuation / claim / bind / safe-return | `test_safe_redirect`, `test_j7_auth_claim_authority`, `test_anonymous_draft_claim`, `test_auth_security_hardening`, `test_workspace_bind_subscription_migration`, `test_auth_identity_enforcement`, `test_staging_auth_magic_link`, `test_checkout_app_origin`, `test_genesis_referral_api` — **passed** after allowing `restore` and `phase` |
| Phase 4B.4 | **16/16 passed** (35.0s, `--workers=2`) |
| Phase 4B.3 | **16/16 passed** (24.7s, `--workers=2`) |
| Phase 4B.2 | **16/16**. Named combined `--workers=2` was not re-run (known Vite hang). Quiet split: invert-retryable **14/14** (`--workers=1`) + retryable **2/2** (10.2s) |
| Phase 4B.1 | **16/16 passed** (54.0s, `--workers=2`) |
| Combined Phase 4A 134 | Default workers=4 hung on retryable workspace-index (same Vite/`AgreementBuilderIntake` class). `--workers=1` after dashboard canonicalize: **133/134** once; the miss was mobile Batch 5 drafting interview (`h1` still on create copy). Isolated retry of that case **passed**. `/dashboard` signed-out return **2/2** after canonicalize. Do not treat the hung 4-worker run or the one Batch 5 flake as a 4B.5 product regression. Do not claim a single 134/134 combined pass this batch. |
| Phase 1 access contract | **18 files / 100 passed** |
| Phase 2 paid-journey | **exit 0** (critical backend **121** + frontend **97 files / 929 passed**) |
| Production build | `tsc -b && vite build` — **✓ built in 9.78s** |
| Complete frontend suite (exactly once) | **9,514 / 9,313 / 201** (452s) |

## Authority contracts preserved

- Phase 4A–4B.4 assertions were not weakened or snapshot-rewritten.
- `/agreements/:id/sign` was not changed.
- `/app/quick` and admin were not begun.
- No launch claim.

## Comparison with latest remainder `9,505 / 9,309 / 196`

```bash
cd frontend && ./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/phase4b5/frontend-full.json
```

| Check | Latest (4B.4) | This run |
|---|---:|---:|
| Inventory | 9,505 | 9,514 |
| Passed | 9,309 | 9,313 |
| Raw failed assertions | 196 | 201 |
| Failed suites | 329 | 337 |

This batch added focused auth-entry coverage (coverage + AuthCallback + expanded redirect/sign-in cases). Inventory +9. All tests in the touched 4B.5 unit files passed (**0 failures** in `phase4b5AuthEntryCoverage`, `AuthCallbackPage`, `SignInPage`, `safeRedirectResolver`, `gtmAnonymousStarterUpgradePath`). Passed +4 / failed +5 is leftover variance (TEST511, `json_parse`, TEST473–475 initials, source-window flaps), not this-batch closures and not a 4B.5 product regression. **Do not subtract leftovers from `9,505 / 9,309 / 196`. Do not rebaseline unrelated variance.**

Playwright 14 is outside this inventory.

## Remaining risks

- Live magic-link email, Supabase session exchange, Google OAuth, and staging host configuration are unproven.
- Playwright did not prove callback success navigation onto the server destination under Vite + the DEV e2e auth bridge.
- Combined Phase 4A default workers and Phase 4B.2 `--workers=2` can still hang on Vite/`AgreementBuilderIntake.tsx`.
- Leftover full-suite Vitest failures remain at the prior remainder class.

## How to re-run

```bash
scripts/run_phase4b5_auth_entry_browser_gate.sh
scripts/run_phase4b4_esign_browser_gate.sh
scripts/run_phase4b3_public_verify_browser_gate.sh
# Phase 4B.2 combined --workers=2 can hang on Vite; split:
# (cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4b2.config.ts --workers=1 --grep-invert "retryable network")
# (cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4b2.config.ts --workers=1 -g "retryable network")
scripts/run_phase4b1_recipient_review_browser_gate.sh
(cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4a.config.ts --workers=1 --reporter=line)
scripts/run_phase1_access_contract_gate.sh
scripts/run_phase2_paid_journey_release_gate.sh
```
