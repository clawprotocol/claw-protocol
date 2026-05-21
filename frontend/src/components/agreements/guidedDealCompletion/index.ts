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
export { suggestedDefaultsForVariable } from "./suggestedDefaultsEngine";
export {
  buildGuidedSessionFromAgreement,
  getCurrentVariable,
  applyGuidedAnswer,
  applyGuidedAnswerTransaction,
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
export type { CanRenderGuidedQuestionsArgs } from "./canRenderGuidedQuestions";
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
