export type {
  DealVariable,
  DealVariableCategory,
  DealVariableSeverity,
  GuidedCompletionSession,
  GuidedCompletionIntro,
} from "./types";
export { extractDealVariables, dealVariablesFromMaterialItems } from "./missingVariableExtractor";
export {
  prioritizeDealVariables,
  buildGuidedQueue,
  computeCompletenessPercent,
  createGuidedCompletionSession,
} from "./variablePrioritizationLayer";
export {
  buildStableGuidedQuestionQueue,
  mergeStableGuidedQueue,
  logGuidedQuestionQueueBuilt,
  logGuidedQuestionDedupe,
  logGuidedQuestionRepeatBlocked,
} from "./guidedQuestionQueue";
export { suggestedDefaultsForVariable } from "./suggestedDefaultsEngine";
export {
  buildGuidedSessionFromAgreement,
  getCurrentVariable,
  applyGuidedAnswer,
  applyGuidedAnswerTransaction,
  clearGuidedAnswer,
  computeGuidedCollectionProgress,
  withGuidedDraftProgress,
  skipGuidedVariable,
  formatRefineInstructionForAnswer,
  isGuidedCompletionComplete,
  resolveGuidedCurrentIndex,
  guidedSessionIntro,
  importantVariableCount,
  whatChangedLineForGuidedVariable,
  normalizeWhatChangedDisplayLine,
  frozenQuestionTotal,
} from "./guidedCompletionEngine";
export { resolveGuidedAnswerForPill, GUIDED_SHARED_IP_STRUCTURED_ANSWER } from "./guidedAnswerResolution";
export {
  buildGuidedSessionKey,
  readPersistedGuidedSession,
  persistGuidedSession,
  clearPersistedGuidedSession,
  mergeGuidedSessionWithPersistence,
  mergeGuidedSessionOnBaseRefresh,
  supplementGuidedSessionFromBase,
  preserveGuidedSessionProgress,
  preserveGuidedSessionDuringCollection,
  freezeGuidedSessionAfterApply,
  lockGuidedSession,
} from "./guidedSessionPersistence";
export { applyProBodyHardIntegrityGate, normalizeScheduleAContent } from "./proBodyHardIntegrityGate";
export { applyClauseCoherenceEngine } from "./clauseCoherenceEngine";
export { validateAgreementIntegrity } from "./agreementIntegrityValidator";
export {
  GUIDED_COMPLETION_HEADING,
  GUIDED_COMPLETION_SUBHEADING,
  GUIDED_CUSTOM_INSTRUCTION_PLACEHOLDER,
  friendlyLowConfidenceCopy,
  sanitizeProUserMessage,
  shouldPreferGuidedCompletionOverRetry,
} from "./friendlyProCompletionCopy";
export { GuidedDealCompletionPanel } from "./GuidedDealCompletionPanel";
export type { GuidedCompletionPhase } from "./guidedCompletionPhase";
export { guidedPhaseSuppressesSendCta, guidedPhaseBlocksDocumentSwap } from "./guidedCompletionPhase";
export { resolveImplementationPreview } from "./guidedImplementationPreview";
export {
  resolveGuidedQuestionConfig,
  resolveOptionDisplayCopy,
  buildBulkApplyChecklist,
  buildFinalAppliedAreaLabels,
  normalizeWhyText,
  resolveQuestionNumber,
} from "./guidedQuestionConfig";
export { GuidedQuestionOptionCard } from "./GuidedQuestionOptionCard";
export { GuidedBulkApplyChecklist } from "./GuidedBulkApplyChecklist";
export { GuidedAppliedAreasSummary } from "./GuidedAppliedAreasSummary";
export {
  buildConsolidatedGuidedRegenerationPrompt,
  buildAppliedChangesFromSession,
  validateGuidedBulkRegeneration,
  GUIDED_BULK_FAIL_USER_MESSAGE,
  sessionReadyForBulkApply,
  logGuidedAllAnswersReady,
  logGuidedBulkRegenerationStart,
  logGuidedBulkRegenerationSuccess,
  logGuidedBulkRegenerationFailed,
} from "./guidedBulkRegeneration";
export type { GuidedAnswerMeta } from "./types";
export type { GuidedAppliedChange } from "./guidedChangeTypes";
export { GuidedChangeCard } from "./GuidedChangeCard";
export { GuidedAppliedChangesReview } from "./GuidedAppliedChangesReview";
export {
  resolveGuidedQuestionTarget,
  buildSectionOnlyRefineInstruction,
  findSectionAnchor,
  computeChangedSectionRange,
  validateGuidedPatchPlacement,
  buildGuidedChangeSummary,
  resolveRecommendReasonForPill,
  GUIDED_PLACEMENT_RETRY_USER_MESSAGE,
  logGuidedRefineTargetResolved,
  logGuidedRefinePlacementAccepted,
  logGuidedRefinePlacementRejected,
  logGuidedRefineAnchorFound,
  logGuidedRefineAnchorMissing,
} from "./guidedRevisionAnchors";
export {
  captureGuidedScrollSnapshot,
  restoreGuidedScrollSnapshot,
  runWithGuidedScrollPreserved,
  highlightGuidedSectionInDocument,
  highlightAllGuidedChangedSections,
} from "./guidedSectionScroll";
export {
  reinforceGuidedQueuedUpdate,
  reinforceGuidedAuthoritativeApply,
  formatGuidedQueuedToast,
  formatGuidedAuthoritativeUpdatedToast,
} from "./guidedAnswerCausality";
export { GuidedAgreementUpdateSummary } from "./GuidedAgreementUpdateSummary";
export { GuidedReviewFlowBanner } from "./GuidedReviewFlowBanner";
export { GuidedSigningTrustStrip } from "./GuidedSigningTrustStrip";
export {
  resolveGuidedReviewFlowState,
  logGuidedReviewFlowState,
  type GuidedReviewFlowState,
  type GuidedReviewFlowStateId,
} from "./guidedReviewFlowState";
export {
  fingerprintAgreementBody,
  readSigningPacketGuidedVersion,
  readSigningPacketPrepSnapshot,
  markSigningPacketPreparedAtGuidedVersion,
  invalidateSigningPacketPrep,
  resolveSigningPacketStale,
  isSigningPacketStaleForGuidedVersion,
  logGuidedPacketInvalidated,
  logGuidedPacketStaleHardStop,
  logGuidedPacketVersionMismatch,
} from "./guidedSigningPacketVersion";
export { deriveGuidedUxPhaseFlags, logGuidedStateTransition } from "./guidedUxStability";
export { assessGuidedMutationStrength } from "./guidedMutationQuality";
export { reviewGuidedUpdatesAtIndex } from "./guidedSectionScroll";
export { materialRewriteHintForGuidedAnswer } from "./guidedBulkRegeneration";
export { buildClauseUpdatesForVariable } from "./guidedQuestionConfig";
export {
  resolveProReviewFooterState,
  logProReviewFooterState,
  type ProReviewFooterMode,
  type ProReviewFooterState,
  type ResolveProReviewFooterStateArgs,
} from "./resolveProReviewFooterState";
export { isAutomationServicesIntake } from "./servicesMigrationGuidedIntake";
export {
  shouldRenderGuidedCompletionPanel,
  shouldShowGuidedNeedsDetailsMessaging,
  variableHasSelectableAnswerPath,
  resolveDisplayReadinessWithGuidedInvariant,
  guidedCompletionNeutralCopyWhenNotRenderable,
  guidedQueueHasRenderableQuestion,
  enforceNeedsDetailsGuidedInvariant,
} from "./shouldRenderGuidedCompletionPanel";
export {
  computeCanRenderGuidedQuestions,
  GUIDED_NEUTRAL_REVIEW_COPY,
  GUIDED_NEUTRAL_REVIEW_TITLE,
  guidedCompletionHeading,
  guidedCompletionSubcopy,
  mayShowNeedsDetailsMessaging,
  mayShowCompleteAgreementBelowCopy,
  finalizeTaglineForGuidedState,
} from "./canRenderGuidedQuestions";
export {
  resolveGuidedCompletionRenderState,
  applyRawReadinessToGuidedRenderState,
  countUnresolvedRenderableVariables,
  logGuidedRenderState,
  warnGuidedInvariantViolation,
} from "./resolveGuidedCompletionRenderState";
export {
  GUIDED_MIN_AUTHORITATIVE_BODY_LEN,
  canDisplayPaidProAgreementDuringGuided,
  logGuidedQuestionApply,
  logGuidedReviewTransition,
  logGuidedSignTransition,
  resolveGuidedCompletionRenderDocument,
  shouldBlockProEmptyDocumentFallback,
  updateLastKnownGoodAuthoritativeDraftRef,
  type GuidedRenderDocumentResolution,
  type GuidedRenderDocumentSource,
} from "./guidedCompletionRenderAuthority";
export type {
  GuidedCompletionRenderState,
  GuidedPanelMountedSurface,
  GuidedReadinessLabel,
  ResolveGuidedCompletionRenderStateArgs,
} from "./resolveGuidedCompletionRenderState";
export { scanBodyMaterialPlaceholders, bodyHasLoosePhaseScheduleBeforeSignatures } from "./bodyMaterialPlaceholderScanner";
export {
  analyzeServicesMigrationIntake,
  isServicesMigrationIntake,
} from "./servicesMigrationGuidedIntake";
export {
  detectSemanticContractGaps,
  semanticGapsToMaterialItems,
  computeSemanticIncompleteScore,
  hasSemanticMaterialGaps,
  semanticGapScanLines,
} from "./semanticContractCompleteness";
export { detectContradictoryTerms, detectIpOwnershipContradiction, detectTermStructureContradiction } from "./detectContradictoryTerms";
export { isContractorDeveloperIntake } from "./contractorGuidedIntake";
