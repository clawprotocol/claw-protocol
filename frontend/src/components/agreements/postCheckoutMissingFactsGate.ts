import type { PremiumMissingFactsResult } from "./premiumMissingFactsApi";
import {
  shouldSkipAskAndRenderImmediately,
  getRequiredClarificationTopics,
  buildLocalMissingTenetQuestions,
  filterAskedTenetQuestionsAgainstOriginalIntake,
  type FiveTenetDraftInput,
} from "./proAgreementFiveTenets";

export {
  getRequiredClarificationTopics,
  buildLocalMissingTenetQuestions,
  filterAskedTenetQuestionsAgainstOriginalIntake,
} from "./proAgreementFiveTenets";
export type { FiveTenetDraftInput } from "./proAgreementFiveTenets";

/**
 * Decision outcome for the post-checkout missing-facts gate.
 */
export type PostCheckoutMissingFactsGateDecision =
  | { action: "await_gaps"; questions: string[] }
  | { action: "proceed_to_draft" }
  | { action: "proceed_to_draft_five_tenets_complete" }
  | { action: "fail_closed"; reason: string };

/**
 * Evaluate the post-checkout missing-facts gate decision.
 *
 * Rules:
 * - If the API call succeeded and returned 1+ questions → block on awaiting_gaps
 * - If the API call succeeded and returned 0 questions, but local missing tenets remain → await_gaps
 * - If the API call succeeded and returned 0 questions and no local missing tenets → proceed to draft
 * - If the API call failed (error) → fail closed, do not draft
 *
 * This gate ensures incomplete intake (NEEDS_CLARIFICATION) does not proceed
 * to premium-full-draft without user clarification.
 */
export function evaluatePostCheckoutMissingFactsGate(input: {
  apiResult: PremiumMissingFactsResult | null;
  apiError: Error | null;
  localTopics?: string[];
  localQuestions?: string[];
  intakeText?: string;
  draft?: FiveTenetDraftInput | null;
}): PostCheckoutMissingFactsGateDecision {
  const { apiResult, apiError } = input;

  if (apiError !== null) {
    return {
      action: "fail_closed",
      reason: `missing_facts_api_error: ${apiError.message || "unknown"}`,
    };
  }

  if (apiResult === null) {
    return {
      action: "fail_closed",
      reason: "missing_facts_api_null_result",
    };
  }

  const questions = apiResult.questions;

  if (!Array.isArray(questions)) {
    return {
      action: "fail_closed",
      reason: "missing_facts_questions_not_array",
    };
  }

  if (questions.length > 0) {
    const filtered = filterAskedTenetQuestionsAgainstOriginalIntake(
      questions,
      input.intakeText || "",
      input.draft,
    );
    if (filtered.length === 0) {
      return { action: "proceed_to_draft" };
    }
    return {
      action: "await_gaps",
      questions: filtered.slice(0, 5),
    };
  }

  const localTopics =
    (input.localTopics && input.localTopics.length
      ? input.localTopics
      : input.intakeText != null
        ? getRequiredClarificationTopics(input.intakeText, input.draft)
        : []) || [];
  if (localTopics.length > 0) {
    const localQuestions = (
      input.localQuestions && input.localQuestions.length
        ? input.localQuestions
        : buildLocalMissingTenetQuestions(input.intakeText || "", input.draft)
    ).slice(0, 5);
    return {
      action: "await_gaps",
      questions: localQuestions.length ? localQuestions : localTopics.slice(0, 5),
    };
  }

  return { action: "proceed_to_draft" };
}

/**
 * Check if the gate decision allows proceeding to premium-full-draft.
 */
export function shouldProceedToDraft(
  decision: PostCheckoutMissingFactsGateDecision,
): boolean {
  return decision.action === "proceed_to_draft" || decision.action === "proceed_to_draft_five_tenets_complete";
}

/**
 * Evaluate if all five tenets are present in the intake text.
 * When all five tenets (parties, scope, payment, term, governing law) are present,
 * we can skip the missing-facts API call and proceed directly to rendering.
 *
 * Five Tenets of a Complete Pro Agreement:
 * 1. Parties (2–4 named)
 * 2. Scope / what the deal is
 * 3. Payment / consideration
 * 4. Term / duration
 * 5. Governing law
 *
 * For sparse/casual intakes that clearly need clarification, we return a signal
 * to force the LLM ask even if the API returns no questions.
 */
export function evaluateFiveTenetsPreflight(
  intakeText: string,
  draft?: FiveTenetDraftInput | null,
): PostCheckoutMissingFactsGateDecision {
  if (shouldSkipAskAndRenderImmediately(intakeText, draft)) {
    return { action: "proceed_to_draft_five_tenets_complete" };
  }
  const questions = buildLocalMissingTenetQuestions(intakeText, draft).slice(0, 5);
  return { action: "await_gaps", questions };
}

/**
 * Check if the gate decision requires showing the gap questions modal.
 */
export function shouldShowGapQuestions(
  decision: PostCheckoutMissingFactsGateDecision,
): decision is { action: "await_gaps"; questions: string[] } {
  return decision.action === "await_gaps";
}

/**
 * Check if the gate decision is a fail-closed error state.
 */
export function isFailClosedDecision(
  decision: PostCheckoutMissingFactsGateDecision,
): decision is { action: "fail_closed"; reason: string } {
  return decision.action === "fail_closed";
}
