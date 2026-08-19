import type { PremiumMissingFactsResult } from "./premiumMissingFactsApi";

/**
 * Decision outcome for the post-checkout missing-facts gate.
 */
export type PostCheckoutMissingFactsGateDecision =
  | { action: "await_gaps"; questions: string[] }
  | { action: "proceed_to_draft" }
  | { action: "fail_closed"; reason: string };

/**
 * Evaluate the post-checkout missing-facts gate decision.
 *
 * Rules:
 * - If the API call succeeded and returned 1+ questions → block on awaiting_gaps
 * - If the API call succeeded and returned 0 questions → proceed to draft
 * - If the API call failed (error) → fail closed, do not draft
 *
 * This gate ensures incomplete intake (NEEDS_CLARIFICATION) does not proceed
 * to premium-full-draft without user clarification.
 */
export function evaluatePostCheckoutMissingFactsGate(input: {
  apiResult: PremiumMissingFactsResult | null;
  apiError: Error | null;
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
    return {
      action: "await_gaps",
      questions: questions.slice(0, 5),
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
  return decision.action === "proceed_to_draft";
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
