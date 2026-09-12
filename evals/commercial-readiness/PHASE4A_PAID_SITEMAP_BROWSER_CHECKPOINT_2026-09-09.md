# Phase 4A / 4A.1 checkpoint — paid-owner sitemap + verified paper paint

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `637b8ffb` (`record phase 4A paid sitemap browser checkpoint`)  
Nothing was pushed. This is **not** a launch authorization. Phase 4B was not begun.

Phase 4A proves customer-facing **authenticated** and **paid** routes for a paid LawDog owner on desktop (1280×800) and mobile (390×844). Coverage is derived from `APP_ROUTE_MANIFEST`. Entitlement comes from organization-scoped mocked `GET /v1/subscriptions/:orgId` and `GET /api/agreements/usage/summary` — never path, UI tier, React state, or browser storage. Live Stripe, model, email, and staging were not run.

Phase 4A.1 repairs the remaining Batch 5 defect: a paid review may show “agreement generated” and enable review actions **only when the actual document DOM contains the verified authoritative corpus**.

## Phase 4A.1 root cause

One defect on desktop and mobile. The drafting interview and durable persist succeeded. The page reached **Review your agreement draft**. Runtime diagnostics reported `workingCorpusLen: 1636`, `finalCorpusLen: 1636`, `authoritativeLen: 1636`, and `finalCorpusSource: paid_pro_review_render`. **`Agreement document preview` stayed empty** and never rendered `SAAS SUBSCRIPTION AGREEMENT`.

What broke the authority-to-render seam:

1. **Flat snapshot envelope dropped.** `prepareCommercialReviewSnapshotAuthority` required `{ snapshot: { snapshot_id } }`. The Phase 4A fixture (unchanged) returns a **flat** persist/GET body (`snapshot_id` at root). Persist/GET parsed as `snapshot_missing`, so verified display corpus was never stored.
2. **Forced route did not hand verified paper.** `PaidProDocumentBodyForcedRoute` forced the shell from frozen length but did not pass the org / durable-id / SHA-256 / length-bound corpus into `PaidProVisibleDocumentShell`.
3. **Parent paint required SoT.** `resolveAcceptedCanonicalPaintPlain` ignored parent `acceptedCanonicalPlain` unless a local source of truth already existed. `mayPaintPaidPaper` correctly refused unverified `paid_pro_review_render`, so the article stayed empty.
4. **Completed-review chrome without paper.** `SimpleCreatePage` used `paidProReviewReady` (not content/paper ready) for the h1, so “Review your agreement draft” mounted over an empty article.
5. **Title projection mutated verified bytes** after paper finally reached the shell (1636 → 1665). Verified source now returns exact bytes.
6. **Owner `/view` reload raced.** Draft GET returns `document_text` only (not usable unless `premium_render_source === "review_first_final_corpus"`). First paint and reload must boot from already-verified session paper; known identity must not flash “Checking your session…”. Snapshot GET is read-only recovery only when the draft itself cannot paint.

Required chain now holds:

`premium-full-draft response → durable agreement persistence → accepted canonical snapshot/verified authority → review selector → PaidProDocumentBodyForcedRoute/PaidProVisibleDocumentShell → nonempty PaidProCanonicalPlainReviewDocument`

Invariant preserved: mismatched org, agreement ID, hash, length, or missing snapshot produces no paper and keeps send / sign / freeze / prepare closed. Local intake, browser/session filler, pipeline text, UI tier, and unverified responses cannot authorize paper. Accepted/frozen bytes stay exact; signer metadata stays separate.

The filled-prompt recap (`data-testid="paid-pro-review-originating-request"`) keeps the interview’s `100k` visible above the article. Playwright’s fee regex is `` /${PHASE4A_FEE}|100k|100,000/i ``; `PHASE4A_FEE` is `$180,000`, and `$` is a regex end-anchor, so the painted fee alone cannot match. The spec and fixture were not edited.

## Named gate

`scripts/run_phase4a_paid_sitemap_browser_gate.sh`

1. `frontend/node_modules/.bin/vitest run src/launch/phase4aPaidSitemapCoverage.test.ts` — **3/3 passed**.
2. Playwright `frontend/playwright.phase4a.config.ts` — `e2e/phase4a/**`, retries 0, Chrome desktop + mobile widths.

The default 4-worker Playwright run deadlocked after desktop enumeration on Vite compiling `AgreementBuilderIntake.tsx` (>500KB). The complete 134 was verified with `--workers=2` (same config, retries=0, both viewports). Coverage vitest is independent of worker count.

