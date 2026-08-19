# Change-set custody inventory (RC closure pass)

**Branch:** `fix/paid-pro-duplicate-provision-family-demote`  
**Rule:** Do not touch or commit files of unclear provenance. Exclude baselines, packets, `.rc-validation`, secrets, eval outputs.

## Slice A — Commercial authority / quota / billing / affiliate (production)

| Path | Status | Notes |
|---|---|---|
| `backend/billing/pricing.py` | M | Pro $99, bps 3000, plus→pro |
| `backend/billing/subscription_authority.py` | M | Checkout enrichment |
| `backend/affiliates/genesis_stripe_handlers.py` | M | First-invoice $29.70 |
| `backend/affiliates/stripe_earnings_handlers.py` | M | Genesis SoT; first-invoice legacy |
| `backend/economics/genesis_referral_store.py` | M | Prior commission count |
| `backend/usage_economics/commercial_entitlement.py` | M | Finalize meter; **Genesis tier to remove** |
| `backend/usage_economics/policy.py` | M | Exhaustion deny; Genesis paths |
| `backend/usage_economics/store.py` | M | `agreements_finalized_since` |
| `backend/usage_economics/usage_economics_postgres.py` | M | PG finalize count |
| `backend/security/commercial_auth.py` | M | Pro gate |
| `backend/payments/stripe_checkout_helpers.py` | M | Checkout helpers |
| `backend/services/vs01_signer_completion.py` | M | Concurrent finalize lock |
| `backend/routers/agreements_v2_api.py` | M | Auth/entitlement surfaces |
| `backend/routers/workspace_auth_api.py` | M | Workspace auth |
| `backend/llm_router.py` | M | **HOLD — unclear commercial relevance; do not commit until reviewed** |

## Slice B — Buyer-facing pricing / entitlement presentation

| Path | Status |
|---|---|
| `frontend/src/launch/pricingTiersData.ts` | M |
| `frontend/src/launch/pricingContent.ts` | M |
| `frontend/src/launch/ConversionPricingTriad.tsx` | M |
| `frontend/src/launch/BillingPage.tsx` | M |
| `frontend/src/launch/paywallMessaging.ts` | M |
| `frontend/src/launch/paywallExperiment.ts` | M |
| `frontend/src/launch/checkoutParams.ts` | M |
| `frontend/src/launch/checkoutParams.test.ts` | M |
| `frontend/src/launch/simpleProduct/CreateFlowAgreementCheckoutPricing.tsx` | M |
| `frontend/src/launch/simpleProduct/SimpleReadyToSendPage.tsx` | M |
| `frontend/src/launch/LawdogAffiliatePage.tsx` | M |
| `frontend/src/launch/genesisReferral/GenesisAffiliateDashboardPage.tsx` | M |
| `frontend/src/launch/genesisReferral/GenesisReferralOpsPage.tsx` | M |
| `frontend/src/account/affiliatePresentation.ts` | M |
| `frontend/src/account/affiliatePresentation.test.ts` | M |
| `frontend/src/access/authenticatedWorkspaceAccessPolicy.ts` | M |
| `frontend/src/access/authenticatedWorkspaceAccessPolicy.test.ts` | M |
| `frontend/src/access/tierConfig.ts` | M |
| `frontend/src/monetization/lawDogMonetization.ts` | M |
| `frontend/src/monetization/types.ts` | M |
| `frontend/src/components/agreements/upgradeContextReasons.ts` | M |

## Slice C — Frontend P0 runtime / integrity (production + focused tests)

| Path | Status | Notes |
|---|---|---|
| `frontend/src/components/agreements/acceptedProCorpusSafeDisplay.ts` | M | Integrity |
| `frontend/src/components/agreements/canonicalAgreementTitle.ts` | M | |
| `frontend/src/components/agreements/contactAuthorityExecutionBlockIntegrity.ts` | M | |
| `frontend/src/components/agreements/documentQualityFloor.ts` | M | |
| `frontend/src/components/agreements/paidPro*.ts(x)` (many) | M | Polish/freeze/notices/render |
| `frontend/src/components/agreements/premiumCompletionPipeline.ts` | M | Recovery |
| `frontend/src/components/agreements/premiumFullDraftApi.ts` | M | |
| `frontend/src/components/agreements/premiumPartyNamesHandoff.ts` | M | |
| `frontend/src/components/agreements/premiumReadonlyRenderCorpus.ts` | M | |
| `frontend/src/components/agreements/polishProAgreementDisplayLayer.ts` | M | |
| `frontend/src/components/agreements/starterPartyIdentityIsolation.ts` | M | |
| `frontend/src/components/agreements/proOperationalSynthesis/milestoneTableGeneration.ts` | M | |
| Matching `*.test.ts` under agreements | M | Expectation changes only when contract proves invalid |

## Slice D — Lifecycle / release-gate tests + harness

| Path | Status |
|---|---|
| `backend/tests/test_commercial_beta_lifecycle.py` | ?? |
| `backend/tests/test_paid_beta_release_gate.py` | ?? |
| `backend/tests/entitlement_test_support.py` | ?? |
| `backend/tests/test_guest_genesis_pro_entitlement.py` | M |
| `backend/tests/test_commercial_entitlement_policy.py` | M |
| `backend/tests/test_genesis_referral.py` | M |
| `backend/tests/test_subscription_authority.py` | M |
| `backend/tests/test_*` (auth/signing/entitlement harness updates) | M |
| `scripts/run_paid_beta_release_suite.sh` | ?? |
| `backend/agreements/explicit_acceptance_authority.py` | ?? | Needed by e2e gate |
| `backend/tests/test_explicit_acceptance_*.py` | ?? | Gate coverage |

## Slice E — Commercial readiness docs

| Path | Status |
|---|---|
| `evals/commercial-readiness/COMMERCIAL_TRUTH_TABLE.md` | ?? |
| `evals/commercial-readiness/ENTITLEMENT_MATRIX.md` | ?? |
| `evals/commercial-readiness/EXCLUDED_FRONTEND_FAILURES.md` | ?? |
| `evals/commercial-readiness/FAILURE_CLASSIFICATION.md` | ?? |
| `evals/commercial-readiness/PROPOSED_CHANGESET_DECOMPOSITION.md` | ?? |
| `evals/commercial-readiness/CHANGESET_CUSTODY.md` | ?? (this file) |
| `COMMERCIAL_READINESS_GATE.md` | ?? | Review before commit |

## EXCLUDE — do not commit

| Path | Reason |
|---|---|
| `evals/commercial-readiness/baselines/**` | Generated suite artifacts |
| `evals/draft-quality/**` | H0 / eval tooling (out of scope) |
| `.rc-validation/**` | Diagnostics / screenshots |
| `backend/agreements/draft_quality_*.py` + related tests | Evaluation / H0 |
| `backend/agreements/semantic_term_authority.py` + tests | Eval / draft-quality |
| `frontend/src/components/agreements/*Semantic*` / `draftQuality*` / `preSoT*` | Eval tooling |
| `data/recipient_tokens/validate_usage.jsonl` | Runtime diagnostic data |
| `examples/epoch-0003/**`, `tests/fixtures/timeline.json` | Unclear provenance |
| Secrets / `.env*` | Never |

## HOLD — unclear provenance (do not commit until classified)

| Path | Action |
|---|---|
| `backend/llm_router.py` | Diff review required |
| `.gitignore` | Diff review required |
| Any file not listed above that appears mid-pass | Re-inventory before commit |
