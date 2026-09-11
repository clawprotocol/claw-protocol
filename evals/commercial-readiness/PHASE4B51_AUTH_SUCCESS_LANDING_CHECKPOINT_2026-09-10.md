# Phase 4B.5.1 checkpoint — authenticated callback success landing

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `6987efcd` (`6987efcd68185d518516f7815f25f67d6c56b90c`) — Phase 4B.5 checkpoint  
Product repair: `e22630e7` (`e22630e786eb040fe594a1219434d285a10e338b`)  
Gate/tests: `b5d67228` (`b5d6722871e8fc53be2914d2a56f55c01e5d9761`)  
Nothing was pushed. This is **not** a launch authorization. `/app/quick`, admin, and leftover Vitest cleanup were not begun.

Phase 4B.5.1 proves a fresh browser context with only a mocked provider session and a valid server continuation can exercise the real `AuthCallbackPage`, production continuation client, router, and destination page. The browser must reach the exact server destination and, for paid resume, mount verified server paper in canonical paid-Pro review.

Live email delivery, Supabase exchange, Google OAuth, and staging configuration still require operator proof. This gate does not claim those.

## Root cause

**Production**, not the DEV e2e session bridge.

1. Callback stripped `continuation_id` before finalize. React StrictMode remounted with empty search; the first finalize was cancelled and the remount never navigated.
2. Fail-closed / no-session UI was gated on `!cancel` while `startedRef` blocked remount restart, so unsigned expired continuation stayed on loading.
3. `/app/create?agreementId=` ignored the server dest ID as a fresh start. Writing the resume ID activated dashboard-resume paint, which requires a verified canonical snapshot. GET draft paper sat in SoT/refs while the article stayed empty.
4. Anonymous bootstrap could clobber a `user-*` org.

Smallest repairs: keep `continuation_id` until consume; remount-safe unavailable UI; bind `result.orgId`; parse dest agreement ID; write create resume from server dest; hydrate verified snapshot before review chrome; do not let anonymous session overwrite a user workspace.

No test-only product authorization path was added. Playwright intercepts the ordinary `finalize-auth` request (`page.route`). `window.fetch` is not replaced.

## Final destination assertions

| Proof | Result |
|---|---|
| Fresh context, provider session + server continuation only | Pass |
| Open `/app/auth/callback` with valid continuation + forged `next` | Pass |
| Real callback page, continuation client, router, destination | Pass — no `navigate()` from the test, dest not pre-seeded |
| Ordinary request interception | Pass — `page.route` of `/api/**` + `/v1/**` |
| Exactly one authenticated `finalize-auth` | Pass — continuation `cont-phase4b51-orion` / `cont-phase4b51-create`, user `user-phase4b51-owner` |
| Exact dest `/app/done/ag-phase4b51-orion` | Pass — not merely loading gone or forged route avoided |
| Same org, user, durable agreement ID | Pass — org `user-phase4b51-owner`; no `anon-*`; no `OTHER-CUSTOMER-AGREEMENT-MUST-NOT-RENDER` |
| Refresh dest stays authorized | Pass — still `/app/done/ag-phase4b51-orion`; no second claim |
| Server dest wins over forged `next` | Pass — `/app.evil` / `/app/evil` never win |
| Secrets absent from final URL/DOM/logs/analytics | Pass — no auth code, continuation ID, tokens, or private paper |
| Paid-resume `/app/create?agreementId=ag-phase4b51-create` | Pass — heading **Review your agreement draft**; article contains `Orion Harbor LLC` and verified paper; not Free Starter / blank / local-only |
| Paid-create run separately `--workers=1` | Pass — official script shard; retries=0 |

## Named gate

`scripts/run_phase4b51_auth_success_landing_gate.sh`

1. Vitest coverage + `AuthCallbackPage` + `anonymousOwnerContext` — **3 files / 9 passed**.
2. Shared Vite on **4176**, warmup of `/app/auth/callback` and `/app/create` (compile only).
3. Playwright `--workers=1 --grep-invert "paid-resume"` — **4/4**.
4. Playwright `--workers=1 -g "paid-resume"` — **2/2**.

Final official run after the fail-closed remount repair: **4 passed (7.2s)** + **2 passed (13.4s)**. One complete script pass; not an isolated retry of a failed shard.