## Phase 4A.1 verification (required order)

| Step | Result |
|---|---|
| Batch 5 drafting Playwright only | **2/2 passed** (18.1s) |
| Leftover slice `-g "Batch 5\|simple-ready /app/ready"` | **6/6 passed** (20.8s) |
| Complete Phase 4A browser proof | **134/134 passed** (2.1m, `--workers=2`) |
| Phase 1 access contract | **18 files / 96 passed** |
| Phase 2 paid-journey | **exit 0** (critical backend 121 + frontend include; new `paidProVerifiedReviewPaper.behavior.test.tsx` / +3) |
| Extra backend ownership / security | **33 passed** (`test_owner_delivery_track_auth`, `test_agreement_read_scope`, `test_workspace_index_subject_scoped`, `test_auth_identity_enforcement`) — Phase 2 critical + extra = **154** |
| Production build | `tsc -b && vite build` — **✓ built in 8.84s** |
| Complete frontend suite (exactly once) | **9,483 / 9,299 / 184** (358s) |

Focused paper regression (`paidProVerifiedReviewPaper.behavior.test.tsx`): **3/3** — 1,636-character matching org/id/hash paints; mismatch/missing snapshot stays closed; empty article cannot present a completed review.

## Comparison with official remainder `9,475 / 9,280 / 195`

```bash
cd frontend && ./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/phase4a1/frontend-full.json
```

| Check | Official remainder | This run |
|---|---:|---:|
| Inventory | 9,475 | 9,483 |
| Passed | 9,280 | 9,299 |
| Raw failed assertions | 195 | 184 |
| Failed suites | (prior) | 317 |

This batch added **5** focused tests (3 verified-paper paint + 2 flat-envelope coerce). Inventory +8 / passed +19 / raw failed −11. **Do not treat the −11 as this-batch leftover closures.** TEST511, hash-parity, source-window / `json_parse` flaps, suite-load, and TEST341 remain unclassified leftovers from prior batches. Do not subtract from `9,475 / 9,280 / 195`.

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

## Earlier Phase 4A history (closed by 4A.1)

First executable Chrome run (after WebKit / headless-shell harness repair): **120 tests, 96 passed, 24 failed (21.9m)**. Shared harness cluster repaired (not product): field-review intercept, Chrome channel, duplicate dashboard titles, Genesis closed-access heading, parse / health / draft POST mocks, create/done copy.

The two remaining product failures after that cluster were Batch 5 empty-article paint (this batch) and an earlier desktop `simple-ready` action-visibility gap that is now green in the 134.

## Phase 4B scope (not implemented)

| Access | Route IDs | Example paths |
|---|---|---|
| public | `sign-in`, `auth-callback` | `/app/sign-in`, `/app/auth/callback` |
| guest_workflow | `quick-send`, `esign-new` | `/app/quick`, `/app/esign`, `/app/esign/new` |
| recipient_token | `recipient-esign`; `agreement-detail` when `?token=` / `?t=` | `/app/esign/example-document` |
| admin | `admin-console`, `affiliate-payout-ops`, `ops-growth`, `ops-paid-funnel`, `ops-starter-pro-refine`, `ops-genesis-referral` | `/app/admin`, `/app/founder`, `/founder`, `/admin`, `/app/ops/affiliate-payouts`, `/app/ops/growth`, `/app/ops/paid-funnel`, `/app/ops/starter-pro-refine`, `/app/ops/genesis-referral` |

## Preservation

- Phase 1–5 access, ownership, clarification, freeze, after-pay, and dashboard-resume contracts
- No raw-corpus fallback; corpus thresholds unchanged
- Frozen operative bytes unchanged; signer overlay is execution-tail metadata only
- Batch 5 fixture, assertion, expected title, timeout, and viewport unchanged
- No live model, Stripe, email, or staging

## Local artifacts (4A.1)

