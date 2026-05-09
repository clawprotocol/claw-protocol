/**
 * Signer-facing compare confidence (no engine jargon).
 */

export type RecipientCompareConfidenceLevel = "high" | "medium" | "low";

export type RecipientCompareConfidence = {
  level: RecipientCompareConfidenceLevel;
  /** e.g. "Compare confidence: High" */
  headline: string;
  /** One calm sentence — no anchor / hash / dedupe / placement wording. */
  body: string;
};

export type RecipientCompareConfidenceInput = {
  artifactsRemovedCount: number;
  paymentTermsInlinePlacementFailed: boolean;
  recipientIntentGapCount: number;
  usedNoisyReviseGuard: boolean;
  hasLargeBlockFallbackReason: boolean;
  segmentCount: number;
  changedBlockCount: number;
  insertCount: number;
  deleteCount: number;
};

function headlineFor(level: RecipientCompareConfidenceLevel): string {
  if (level === "high") return "Compare confidence: High";
  if (level === "medium") return "Compare confidence: Medium";
  return "Compare confidence: Needs review";
}

function bodyFor(level: RecipientCompareConfidenceLevel): string {
  if (level === "high") {
    return "Major sections matched successfully.";
  }
  if (level === "medium") {
    return "Some rewritten sections were grouped for readability.";
  }
  return "Some sections are easier to read in summary. Open Audit mode if you want every insertion and deletion.";
}

/**
 * Derives a simple high / medium / low signal from compare + import metadata.
 */
export function buildRecipientCompareConfidence(input: RecipientCompareConfidenceInput): RecipientCompareConfidence {
  const {
    artifactsRemovedCount,
    paymentTermsInlinePlacementFailed,
    recipientIntentGapCount,
    usedNoisyReviseGuard,
    hasLargeBlockFallbackReason,
    segmentCount,
    changedBlockCount,
    insertCount,
    deleteCount,
  } = input;

  const noisySegments = segmentCount >= 120 || insertCount + deleteCount >= 90;
  const manyGaps = recipientIntentGapCount >= 3;
  const someGaps = recipientIntentGapCount >= 1;
  const heavyRewriteSignals = usedNoisyReviseGuard || hasLargeBlockFallbackReason || changedBlockCount >= 18;

  let level: RecipientCompareConfidenceLevel = "high";

  if (paymentTermsInlinePlacementFailed || manyGaps || (someGaps && noisySegments)) {
    level = "low";
  } else if (
    artifactsRemovedCount > 0 ||
    heavyRewriteSignals ||
    someGaps ||
    noisySegments ||
    changedBlockCount >= 10
  ) {
    level = "medium";
  }

  return {
    level,
    headline: headlineFor(level),
    body: bodyFor(level),
  };
}