Does **not** prove live email, Supabase, Google OAuth, or staging.

## Gate reliability

| Official command | Setting | Result |
|---|---|---|
| Phase 4A | `--workers=1` | **134/134 passed (5.6m)** — one complete run |
| Phase 4B.2 | invert-retryable then `-g "retryable network"`, both `--workers=1` | **14/14 + 2/2** in one official script |
| Phase 4B.5 | `--workers=1` (workers=2 hung on intake compile) | **14/14 passed (1.6m)** + coverage **13/13** |
| Phase 4B.4 | `--workers=1` | **16/16 passed (1.8m)** |
| Phase 4B.3 | `--workers=1` | **16/16 passed (1.0m)** |
| Phase 4B.1 | `--workers=1` | **16/16 passed (1.6m)** |

Do not claim a gate from “one failure plus isolated retry.” Combined default workers still deadlock Vite on `AgreementBuilderIntake.tsx`.

## Verification (required order)

| Step | Result |
|---|---|
| Phase 4B.5.1 positive callback + paid-resume | Official script **PASS** (4+2 Playwright, 9 unit) |
| Phase 4B.5 | **14/14** + **13** unit |
| Deterministic Phase 4A | **134/134** one complete official run |
| Deterministic Phase 4B.2 | **16/16** official split |
| Phase 4B.4 | **16/16** |
| Phase 4B.3 | **16/16** |
| Phase 4B.1 | **16/16** |
| Phase 1 | **18 files / 100 passed** |
| Phase 2 | **exit 0** (frontend **97 files / 930 passed**) |
| Production build | `tsc -b && vite build` — **✓ built in 17.96s** |
| Complete frontend suite (exactly once) | **9,519 / 9,284 / 235** (881s) |

## Comparison with remainder `9,505 / 9,309 / 196`

| Check | Compare-to | This run |
|---|---:|---:|
| Inventory | 9,505 | 9,519 |
| Passed | 9,309 | 9,284 |
| Raw failed assertions | 196 | 235 |

Inventory +14 is this-batch unit/coverage. All touched 4B.5.1 unit files passed in the full suite (`phase4b51AuthSuccessLandingCoverage`, `AuthCallbackPage`, `anonymousOwnerContext`, `authCallbackFinalizeDedup`, `safeRedirectResolver`, `createReviewRefreshRestore`, `paidProResumeDraftMerge`, `agreementIntakeStorage`). Failed +39 / passed −25 is leftover remainder class plus source-window flaps on the enlarged `AgreementBuilderIntake.tsx` (`json_parse` / degraded recovery, TEST473–475 initials, TEST511, TEST544 snippet window). **Do not establish `9,514 / 9,313 / 201` or `9,519 / 9,284 / 235` as a new baseline. Do not subtract leftovers from `9,505 / 9,309 / 196`.** Leftover Vitest cleanup was not begun.

Playwright counts are outside this inventory.

## Remaining live-auth requirement

Live email, Supabase session exchange, Google OAuth, and staging host configuration remain operator-staging proof and must not be claimed here.

## Remaining risks

- Combined Playwright workers > 1 can still hang Vite on `AgreementBuilderIntake.tsx`.
- Leftover full-suite Vitest failures remain at the prior remainder class.
- `/app/quick` was not started.

## Authority contracts preserved

- Phase 4A–4B.5 destination and paper assertions were not weakened.
- No fetch stub as the success path.
- No pre-seeded `claw_org_id`, continuation context, or destination.
- `/app/quick` and admin were not begun.
- No launch claim.

## How to re-run

```bash
scripts/run_phase4b51_auth_success_landing_gate.sh
scripts/run_phase4b5_auth_entry_browser_gate.sh
scripts/run_phase4a_paid_sitemap_browser_gate.sh
scripts/run_phase4b2_recipient_signing_browser_gate.sh
scripts/run_phase4b4_esign_browser_gate.sh
scripts/run_phase4b3_public_verify_browser_gate.sh
scripts/run_phase4b1_recipient_review_browser_gate.sh
scripts/run_phase1_access_contract_gate.sh
scripts/run_phase2_paid_journey_release_gate.sh
(cd frontend && npm run build)
```