- `frontend/src/components/agreements/paidProVerifiedReviewPaper.ts`
- `frontend/src/components/agreements/paidProVerifiedReviewPaper.behavior.test.tsx`
- `frontend/src/agreement/canonicalReviewSnapshotApi.ts` (flat + wrapped coerce; optional org stamp)
- `frontend/src/components/agreements/paidProDocumentBodyRouter.tsx`
- `frontend/src/components/agreements/paidProVisibleDocumentShell.tsx`
- `frontend/src/launch/simpleProduct/SimpleCreatePage.tsx`
- `frontend/src/launch/ownerAgreementReadOnlyView.ts`
- `frontend/e2e/phase4a/phase4aBatch5DraftingInterview.spec.ts` (unchanged)
- `frontend/e2e/phase4a/phase4aPaidOwnerFixtures.ts` (later also mocks `GET /v1/billing/status` for Billing acceptance)
- `scripts/run_phase4a_paid_sitemap_browser_gate.sh`

---

## Billing customer acceptance — `/app/billing` (2026-09-12)

Authoritative HEAD at start of this turn: `a7c8535f7a23fe7dafbdeda1ec5e99c7a7f1fb46`.  
Dirty-state fingerprint of the working tree after this batch: `f2aa725f9b46cd3529caf9e977823f82161d00bf`.  
Nothing was pushed or deployed. No live Stripe charges. **Not a launch authorization.** Settings/admin were not begun.

Customer acceptance for Billing: a signed-in owner can see a **server-authoritative, org-scoped** subscription state, use **server-created Stripe Customer Portal** management when configured, and return to the same agreement without browser state, query parameters, or portal return granting entitlement.

### Named gate

`scripts/run_phase4_billing_acceptance_browser_gate.sh`

| Step | Result | Provider label |
|---|---|---|
| Focused Billing vitest (coverage, display, status API, workspace policy) | **4 files / 11 passed** | n/a |
| Production handlers; external Stripe mocked | display + portal + checkout-repeat + origin + probe + authority + sync + webhook-unsigned + commercial entitlement: **passed** | **mocked-provider** |
| Playwright Billing desktop 1280×800 + mobile 390×844, workers=1 | **30/30 passed** | **mocked-provider** |
| Phase 1 access | **18 files / 100 passed** | n/a |
| Phase 2 paid-journey | **exit 0** (critical backend + 97 FE files / 932 passed) | n/a |
| Auth-return 4B.5 | vitest **3/13**; Playwright **14/14** | mocked fixtures |
| Production build | `tsc -b && vite build` — **✓ built in 8.51s** | n/a |
| Full frontend suite | **not re-run**; retain unresolved inventory **9,505 / 9,309 / 196** | n/a |
| Live Stripe / live-provider | **not run** | **live-provider: absent** |

Mocked-provider evidence: `evals/commercial-readiness/results/phase4-billing-acceptance/a7c8535f7a23-dirty-bd9ad976-mocked-provider/`  
Auth-return evidence: `evals/commercial-readiness/results/phase4-billing-acceptance/a7c8535f7a23-dirty-2ebbc981-auth-return-4b5/`  
Prior untracked `evals/commercial-readiness/results/` live-run artifacts were preserved.

### Billing status on `/app/billing`

`GET /v1/billing/status` derives org from the verified principal. Display states: loading (client), confirmed no subscription, active, scheduled cancellation, expired/canceled, payment problem, unavailable. Dates and cadence render only from stored authoritative fields. Logout/org-switch clears prior-account paint and rejects late responses.

`cancel_at_period_end` and `billing_interval` are persisted from Stripe sync for **display only**. `is_subscription_entitled` is unchanged (active + paid plan + period not ended). Scheduled cancel stays entitled through the paid period.

### Promised management

`POST /v1/billing/portal-session` creates a Stripe Customer Portal session from **server records**. Caller `customer_id` / `customer` / `stripe_customer_id` is rejected. Return URLs are allowlisted and stripped of payment-success query keys. Missing `STRIPE_SECRET_KEY` is **503 `stripe_portal_not_configured`** — an explicit staging blocker. Manage is not offered when no Stripe customer is on file.

### Checkout return and repeat purchase

Success URLs still return to the same allowlisted agreement path. Entitled workspaces get **409 `already_subscribed`** and cannot open a second Checkout Session. Billing CTAs do not unlock send from `returnTo` alone. Query params / portal return do not declare payment success.

### Policy conflicts (reported, not invented)

