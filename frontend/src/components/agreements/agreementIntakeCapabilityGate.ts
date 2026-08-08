/**
 * Create-draft intake capability gate (product-wide).
 * Implementation lives in agreementIntakeClarification — guided remediation
 * for counsel-prep, sparse, missing parties, and ambiguous intakes.
 */
export {
  assessAgreementIntakeCapability,
  buildAgreementIntakeClarification,
  evaluateIntentionalCreateDraftSubmit,
  type AgreementIntakeCapabilityDecision,
  type AgreementIntakeClarification,
  type AgreementIntakeClarificationKind,
  type IntentionalCreateDraftSubmitDecision,
} from "./agreementIntakeClarification";
