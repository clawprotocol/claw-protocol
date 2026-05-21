import type { MaterialMissingItem } from "../proAgreementCompleteness/types";
import { getCurrentVariable } from "./guidedCompletionEngine";
import type { DealVariable, GuidedCompletionSession } from "./types";

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
  return "Ready to review — add any final edits below.";
}