1. **Scheduled cancel vs internal status.** Stripe `cancel_at_period_end` is now stored for display. Entitlement still uses `status == active` and period end. Do not treat scheduled cancel as canceled access.
2. **GET `/v1/subscriptions/{org}` is 200 + null, never 404.** Access-cache `fetchSubscription` still treats 404 as empty for legacy checkout-return callers. Billing display uses `/v1/billing/status` and treats 404 as unavailable.
3. **Enterprise list prices** remain in `PLANS` ($499/$4990). Public Billing still routes Enterprise to talk-to-us. Not sold via self-serve checkout.
4. **Checkout/disclosure copy** still says contact `support@lawdog.me` to cancel (`MANAGE_BILLING_FROM_BILLING_SHORT`). Billing now offers the portal when configured. Support copy was not rewritten in this batch.
5. **J7 same-agreement checkout** needed fixture Pro to persist a draft, then a real checkout. Entitled orgs can no longer start checkout; the test now clears the fixture grant after persist. Same-agreement return is preserved.

### Staging requirements (Billing not live-complete)

- `STRIPE_SECRET_KEY` and Pro price IDs for checkout
- Stripe Customer Portal configuration for manage/cancel/payment-method
- Server-mapped `stripe_customer_id` per entitled org
- Live-provider evidence is still required before calling Billing staging-ready
- Do **not** mark Billing complete for live customers until those exist

### Next customer surface

**Settings** (`/app/settings`). Operator/admin remains out of scope.

### Unresolved (retained)

Full-suite inventory **9,505 / 9,309 / 196** was not re-run. Phase 4A sitemap 134 and later 4B/4C gates were not re-executed except the 4B.5 auth-return slice above. No overall launch claim.

## Billing follow-up — checkout retry safety + cancellation preservation (2026-09-12)

Authoritative HEAD while tested: `a7c8535f7a23fe7dafbdeda1ec5e99c7a7f1fb46`.  
Source-content fingerprint of Billing files on disk (git hash-object of file contents, **not** a hash of `git status` filenames): `f3e53a490e83e75b37bee8645b69e190f91f4a11`.  
Nothing was pushed or deployed. No live Stripe charges or external account changes. **Not a launch authorization.** Settings/admin were not begun.

This follow-up continues the uncommitted Billing batch above. Two reproduced acceptance gaps are closed on mocked-provider proof only.

### Closures

1. **Checkout retry safety.** Identical authenticated `POST /v1/billing/checkout-session` from an unsubscribed owner now reuses one org/agreement/cadence checkout attempt and one Stripe Idempotency-Key. Duplicate, concurrent, and provider-success/local-response-loss recoveries return the same payable session. Expired or canceled attempts are closed so a later legitimate purchase can start a new session. Cadence change is a different pending purchase. `already_subscribed` and same-agreement return are unchanged. A disabled browser button is not the control.

2. **Cancellation-state preservation.** `apply_invoice_paid_subscription_renewal` no longer writes `cancel_at_period_end=False` when the invoice has no cancellation instruction. `scheduled_cancellation → invoice update` stays `scheduled_cancellation` and remains entitled through the paid period. Only authoritative Stripe Subscription state may set or clear cancellation, including explicit reversal (`cancel_at_period_end=false`). Delayed/out-of-order invoices do not invent or re-arm cancellation. Pricing/refund policy and paid-period access are unchanged.

### Named gate and required follow-up commands

| Step | Result | Provider label |
|---|---|---|
| Focused Billing vitest | **4 files / 11 passed** | n/a |
| Production handlers; Stripe mocked | display + portal + **checkout retry** + **cancel preservation** + origin + probe + authority + sync + webhook-unsigned + commercial entitlement + checkout payload: **92 passed** | **mocked-provider** |
| Playwright Billing desktop + mobile, workers=1 | **30/30 passed** | **mocked-provider** |
| Phase 1 access | **18 files / 100 passed** | n/a |
| Phase 2 paid-journey | **exit 0** (critical backend **121** + frontend **97 files / 932 passed**) | n/a |
| Production build | `tsc -b && vite build` — **✓ built in 8.83s** | n/a |
| Full frontend suite | **not re-run**; retain unresolved inventory **9,505 / 9,309 / 196** | n/a |
| Live Stripe / live-provider | **not run** | **live-provider: absent** |

Commands:

```bash
bash scripts/run_phase4_billing_acceptance_browser_gate.sh
bash scripts/run_phase1_access_contract_gate.sh
bash scripts/run_phase2_paid_journey_release_gate.sh
(cd frontend && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build)
```

Unique mocked-provider evidence: `evals/commercial-readiness/results/phase4-billing-acceptance/a7c8535f7a23-src-f3e53a490e83-mocked-provider/`  
Prior mocked-provider and auth-return evidence directories were preserved. Generated run artifacts are not part of the source checkpoint.

