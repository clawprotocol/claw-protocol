/**
 * Checkout-only: skip redundant premium parse when structured draft + intake are already sufficient
 * for premium-full-draft request assembly (no legal copy / merge behavior change).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { draftHasPlaceholderParties } from "./reviewPlaceholderGuard";
import type { PremiumGenerationCallReason } from "./paidProPremiumGenerationCallAudit";
import { evaluatePremiumDraftQuality } from "./premiumDraftTransform";

const nz = (s: string | null | undefined) => (s || "").trim();

export type CheckoutPremiumParseSkipInput = {
  premiumGenerationCallReason?: PremiumGenerationCallReason;
  structuredDraft: ParsedDraftShape;
  rawIntake: string;
};

/** True when initial parseDraft can be replaced by structured snapshot for checkout completion. */
export function shouldSkipCheckoutPremiumParseBeforeFullDraft(
  input: CheckoutPremiumParseSkipInput,
): boolean {
  if (input.premiumGenerationCallReason !== "checkout_completion") return false;
  const raw = nz(input.rawIntake);
  if (raw.length < 48) return false;
  if (draftHasPlaceholderParties(input.structuredDraft)) return false;
  const purpose = nz(input.structuredDraft.purpose);
  const payment = nz(input.structuredDraft.payment_terms);
  if (purpose.length < 24 || payment.length < 12) return false;
  const quality = evaluatePremiumDraftQuality(input.structuredDraft, raw);
  return quality.ok;
}

/** Structured draft stands in for parse output when skip policy applies. */
export function resolveCheckoutPremiumParseSubstitute(
  structuredDraft: ParsedDraftShape,
): ParsedDraftShape {
  return { ...structuredDraft };
}
