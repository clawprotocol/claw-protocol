# Phase 4A checkpoint — paid-owner sitemap browser contract

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `5de3481b` (`record phase 3B batch 5 commercial-interview checkpoint`)  
Nothing was pushed. This is **not** a launch authorization.

Phase 4A proves customer-facing **authenticated** and **paid** routes for a paid LawDog owner on desktop (1280×800) and mobile (390×844). Coverage is derived from `APP_ROUTE_MANIFEST`. Entitlement comes from organization-scoped mocked `GET /v1/subscriptions/:orgId` and `GET /api/agreements/usage/summary` — never path, UI tier, React state, or browser storage. Live Stripe, model, email, and staging were not run.

Batch 5’s commercial drafting interview and Phase 1–4 authority / freeze contracts are preserved. This batch does not implement Phase 4B.

## Named gate

`scripts/run_phase4a_paid_sitemap_browser_gate.sh`

1. `frontend/node_modules/.bin/vitest run src/launch/phase4aPaidSitemapCoverage.test.ts` — fails if a new authenticated/paid manifest route lacks a browser scenario.
2. Playwright `frontend/playwright.phase4a.config.ts` — `e2e/phase4a/**`, retries 0, Chrome desktop + mobile widths.

The coverage module is also bound into the Phase 2 paid-journey include.

## Phase 4A routes covered

Authenticated (23 IDs; dashboard has two example paths):

| Route ID | Example path(s) |
|---|---|
| dashboard | `/app`, `/dashboard` |
| billing | `/app/billing` |
| affiliate | `/app/affiliate` |
| settings | `/app/settings` |
| signatures | `/app/signatures` |
| opportunity | `/app/opportunity` |
| agreement-memory | `/app/agreement-memory` |
| integrations | `/app/integrations` |
| genesis-referral | `/app/genesis-referral` |
| simple-create | `/app/create` |
| simple-ready | `/app/ready/example-agreement` |
| simple-checkout | `/app/checkout/example-agreement` |
| simple-send | `/app/send/example-agreement` |
| simple-done | `/app/done/example-agreement` |
| owner-proposal-review | `/app/review-changes/example-agreement` |
| owner-verification | `/app/verification/example-agreement` |
| agreements-list | `/app/agreements` |
| agreements-new | `/app/agreements/new` |
| owner-agreement-view | `/app/agreements/example-agreement/view` |
| owner-signed-agreement-view | `/app/agreements/example-agreement/view-signed` |
| owner-signing-status | `/app/signing-status/example-agreement` |
| agreement-detail | `/app/agreements/example-agreement` (token query is Phase 4B) |
| usage-receipt | `/app/receipts/example-usage` |

Paid (2 IDs):

| Route ID | Example path |
|---|---|
| work-product | `/app/work-product` |
| field-review | `/app/field-review/example-analysis` |

**26 example paths** from the manifest. No second hand-maintained sitemap.

## Scenario counts

| Kind | Count |
|---|---:|
| Manifest route IDs | 25 |
| Example paths | 26 |
| Viewports | 2 (desktop 1280×800, mobile 390×844) |
| Owned fixture states | 8 (draft, pending review, accepted/frozen, sent, partially signed, executed, receipt, field review) |
| Negative-access | signed-out × every example path; free user × paid routes; wrong-org; missing IDs; retryable workspace-index |
| Batch 5 drafting interview | 1 (runs at both viewports) |
| Playwright tests after fixture-state split | 67 unique × 2 viewports = 134 |

Paid owner org: `user-phase4a-paid-owner`. Second org: `user-phase4a-other-org`. Missing IDs: `ag-phase4a-missing`, `missing-usage`.

## Gate results

Coverage vitest: **3/3 passed**.

First executable Chrome run (after WebKit / headless-shell harness repair): **120 tests, 96 passed, 24 failed (21.9m)**. Those 24 were 12 identities × 2 viewports.

Shared harness cluster repaired (not product):

- Playwright intercepted `/app/field-review/...` HTML as JSON (`url.includes("/field-review")` on `**/*`).
- Mobile project launched WebKit; Chrome channel now matches repo e2e.
- Duplicate titles for dashboard’s two example paths.
- Genesis-gated affiliate / opportunity / genesis-referral honestly redirect non-affiliates to Dashboard.
- Create empty-state CTA is **Describe your agreement**, not Create agreement.
- Done heading is **Next step**.
- `/api/agreements/parse` and `/health` were unmocked (Vite proxied to :8000).

