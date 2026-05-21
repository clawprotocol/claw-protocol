/**
 * Single source of truth: guided UX copy and readiness may only reference
 * questions "below" when this returns true.
 */

import { getCurrentVariable } from "./guidedCompletionEngine";
import type { GuidedCompletionSession } from "./types";
import { variableHasSelectableAnswerPath } from "./shouldRenderGuidedCompletionPanel";

export type CanRenderGuidedQuestionsArgs = {
  bodyUsable: boolean;
  session: GuidedCompletionSession | null | undefined;
  /** When false, never claim questions are visible (e.g. panel not mounted on this surface). */
  guidedPanelMounted?: boolean;
};

export function computeCanRenderGuidedQuestions(args: CanRenderGuidedQuestionsArgs): boolean {
  if (args.guidedPanelMounted === false) return false;
  if (!args.bodyUsable) return false;
  const session = args.session;
  if (!session || session.queue.length === 0) return false;

  const hasUnresolved = session.queue.some(
    (id) => !session.answered[id] && !session.skipped.has(id),
  );
  if (!hasUnresolved) return false;

  const current = getCurrentVariable(session);
  if (!current) return false;

  return variableHasSelectableAnswerPath(current) && current.question.trim().length > 8;
}

export const GUIDED_NEUTRAL_REVIEW_COPY =
  "Draft ready to review — add any final edits below.";

export const GUIDED_NEUTRAL_REVIEW_TITLE = "Draft ready to review.";

/** Heading shown only when guided questions are mounted directly below. */
export function guidedCompletionHeading(canRender: boolean): string {
  return canRender ? "Complete your agreement" : GUIDED_NEUTRAL_REVIEW_TITLE;
}

export function guidedCompletionSubcopy(canRender: boolean): string {
  return canRender
    ? "Finish a few business decisions — we'll update your draft as you go."
    : GUIDED_NEUTRAL_REVIEW_COPY;
}

export function mayShowNeedsDetailsMessaging(
  canRender: boolean,
  readiness: "needs_details" | "good_draft" | "ready_for_review" | "ready_for_signature",
): boolean {
  return canRender && readiness === "needs_details";
}

export function mayShowCompleteAgreementBelowCopy(canRender: boolean): boolean {
  return canRender;
}

export function finalizeTaglineForGuidedState(
  missingCount: number,
  readiness: "needs_details" | "good_draft" | "ready_for_review" | "ready_for_signature",
  canRender: boolean,
): string {
  if (!canRender && readiness === "needs_details") {
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
  if (!canRender) {
    return GUIDED_NEUTRAL_REVIEW_COPY;
  }
  return missingCount > 0
    ? "Tighten the items below, then update the agreement or pick a path."
    : "Strong draft created.";
}
