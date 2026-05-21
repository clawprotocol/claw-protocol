import type { MaterialMissingItem } from "../proAgreementCompleteness/types";
import { computeCanRenderGuidedQuestions } from "./canRenderGuidedQuestions";
import type { DealVariable, GuidedCompletionSession } from "./types";

export { computeCanRenderGuidedQuestions } from "./canRenderGuidedQuestions";
export type { CanRenderGuidedQuestionsArgs } from "./canRenderGuidedQuestions";

export type ShouldRenderGuidedCompletionPanelArgs = {
  bodyUsable: boolean;
  session: GuidedCompletionSession | null | undefined;
  materialItems?: readonly MaterialMissingItem[];
  /** Optional — used only for future intake-only pre-checks; session must already include synthesized variables. */
  intakeRaw?: string | null;
  body?: string;
};

/** At least one pill (or custom path) can apply an answer. */
export function variableHasSelectableAnswerPath(variable: DealVariable): boolean {
  if (variable.uiControlType !== "pills") return variable.question.trim().length > 8;
  const pills = variable.suggestedDefaults.filter((p) => p.id !== "recommend");
  return (
    pills.some((p) => p.id === "custom") ||
    pills.some((p) => (p.value || p.label).trim().length > 0)
  );
}

/** True only when the guided panel can show a real, actionable question. */
export function shouldRenderGuidedCompletionPanel(args: ShouldRenderGuidedCompletionPanelArgs): boolean {
  return computeCanRenderGuidedQuestions({
    bodyUsable: args.bodyUsable,
    session: args.session,
    guidedPanelMounted: true,
  });
}

/** When false, callers must not show Needs-details / tighten-items / empty guided wrapper copy. */
export function shouldShowGuidedNeedsDetailsMessaging(panelRenderable: boolean): boolean {
  return panelRenderable;
}

/**
 * Hard invariant: "Needs details" messaging requires a renderable guided question.
 * Returns neutral readiness when the invariant would fail.
 */
export function resolveDisplayReadinessWithGuidedInvariant(
  readiness: "needs_details" | "good_draft" | "ready_for_review" | "ready_for_signature",
  panelRenderable: boolean,
): "needs_details" | "good_draft" | "ready_for_review" | "ready_for_signature" {
  if (readiness === "needs_details" && !panelRenderable) return "ready_for_review";
  return readiness;
}

export function guidedCompletionNeutralCopyWhenNotRenderable(): string {
  return "Draft ready to review — optional edits can still be made below.";
}

/** True when session has at least one unanswered, renderable question in the frozen queue. */
export function guidedQueueHasRenderableQuestion(session: GuidedCompletionSession | null | undefined): boolean {
  if (!session || session.queue.length === 0) return false;
  for (const id of session.queue) {
    if (session.answered[id] || session.skipped.has(id)) continue;
    const v = session.variables.find((x) => x.id === id);
    if (v && variableHasSelectableAnswerPath(v) && v.question.trim().length > 8) return true;
  }
  return false;
}

/**
 * Global invariant: NEEDS_DETAILS display requires a renderable guided queue (length >= 1).
 */
export function enforceNeedsDetailsGuidedInvariant(args: {
  readiness: "needs_details" | "good_draft" | "ready_for_review" | "ready_for_signature";
  session: GuidedCompletionSession | null | undefined;
  bodyUsable?: boolean;
}): {
  displayReadiness: "needs_details" | "good_draft" | "ready_for_review" | "ready_for_signature";
  panelRenderable: boolean;
  showNeedsDetailsMessaging: boolean;
} {
  const bodyUsable = args.bodyUsable ?? true;
  const panelRenderable = shouldRenderGuidedCompletionPanel({
    bodyUsable,
    session: args.session,
  });
  const displayReadiness = resolveDisplayReadinessWithGuidedInvariant(args.readiness, panelRenderable);
  return {
    displayReadiness,
    panelRenderable,
    showNeedsDetailsMessaging: panelRenderable && displayReadiness === "needs_details",
  };
}
