import type { PremiumMissingFactsResult } from "./premiumMissingFactsApi";
import { shouldSkipAskAndRenderImmediately, intakeRequiresClarification, getMissingTenetTopics } from "./proAgreementFiveTenets";

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
export function evaluateFiveTenetsPreflight(intakeText: string): PostCheckoutMissingFactsGateDecision {
  if (shouldSkipAskAndRenderImmediately(intakeText)) {
    return { action: "proceed_to_draft_five_tenets_complete" };
  }
  return { action: "await_gaps", questions: [] };
}

/**
 * Check if the intake is too sparse/casual and MUST ask LLM questions.
 * This blocks silent drafting for inputs like "tbd", "contract", "something about a deal".
 * Returns a list of topics to ask about if the intake needs clarification.
 */
export function getRequiredClarificationTopics(intakeText: string): string[] {
  if (!intakeRequiresClarification(intakeText)) {
    return [];
  }
  return getMissingTenetTopics(intakeText);
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
