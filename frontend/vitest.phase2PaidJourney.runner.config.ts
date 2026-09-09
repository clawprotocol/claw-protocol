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
  "src/components/agreements/paidCreateFlowWorkspaceEntitlementScope.test.ts",
  "src/components/agreements/paidProUnvalidatedCorpusAuthority.test.ts",
  "src/components/agreements/paidProSignerFinalizeDurableId.test.ts",
  "src/components/agreements/paidProTest499ReturningPaidCreateDraftLimitPersist.test.ts",
  "src/components/agreements/paidProTest504ReturningPaidCorpusHandoff.test.ts",
  "src/components/agreements/paidProTest505ReturningPaidStaleUiAndSignerHandoff.test.ts",
  "src/components/agreements/paidProTest506ReturningPaidProfessionalCorpusRegression.test.ts",
  "src/components/agreements/paidProTest521ReturningPaidDraftLimitTerminal.test.ts",
  "src/components/agreements/paidProBatch2DurablePersist.behavior.test.ts",
  "src/components/agreements/paidProBatch2RewriteCorpusHandoff.behavior.test.ts",
  "src/components/agreements/paidProBatch21FrozenCorpusSignerMetadata.behavior.test.ts",
  "src/components/agreements/paidProBatch212FrozenCorpusReload.behavior.test.ts",
  "src/components/agreements/paidProBatch213FrozenAuthorityFailClosed.behavior.test.ts",
  "src/components/agreements/paidProAlexPixelForgeSignerFinalizeReady.test.ts",
  "src/components/agreements/paidProNoticeMetadataLabelContamination.test.ts",
  "src/components/agreements/paidProTest497CompletedCorpusFrozenBody.test.ts",
  "src/components/agreements/paidProTest406FourPartySignerMetadataFinalization.test.ts",
  "src/components/agreements/paidProTest464CompletedSignedArtifact.test.ts",
  "src/components/agreements/paidProBatch221PendingSnapshotRejection.behavior.test.ts",
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
