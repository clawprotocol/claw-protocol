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
  "src/launch/phase4aPaidSitemapCoverage.test.ts",
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
  "src/components/agreements/qa/paidProHardening/paidProTest221FirstReviewNoLegacyShell.test.tsx",
  "src/components/agreements/qa/paidProHardening/paidProTest225PaymentToFirstReviewLatency.test.ts",
  "src/components/agreements/paidProTest243RecoveryRender.test.ts",
  "src/components/agreements/paidProTest338PostCheckoutAcceptedCorpusStillMounts.test.ts",
  "src/components/agreements/paidProAfterPayReviewScreenGate.test.ts",
  "src/components/agreements/paidProVisibleDocumentShellPaidSessionFallback.test.ts",
  "src/components/agreements/paidProRenderSurface.test.ts",
  "src/components/agreements/premiumPostPaymentHydration.test.ts",
  "src/components/agreements/premiumGenerationApiAvailability.test.ts",
  "src/components/agreements/paidProDashboardSignerSetupResumeFinalReviewPaint.test.tsx",
  "src/components/agreements/paidProDashboardSignerSetupResumePreviewPaint.test.tsx",
  "src/components/agreements/paidProTest412IntakeSignerMetadataPrefill.test.ts",
  "src/components/agreements/paidProTest517ServerDocumentTextAlias.test.ts",
  "src/components/agreements/paidProTest518DashboardCreateIntakeMetadataPrefill.test.ts",
  "src/components/agreements/paidProTest570DashboardReviewDecisionFlow.test.ts",
  "src/components/agreements/paidProSameAgreementGenerationHandoff.authority.test.ts",
  "src/components/agreements/paidProVerifiedReviewPaper.behavior.test.tsx",
  "src/agreement/commercialReviewSnapshotLifecycle.test.ts",
  "src/agreement/canonicalReviewSnapshotReloadAuthority.test.ts",
  "src/agreement/recipientTokenSafetyStatic.test.ts",
  "src/agreement/recipientMagicLinkSession.test.ts",
  "src/agreement/agreementDraftNormalize.executedSnapshot.authority.test.ts",
  "src/vs01/vs01SignerCompletionSync.test.ts",
  "src/vs01/vs01FullyExecutedSignedSnapshot.test.ts",
  "src/vs01/vs01SigningInviteDelivery.failClosed.test.ts",
  "src/vs01/StepReceipt.test.ts",
  "src/components/agreements/proAgreementFiveTenets.test.ts",
  "src/components/agreements/proClarificationRouting.test.ts",
  "src/components/agreements/postCheckoutMissingFactsGate.test.ts",
  "src/components/agreements/premiumFinalizationFlow.test.ts",
  "src/components/agreements/intakeClarificationPolicy.test.ts",
  "src/components/agreements/proClarificationGuidedRepairUx.test.ts",
  "src/components/agreements/paidProUniversalGtmPartyAuthorityRegression.test.ts",
  "src/components/agreements/thinTwoPartyStatedScopeAsk.test.ts",
  "src/components/agreements/guidedDealCompletion/servicesMigrationGuidedCompletion.test.ts",
  "src/launch/releaseScopeQualificationCampaign.test.ts",
  "src/launch/releaseScopeQualificationJourney.test.ts",
  "src/launch/qualityEvalCustomerPaper.test.ts",
  "src/launch/ownerSignedAgreementPresentation.test.ts",
  "src/agreement/nPartySigning.test.ts",
  "src/launch/customerMeaningProductionPath.test.ts",
  "src/components/agreements/legalPartyRepresentativeBind.test.ts",
  "src/components/agreements/legalPartyIdentityClarification.test.ts",
  "src/components/agreements/paidProPartyEconomicRelationships.test.ts",
  "src/components/agreements/paidProMilestonePayer.test.ts",
  "src/components/agreements/paymentClarificationApplyRecovery.test.ts",
  "src/vs01/paidProTest465RecipientIsolation.test.ts",
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
