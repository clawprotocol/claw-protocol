/**
 * Explicit production phases for simple two-pane create — do not collapse or reuse copy across phases.
 */
export type CreateFlowProductionPhase =
  | "capturing_input"
  | "generating_draft"
  | "complexity_choice_required"
  | "draft_ready_for_review"
  | "updated_agreement_ready"
  | "guided_final_review"
  | "recipient_setup_required"
  | "ready_to_send";

export function isGuidedFinalReviewPhase(phase: CreateFlowProductionPhase): boolean {
  return phase === "guided_final_review";
}

export function isUpdatedAgreementReadyPhase(phase: CreateFlowProductionPhase): boolean {
  return phase === "updated_agreement_ready";
}

export function isCreateFlowPastCapture(phase: CreateFlowProductionPhase): boolean {
  return (
    phase !== "capturing_input" &&
    phase !== "generating_draft" &&
    phase !== "complexity_choice_required"
  );
}

export function createFlowPrimaryCtaLabel(phase: CreateFlowProductionPhase): string {
  switch (phase) {
    case "capturing_input":
      return "Create Draft";
    case "generating_draft":
      return "";
    case "complexity_choice_required":
      return "";
    case "draft_ready_for_review":
      return "Continue";
    case "updated_agreement_ready":
      return "Review updated agreement";
    case "guided_final_review":
      return "Continue to signing";
    case "recipient_setup_required":
      return "Continue to send";
    case "ready_to_send":
      return "Send";
  }
  return "";
}
