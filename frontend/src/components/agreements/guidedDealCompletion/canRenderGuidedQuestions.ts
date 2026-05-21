/**
 * User-facing copy helpers — gated by resolveGuidedCompletionRenderState.
 */

import type { FinalizeReadiness } from "../finalizeReadinessModel";
import type { GuidedCompletionRenderState } from "./resolveGuidedCompletionRenderState";

export {
  computeCanRenderGuidedQuestions,
  type GuidedCompletionRenderState,
  type GuidedPanelMountedSurface,
  type GuidedReadinessLabel,
  type ResolveGuidedCompletionRenderStateArgs,
  resolveGuidedCompletionRenderState,
  countUnresolvedRenderableVariables,
  logGuidedRenderState,
  warnGuidedInvariantViolation,
} from "./resolveGuidedCompletionRenderState";

export const GUIDED_NEUTRAL_REVIEW_COPY =
  "Draft ready to review — add any final edits below.";

export const GUIDED_NEUTRAL_REVIEW_TITLE = "Draft ready to review.";

export function guidedCompletionHeading(state: Pick<GuidedCompletionRenderState, "shouldShowCompleteAgreementHeading">): string {
  return state.shouldShowCompleteAgreementHeading ? "Complete your agreement" : GUIDED_NEUTRAL_REVIEW_TITLE;
}

export function guidedCompletionSubcopy(state: Pick<GuidedCompletionRenderState, "canRenderGuidedQuestions">): string {
  return state.canRenderGuidedQuestions
    ? "Finish a few business decisions — we'll update your draft as you go."
    : GUIDED_NEUTRAL_REVIEW_COPY;
}

export function mayShowNeedsDetailsMessaging(state: Pick<GuidedCompletionRenderState, "shouldShowNeedsDetails">): boolean {
  return state.shouldShowNeedsDetails;
}

export function mayShowCompleteAgreementBelowCopy(
  state: Pick<GuidedCompletionRenderState, "shouldShowUseCompleteBelowCopy">,
): boolean {
  return state.shouldShowUseCompleteBelowCopy;
}

export function finalizeTaglineForGuidedState(
  missingCount: number,
  readiness: FinalizeReadiness,
  state: Pick<GuidedCompletionRenderState, "canRenderGuidedQuestions" | "shouldShowNeedsDetails">,
): string {
  if (!state.canRenderGuidedQuestions && readiness === "needs_details") {
    return GUIDED_NEUTRAL_REVIEW_COPY;
  }
  if (readiness === "ready_for_signature") {
    return "You chose the signature path — add tweaks below if you need them.";
  }
  if (readiness === "ready_for_review") {
    return missingCount > 0
      ? "Close the remaining gaps, then move to review when you are ready."
      : "Strong draft — move to review or signature when you are ready.";
  }
  if (readiness === "good_draft") {
    return missingCount > 0 ? "A few things to double-check before you continue." : "Strong draft created.";
  }
  if (!state.canRenderGuidedQuestions) {
    return GUIDED_NEUTRAL_REVIEW_COPY;
  }
  return missingCount > 0
    ? "Tighten the items below, then update the agreement or pick a path."
    : "Strong draft created.";
}
