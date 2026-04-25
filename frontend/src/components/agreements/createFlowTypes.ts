/**
 * Explicit production phases for simple two-pane create — do not collapse or reuse copy across phases.
 */
export type CreateFlowProductionPhase =
  | "capturing_input"
  | "generating_draft"
  | "complexity_choice_required"
  | "draft_ready_for_review"
  | "recipient_setup_required"
  | "ready_to_send";

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
    case "recipient_setup_required":
      return "Continue to send";
    case "ready_to_send":
      return "Send";
  }
  return "";
}
