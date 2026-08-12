# Proposed change-set decomposition (commercial-contract pass)

Exclude diagnostics, generated artifacts, blinded packets, and commercial-readiness baselines from any commit.

## A — Contract + billing lifecycle (production)

- `backend/billing/pricing.py` — Pro `payout_share_bps` 3000; Plus/starter alias → Pro
- `backend/billing/subscription_authority.py` — checkout session enriches expanded subscription metadata/customer
- `backend/usage_economics/store.py` / `usage_economics_postgres.py` — `agreements_finalized_since`
- `backend/usage_economics/commercial_entitlement.py` — Pro meter = finalized
- `backend/usage_economics/policy.py` — create deny when finalize quota exhausted
- `backend/affiliates/genesis_stripe_handlers.py` — first-invoice $29.70; idempotent before first-invoice gate
- `backend/affiliates/stripe_earnings_handlers.py` — Genesis ledger authoritative; first-invoice-only; duplicate probe
- `backend/economics/genesis_referral_store.py` — `count_non_voided_commissions_for_referred_org`

## B — Frontend buyer/affiliate contract surfaces

- `frontend/src/launch/pricingTiersData.ts`, `pricingContent.ts`, `ConversionPricingTriad.tsx`, `BillingPage.tsx`
- `frontend/src/launch/paywallMessaging.ts`, `paywallExperiment.ts`
- `frontend/src/launch/simpleProduct/CreateFlowAgreementCheckoutPricing.tsx`, `SimpleReadyToSendPage.tsx`
- `frontend/src/account/affiliatePresentation.ts` (+ tests)
- `frontend/src/access/authenticatedWorkspaceAccessPolicy.ts`, `tierConfig.ts`
- Related checkout/access tests in critical FE list

## C — Lifecycle / entitlement tests

- `backend/tests/test_commercial_beta_lifecycle.py` (**new**)
- `backend/tests/test_guest_genesis_pro_entitlement.py` — Pro finalize meter
- `backend/tests/test_commercial_entitlement_policy.py`
- `backend/tests/test_genesis_referral.py`
- `backend/tests/test_subscription_authority.py`
- `backend/tests/test_stripe_affiliate_earnings.py`
- `backend/tests/test_paid_beta_release_gate.py`
- `scripts/run_paid_beta_release_suite.sh` — includes lifecycle + genesis referral

## D — Commercial-readiness docs (this pass)

- `evals/commercial-readiness/COMMERCIAL_TRUTH_TABLE.md`
- `evals/commercial-readiness/ENTITLEMENT_MATRIX.md`
- `evals/commercial-readiness/EXCLUDED_FRONTEND_FAILURES.md`
- `evals/commercial-readiness/FAILURE_CLASSIFICATION.md`
- `evals/commercial-readiness/PROPOSED_CHANGESET_DECOMPOSITION.md`

## Explicitly exclude from commit

- `evals/commercial-readiness/baselines/**` (generated suite logs / junit / vitest dumps)
- `evals/draft-quality/results/blinded_packets/**`
- `.rc-validation/**`, `e2e-artifacts/**`
- Local DB / `.env` / secrets
- Unrelated draft-quality H0 / ablation worktrees unless asked

## Suggested PR slices

1. **Billing + quota + affiliate ledger** (A + C backend)
2. **FE buyer contract copy / checkout / affiliate** (B)
3. **Docs + exclusion manifest** (D)