After that cluster, focused re-run of the previous failure set: **52 tests, 49 passed, 3 failed (3.6–3.9m)**.

The full 134-test gate was **not** re-run after the last persist-mock edit. The Phase 4A gate is **not green**. Complete frontend suite was **not** run.

## Remaining failures (classified)

### Product defects

1. **`simple-ready` desktop** — entitled localhost ready immediately routes to send (`isSimpleSendPaywallActive` is false in DEV). After settle, no visible primary action matched the shared contract (Send / Continue / Home / New agreement). Mobile ready passed. This is a desktop send/ready action-visibility gap, not a blank page.
2. **Batch 5 browser proof** — sparse SaaS (`need a SaaS agreement for about 100k`) correctly asks named parties and keeps Send/Sign/Freeze closed. The filled Orion / Contoso / New York / 100k rewrite generates a 1636-character paid corpus (`finalCorpusSource: paid_pro_review_render`) but the create surface reports **LawDog couldn't create the agreement** / **couldn't save your draft**. The verified review heading and frozen bytes never mount. Dashboard reopen / direct-route frozen-byte proof did not run.

### Harness defects (closed in this batch)

Field-review document intercept; Chrome vs WebKit; duplicate titles; Genesis closed-access heading; parse / health / draft POST mocks; create/done copy; fixture-state 30s loop timeout.

### External / live-proof gaps

None claimed. No live model, Stripe, email, or staging. `/health` ECONNREFUSED to :8000 was harness (Vite proxy), not an external outage.

## Phase 4B scope (not implemented)

| Access | Route IDs | Example paths |
|---|---|---|
| public | `sign-in`, `auth-callback` | `/app/sign-in`, `/app/auth/callback` |
| guest_workflow | `quick-send`, `esign-new` | `/app/quick`, `/app/esign`, `/app/esign/new` |
| recipient_token | `recipient-esign`; `agreement-detail` when `?token=` / `?t=` | `/app/esign/example-document` |
| admin | `admin-console`, `affiliate-payout-ops`, `ops-growth`, `ops-paid-funnel`, `ops-starter-pro-refine`, `ops-genesis-referral` | `/app/admin`, `/app/founder`, `/founder`, `/admin`, `/app/ops/affiliate-payouts`, `/app/ops/growth`, `/app/ops/paid-funnel`, `/app/ops/starter-pro-refine`, `/app/ops/genesis-referral` |

## Focused gates besides Phase 4A

| Gate | Result |
|---|---|
| Phase 1 access contract | **18 files / 96 passed** |
| Phase 2 paid-journey frontend | **exit 0** (Batch 5 was 95 files / 915; this include adds `phase4aPaidSitemapCoverage.test.ts` / +3) |
| Backend ownership / security | **154 passed** (Phase 2 critical set plus `test_owner_delivery_track_auth`, `test_agreement_read_scope`, `test_workspace_index_subject_scoped`, `test_auth_identity_enforcement`) |
| Production build | `tsc -b && vite build` — **✓ built in 10.48s** |
| Complete frontend suite | **not run** (Phase 4A gate not green) |

## Comparison with Batch 5 official remainder

Batch 5 official once-run: **9,475 / 9,280 / 195**.

Phase 4A did not re-run the complete frontend suite because the named browser gate is not green. Do not subtract from that remainder. TEST511, hash-parity, source-window / `json_parse` flaps, suite-load, and TEST341 remain unclassified leftovers from prior batches.

## Local artifacts

- `frontend/src/launch/phase4aPaidSitemapCoverage.ts`
- `frontend/src/launch/phase4aPaidSitemapCoverage.test.ts`
- `frontend/e2e/phase4a/phase4aPaidOwnerFixtures.ts`
- `frontend/e2e/phase4a/phase4aPaidOwnerSitemap.spec.ts`
- `frontend/e2e/phase4a/phase4aBatch5DraftingInterview.spec.ts`
- `frontend/playwright.phase4a.config.ts`
- `scripts/run_phase4a_paid_sitemap_browser_gate.sh`