### Remaining staging blockers (Billing not live-complete)

- `STRIPE_SECRET_KEY` and Pro price IDs for checkout
- Stripe Customer Portal configuration for manage/cancel/payment-method
- Server-mapped `stripe_customer_id` per entitled org
- Live-provider evidence is still required before calling Billing staging-ready
- Checkout-attempt reuse + Stripe `Idempotency-Key` must hold under concurrent/retry against live Stripe
- `cancel_at_period_end` must survive live `invoice.paid` without subscription authority
- Do **not** mark Billing complete for live customers until those exist

### Next customer surface

**Settings** (`/app/settings`) follows acceptance of these results. Operator/admin remains out of scope. No overall launch claim.

## Billing follow-up — checkout lifecycle safety (2026-09-12)

Started from exact `5ca08140015c322060b0524dee7abf6d39618348`.  
Source-content fingerprint of Billing files on disk (git hash-object of file contents, **not** a hash of `git status` filenames): `5c132dc24a92c80c09414c4275f27c03cdfc3619`.  
Nothing was pushed or deployed. No live Stripe charges or external account changes. **Not a launch authorization.** Settings/admin were not begun. The core paid journey was not begun.

Cancellation preservation from the previous checkpoint remains accepted for its demonstrated local cases.

### Closures

1. **Completed-provider / pending-local-authority.** If Stripe session A is complete/paid and local subscription is still unresolved, repeated `POST /v1/billing/checkout-session` and refresh return `409 payment_processing` with A's session id. They do not mint session B or return a payable checkout URL. When the completed session can be reconciled through server authority, the handler writes the subscription and returns `409 already_subscribed`. Entitlement is not granted from browser state.

2. **Identical retry payload.** Each attempt persists `provider_request_json` once. Provider-success/local-response-loss replays that exact request and Idempotency-Key. The Stripe mock now rejects the same key with different parameters. Changed email, return URL, or attribution cannot rebuild the provider call. A legitimate cadence change expires the previous **unpaid** session before opening the next one, so two payable subscriptions are not left live. A cadence change after A is complete/unresolved is blocked as `payment_processing`.

3. **Startup concurrency.** `EconomicsStore.init_schema` is serialized with a process/thread lock and safe ALTERs. Production startup uses FastAPI lifespan → `ensure_billing_schema_ready()`. Concurrent `init_schema` on an empty DB no longer raises `duplicate column name: owner_org_id`. Concurrent checkout is proven both after the production hook and without test-only schema pre-init.

### Named gate and required follow-up commands

| Step | Result | Provider label |
|---|---|---|
| Focused Billing vitest | **4 files / 11 passed** | n/a |
| Production handlers; Stripe mocked | previous set + checkout lifecycle + schema startup: **99 passed** | **mocked-provider** |
| Playwright Billing desktop + mobile, workers=1 | **30/30 passed** | **mocked-provider** |
| Phase 1 access | **18 files / 100 passed** | n/a |
| Phase 2 paid-journey | **exit 0** (critical backend **121** + frontend **97 files / 932 passed**) | n/a |
| Production build | `tsc -b && vite build` — **✓ built in 9.00s** | n/a |
| Full frontend suite | **not re-run**; retain unresolved inventory **9,505 / 9,309 / 196** | n/a |
| Live Stripe / live-provider | **not run** | **live-provider: absent** |

Commands:

```bash
bash scripts/run_phase4_billing_acceptance_browser_gate.sh
bash scripts/run_phase1_access_contract_gate.sh
bash scripts/run_phase2_paid_journey_release_gate.sh
(cd frontend && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build)
```

Unique mocked-provider evidence: `evals/commercial-readiness/results/phase4-billing-acceptance/5ca08140015c-src-5c132dc24a92-mocked-provider/`  
Prior Billing evidence directories were preserved. Generated run artifacts are not part of the source checkpoint.

### Remaining staging blockers (Billing not live-complete)

- `STRIPE_SECRET_KEY` and Pro price IDs for checkout
- Stripe Customer Portal configuration
- Server-mapped `stripe_customer_id` per entitled org
- Live-provider evidence that attempt reuse, exact-payload idempotency, completed-session blocking, and schema startup hold against real Stripe
- `cancel_at_period_end` must survive live `invoice.paid` without subscription authority
- Do **not** mark Billing complete for live customers until those exist

### Next acceptance priority (not started)

