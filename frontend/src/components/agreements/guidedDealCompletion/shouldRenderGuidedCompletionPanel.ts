import type { MaterialMissingItem } from "../proAgreementCompleteness/types";
import { resolveGuidedCompletionRenderState } from "./resolveGuidedCompletionRenderState";
import type { DealVariable, GuidedCompletionSession } from "./types";
import { isUserAnswerableGuidedQuestion } from "./userAnswerableGuidedQuestion";

export {
  computeCanRenderGuidedQuestions,
  resolveGuidedCompletionRenderState,
  countUnresolvedRenderableVariables,
  logGuidedRenderState,
  warnGuidedInvariantViolation,
} from "./resolveGuidedCompletionRenderState";
export type {
  GuidedCompletionRenderState,
  GuidedPanelMountedSurface,
  GuidedReadinessLabel,
  ResolveGuidedCompletionRenderStateArgs,
} from "./resolveGuidedCompletionRenderState";

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
  return isUserAnswerableGuidedQuestion(variable);
}

/** True only when the guided panel can show a real, actionable question (session capability; not mount truth). */
export function shouldRenderGuidedCompletionPanel(args: ShouldRenderGuidedCompletionPanelArgs): boolean {
  return resolveGuidedCompletionRenderState({
    bodyUsable: args.bodyUsable,
    bodyText: args.body,
    intakeText: args.intakeRaw,
    materialMissingItems: args.materialItems,
    guidedSession: args.session,
    panelMountedSurface: "document_editor",
  }).sessionHasRenderableQueue;
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
  return "Draft ready to review — add any final edits below.";
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
  const panelRenderable = resolveGuidedCompletionRenderState({
    bodyUsable,
    guidedSession: args.session,
    panelMountedSurface: "document_editor",
  }).sessionHasRenderableQueue;
  const displayReadiness = resolveDisplayReadinessWithGuidedInvariant(args.readiness, panelRenderable);
  return {
    displayReadiness,
    panelRenderable,
    showNeedsDetailsMessaging: panelRenderable && displayReadiness === "needs_details",
  };
}
