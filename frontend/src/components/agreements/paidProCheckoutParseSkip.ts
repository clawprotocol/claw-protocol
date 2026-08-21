/**
 * Checkout-only: skip redundant premium parse and reuse the pre-pay starter.
 * Thin dumps that trigger the 2–5 asks (Mike-only) fail placeholder/quality gates;
 * a fresh premium parse then overwrites the painted one-pager because raw intake
 * is < 120 chars. userGapAnswers still ride the full-draft POST.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumGenerationCallReason } from "./paidProPremiumGenerationCallAudit";

export type CheckoutPremiumParseSkipInput = {
  premiumGenerationCallReason?: PremiumGenerationCallReason;
  structuredDraft: ParsedDraftShape;
  rawIntake: string;
};

/** True when initial parseDraft can be replaced by structured snapshot for checkout completion. */
export function shouldSkipCheckoutPremiumParseBeforeFullDraft(
  input: CheckoutPremiumParseSkipInput,
): boolean {
  return input.premiumGenerationCallReason === "checkout_completion";
}

/** Structured draft stands in for parse output when skip policy applies. */
export function resolveCheckoutPremiumParseSubstitute(
  structuredDraft: ParsedDraftShape,
): ParsedDraftShape {
  return { ...structuredDraft };
}
