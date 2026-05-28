import { computeGuidedVisibleQuestionAccounting } from "./guidedVisibleQuestionAccounting";
import type { DealVariable, GuidedCompletionSession } from "./types";

export const INTERNAL_GUIDED_REPAIR_VARIABLE_ID = "agreement_validation_repair_needed";

/** Internal repair / finalization state — never show as a guided question card. */
export function isInternalGuidedRepairVariable(variable: DealVariable): boolean {
  return (
    variable.id === INTERNAL_GUIDED_REPAIR_VARIABLE_ID ||
    variable.semanticIntent === "validation_repair_needed"
  );
}

/** True only for material user-facing clarification (missing term, conflict, specificity). */
export function isUserAnswerableGuidedQuestion(variable: DealVariable): boolean {
  if (isInternalGuidedRepairVariable(variable)) return false;
  const question = variable.question.trim();
  if (question.length <= 8) return false;
  if (variable.uiControlType === "pills") {
    const pills = variable.suggestedDefaults.filter((p) => p.id !== "recommend");
    return (
      pills.some((p) => p.id === "custom") ||
      pills.some((p) => (p.value || p.label).trim().length > 0)
    );
  }
  return true;
}

export function filterUserAnswerableGuidedVariables(variables: readonly DealVariable[]): DealVariable[] {
  return variables.filter(isUserAnswerableGuidedQuestion);
}

/** Drop internal repair pseudo-questions from a persisted or merged guided session. */
/** True when the guided panel should show intro copy or questions. */
export function shouldShowGuidedSessionIntro(session: GuidedCompletionSession | null | undefined): boolean {
  if (!session?.queue?.length) return false;
  return computeGuidedVisibleQuestionAccounting(session).visibleQuestionCount > 0;
}

export function stripNonAnswerableFromGuidedSession(
  session: GuidedCompletionSession | null | undefined,
): GuidedCompletionSession | null {
  if (!session) return null;
  const variables = filterUserAnswerableGuidedVariables(session.variables);
  const allowed = new Set(variables.map((v) => v.id));
  const queue = session.queue.filter((id) => allowed.has(id));
  if (!queue.length || !variables.length) return null;
  return {
    ...session,
    variables,
    queue,
    frozenTotalQuestions: session.frozenTotalQuestions
      ? Math.min(session.frozenTotalQuestions, queue.length)
      : queue.length,
  };
}
