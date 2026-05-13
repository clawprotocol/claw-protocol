/**
 * Semantic suppression for payment / compensation extraction & rendering.
 *
 * Confidentiality / NDA / proprietary-info tokens must NEVER populate the
 * Payment Terms field. This guard is shared by extraction (intakeStructuredAgreementModel)
 * and rendering (intakeSmartDefaults, intakeFamilyShell, premium pipelines).
 *
 * Regression spec §4 — observed bug: Payment Terms was rendering "Mutual confidentiality"
 * when intake described an NDA without payment.
 */

const NON_PAYMENT_SEMANTIC_TOKENS =
  /\b(?:confidential(?:ity)?|nda|non[-\s]?disclosure|proprietary(?:\s+info(?:rmation)?)?|trade\s+secrets?|mutual\s+confidentiality|disclosing\s+party|receiving\s+party)\b/i;

/**
 * True when a candidate payment string contains no confidentiality-style tokens
 * and may be safely surfaced in the Payment Terms section.
 *
 * Empty strings return true (caller is expected to also short-circuit on empty).
 */
export function isPaymentSemanticallySafe(candidate: string | null | undefined): boolean {
  const t = (candidate || "").trim();
  if (!t) return true;
  if (NON_PAYMENT_SEMANTIC_TOKENS.test(t)) return false;
  return true;
}

/**
 * Neutral fallback used when payment extraction is empty AND no candidate text
 * is semantically safe — preferred over silently reusing unrelated extracted text.
 */
export const NO_PAYMENT_NEUTRAL_FALLBACK =
  "No fees unless the parties document compensation in a separate writing or amendment.";
