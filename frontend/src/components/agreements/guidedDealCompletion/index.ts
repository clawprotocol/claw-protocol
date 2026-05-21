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
  skipGuidedVariable,
  formatRefineInstructionForAnswer,
  isGuidedCompletionComplete,
  guidedSessionIntro,
  importantVariableCount,
  whatChangedLineForGuidedVariable,
  frozenQuestionTotal,
} from "./guidedCompletionEngine";
export {
  buildGuidedSessionKey,
  readPersistedGuidedSession,
  persistGuidedSession,
  clearPersistedGuidedSession,
  mergeGuidedSessionWithPersistence,
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
