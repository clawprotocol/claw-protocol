/**
 * Explicit review flow states for guided Pro completion UX orientation.
 */

import type { GuidedCompletionPhase } from "./guidedCompletionPhase";

export type GuidedReviewFlowStateId =
  | "draft_generated"
  | "updates_queued"
  | "applying_updates"
  | "agreement_updated"
  | "ready_for_signature";

export type GuidedReviewFlowState = {
  id: GuidedReviewFlowStateId;
  label: string;
  detail: string | null;
};

export function resolveGuidedReviewFlowState(args: {
  guidedActive: boolean;
  phase: GuidedCompletionPhase;
  signersReady?: boolean;
}): GuidedReviewFlowState {
  if (!args.guidedActive) {
    return {
      id: "draft_generated",
      label: "Draft generated",
      detail: null,
    };
  }
  if (args.phase === "applying_all") {
    return {
      id: "applying_updates",
      label: "Updating your Pro agreement…",
      detail: "Applying your answers to the full agreement.",
    };
  }
  if (args.phase === "applied") {
    if (args.signersReady) {
      return {
        id: "ready_for_signature",
        label: "Ready for signature",
        detail: "Signing version ready",
      };
    }
    return {
      id: "agreement_updated",
      label: "Your updated Pro agreement is ready.",
      detail: "Review the improved agreement before sharing it for review or signature.",
    };
  }
  if (args.phase === "failed") {
    return {
      id: "updates_queued",
      label: "Update needed",
      detail: "Retry to apply your queued answers",
    };
  }
  if (args.phase === "ready_to_apply") {
    return {
      id: "updates_queued",
      label: "Updates queued",
      detail: "Applying your agreement now…",
    };
  }
  return {
    id: "updates_queued",
    label: "Updates queued",
    detail: "One authoritative update when you finish the questions",
  };
}

export function logGuidedReviewFlowState(state: GuidedReviewFlowState, phase: GuidedCompletionPhase): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-review-flow-state]", { id: state.id, label: state.label, phase });
}
