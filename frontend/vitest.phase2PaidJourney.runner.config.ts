/// <reference types="vitest/config" />
/**
 * Phase 2 paid-journey release gate — authenticated paid-user path only.
 *
 * sign in → restore workspace/plan → create/freeze one paid agreement →
 * reopen without document/signer drift → review → send → sign →
 * retrieve final agreement and receipt.
 *
 * Also covers wrong-account, signed-out, free-user, recipient-token,
 * and stale-browser-state access boundaries.
 *
 * No live model/API calls. Run via:
 *   scripts/run_phase2_paid_journey_release_gate.sh
 *   npm run test:phase2-paid-journey
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { PHASE1_ACCESS_CONTRACT_INCLUDE } from "./vitest.phase1AccessContract.include";

const PHASE2_JOURNEY_ONLY = [
  "src/auth/safeRedirectResolver.test.ts",
  "src/auth/ownershipMigrationFinalize.test.ts",
  "src/auth/anonymousOwnerContext.test.ts",
  "src/launch/checkoutParams.test.ts",
  "src/launch/routes.test.ts",
  "src/launch/homeFreeStarterFlowIsolation.test.ts",
  "src/launch/ownerAgreementReadOnlyDisplaySafety.test.ts",
  "src/launch/creatorDashboardAgreementCompletion.test.ts",
  "src/launch/dashboardWhatsNextPresentation.test.ts",
  "src/components/agreements/coreUserJourneyClosure.test.ts",
  "src/components/agreements/paidProTest435RedMesaHarborFreeze.test.ts",
  "src/components/agreements/proCorpusAuthorityStabilization.test.ts",
  "src/components/agreements/paidProTest555Phase2PartyHandoff.test.ts",
  "src/components/agreements/paidProTest556Phase2ReviewProjectionClosure.test.ts",
  "src/components/agreements/paidProTest558Phase3COwnerSessionClosure.test.ts",
  "src/components/agreements/paidProTest496CreateFlowSplitBrainPrevention.test.ts",
  "src/components/agreements/paidProTest494AuthoritativeReviewShell.test.ts",
  "src/components/agreements/paidProTest490CreateFlowRouting.test.ts",
  "src/components/agreements/paidProTest492CreateFlowReviewHandoff.test.ts",
  "src/components/agreements/paidProTest500CreateFlowStarterShellBypass.test.ts",
  "src/components/agreements/paidProTest501CanonicalPaidProReviewEntry.test.ts",
  "src/components/agreements/paidProTest502ReturningPaidCreatePostPaymentParity.test.ts",
  "src/components/agreements/paidProTest503ReturningPaidPostPaymentReuse.test.ts",
  "src/components/agreements/paidProTest508FourPartyGuidedContinueBypass.test.ts",
  // paidProTest504ReturningPaidCorpusHandoff.test.ts stays out of this gate:
  // TEST504-6 is a source-inspection contract for Batch 2 (commitAcceptedPaidProCorpusHandoffSync
  // inside runEntitledPremiumImprovementRewrite). Do not add that file until 504-6 is
  // resolved by correct rewrite-time corpus commit behavior.
  "src/components/agreements/paidProSameAgreementGenerationHandoff.authority.test.ts",
  "src/agreement/commercialReviewSnapshotLifecycle.test.ts",
  "src/agreement/canonicalReviewSnapshotReloadAuthority.test.ts",
  "src/agreement/recipientTokenSafetyStatic.test.ts",
  "src/agreement/recipientMagicLinkSession.test.ts",
  "src/agreement/agreementDraftNormalize.executedSnapshot.authority.test.ts",
  "src/vs01/vs01SignerCompletionSync.test.ts",
  "src/vs01/vs01FullyExecutedSignedSnapshot.test.ts",
  "src/vs01/vs01SigningInviteDelivery.failClosed.test.ts",
  "src/vs01/StepReceipt.test.ts",
] as const;

export const PHASE2_PAID_JOURNEY_INCLUDE = [
  ...PHASE1_ACCESS_CONTRACT_INCLUDE,
  ...PHASE2_JOURNEY_ONLY,
] as const;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [...PHASE2_PAID_JOURNEY_INCLUDE],
    testTimeout: 30_000,
  },
});