Core paid journey: intake → targeted clarifications → substantive commercial agreement visibly rendered → owner chooses recipient review or direct e-signing. Both branches must preserve the same agreement/version and survive refresh. Settings remains later. No overall launch claim.

## Billing follow-up — unresolved previous purchase (2026-09-12)

Started from exact `144699685fbc17cd81aaf0569c3971000cafaf59`.  
Source-content fingerprint of Billing files on disk (git hash-object of file contents, **not** a hash of `git status` filenames): `913cf3fd405cd0f380c338e59b7a9e96d2788376`.  
Nothing was pushed or deployed. No live Stripe charges or external account changes. **Not a launch authorization.** Settings/admin were not begun. The core paid journey was not begun.

Exact-payload retries, completed-session blocking, `already_subscribed`, cancellation preservation (demonstrated local cases), and startup safety remain retained.

### Invariant

An unresolved previous purchase must never authorize a second payable checkout.

Failed/uncertain expiration does not mark an attempt superseded. A local deadline plus a failed lookup is not proof the provider session expired unpaid. Provider confirmation is required before retiring A. If completion races expiration, the original purchase is reconciled. The customer sees an honest recoverable status and is not asked to pay again, granted entitlement, or told payment succeeded.

### Bounded matrix (written before the handler change)

Production `POST /v1/billing/checkout-session`; Stripe simulated. The matrix mock does not auto-succeed expiration.

| Row | Result |
|---|---|
| A expire 503 on monthly→annual | **pass** — A stays pending; no B; `409 purchase_unresolved` |
| B local TTL + retrieve 503 + provider complete | **pass** — A not expired/superseded; no B; unresolved/processing |
| C confirmed unpaid expiration | **pass** — A superseded; only B payable |
| D completion during plan change | **pass** — reconcile A; no B |
| D2 expire returns complete | **pass** — reconcile A; no B |
| E repeated annual retry after expire fail | **pass** — still no B; same unresolved |
| F refresh original monthly after expire fail | **pass** — still no B |
| G retrieve malformed (no status) | **pass** — A kept; no B |
| H expire 200 still open | **pass** — A kept; no B |
| I expire malformed empty body | **pass** — A kept; no B |
| J expire 400 + retrieve 503 | **pass** — A kept; no B |

**Remaining failed matrix rows: none.** Do not treat Billing/Playwright happy-path totals as this invariant.

### Named gate and required follow-up commands

| Step | Result | Provider label |
|---|---|---|
| Focused Billing vitest | **4 files / 11 passed** | n/a |
| Production handlers; Stripe mocked | previous set + unresolved-purchase matrix: **111 passed** | **mocked-provider** |
| Playwright Billing desktop + mobile, workers=1 | **34/34 passed** | **mocked-provider** |
| Phase 1 access | **18 files / 100 passed** | n/a |
| Phase 2 paid-journey | **exit 0** (critical backend **121**) | n/a |
| Production build | `tsc -b && vite build` — **✓ built in 9.03s** | n/a |
| Full frontend suite | **not re-run**; retain unresolved inventory **9,505 / 9,309 / 196** | n/a |
| Live Stripe / live-provider | **not run** | **live-provider: absent** |

Commands:

```bash
bash scripts/run_phase4_billing_acceptance_browser_gate.sh
bash scripts/run_phase1_access_contract_gate.sh
bash scripts/run_phase2_paid_journey_release_gate.sh
(cd frontend && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build)
```

Unique mocked-provider evidence: `evals/commercial-readiness/results/phase4-billing-acceptance/144699685fbc-src-913cf3fd405c-mocked-provider/`  
Prior Billing evidence directories were preserved. Generated run artifacts are not part of the source checkpoint.

### Remaining staging blockers (Billing not live-complete)

- `STRIPE_SECRET_KEY` and Pro price IDs for checkout
- Stripe Customer Portal configuration
- Server-mapped `stripe_customer_id` per entitled org
- Live-provider evidence that attempt reuse, exact-payload idempotency, completed-session blocking, unresolved-purchase refusal, and schema startup hold against real Stripe
- `cancel_at_period_end` must survive live `invoice.paid` without subscription authority
- Do **not** mark Billing complete for live customers until those exist

### Next acceptance priority (not started)

Core paid journey: intake → targeted clarifications → substantive commercial agreement visibly rendered → owner chooses recipient review or direct e-signing. Both branches must preserve the same agreement/version and survive refresh. Settings remains later. No overall launch claim.
