/**
 * Signer-facing compare confidence (no engine jargon).
 */

export type RecipientCompareConfidenceLevel = "high" | "medium" | "low";

/** Internal diagnostics — never shown verbatim to signers. */
export type RecipientCompareReasonCode =
  | "WHOLE_DOC_REWRITE"
  | "PDF_TEXT_LOW_STRUCTURE"
  | "CLAUSE_RELOCATED"
  | "HEAVY_REORDERING"
  | "LOW_ANCHOR_CONFIDENCE";

export type RecipientCompareConfidence = {
  level: RecipientCompareConfidenceLevel;
  /** e.g. "Compare confidence: High" */
  headline: string;
  /** One calm sentence — no anchor / hash / dedupe / placement wording. */
  body: string;
  /** Stable reason tags for analytics / PDF / UI supplements (not raw engine strings). */
  reasonCodes: readonly RecipientCompareReasonCode[];
  /** 0–2 calm lines for summary / PDF lead (no alarm tone). */
  gentleContextLines: readonly string[];
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
  /** Whole-document semantic replacement mode (heavy rewrite presentation). */
  wholeDocumentSemanticReplacement?: boolean;
  /** Low structural cues in extracted plain text (paragraphs / numbering). */
  pdfTextLowStructure?: boolean;
};

function headlineFor(level: RecipientCompareConfidenceLevel): string {
  if (level === "high") return "Compare confidence: High";
  if (level === "medium") return "Compare confidence: Medium";
  return "Compare confidence: Needs review";
}

function bodyFor(level: RecipientCompareConfidenceLevel): string {
  if (level === "high") {
    return "High-confidence read — versions line up cleanly for a standard review.";
  }
  if (level === "medium") {
    return "Take a moment to spot-check material sections. Related wording is summarized above.";
  }
  return "Take a moment to spot-check material sections. Related wording is summarized above.";
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
    wholeDocumentSemanticReplacement = false,
    pdfTextLowStructure = false,
  } = input;

  const noisySegments = segmentCount >= 120 || insertCount + deleteCount >= 90;
  const manyGaps = recipientIntentGapCount >= 3;
  const someGaps = recipientIntentGapCount >= 1;
  const heavyRewriteSignals = usedNoisyReviseGuard || hasLargeBlockFallbackReason || changedBlockCount >= 18;
  const heavyReorder =
    changedBlockCount >= 14 && insertCount + deleteCount >= 55 && segmentCount >= 70;

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

  const reasonCodes: RecipientCompareReasonCode[] = [];
  const gentle: string[] = [];

  if (hasLargeBlockFallbackReason || usedNoisyReviseGuard || wholeDocumentSemanticReplacement) {
    reasonCodes.push("WHOLE_DOC_REWRITE");
    gentle.push("Some revisions were reorganized substantially.");
  }
  if (pdfTextLowStructure) {
    reasonCodes.push("PDF_TEXT_LOW_STRUCTURE");
    gentle.push("Headings and section breaks may not match the PDF layout exactly.");
  }
  if (heavyReorder) {
    reasonCodes.push("HEAVY_REORDERING");
    gentle.push("This draft may contain relocated sections.");
  }
  if (hasLargeBlockFallbackReason && changedBlockCount >= 12) {
    reasonCodes.push("CLAUSE_RELOCATED");
  }
  if (paymentTermsInlinePlacementFailed || (someGaps && noisySegments)) {
    reasonCodes.push("LOW_ANCHOR_CONFIDENCE");
  }

  const dedupGentle = [...new Set(gentle.map((s) => s.trim()).filter(Boolean))].slice(0, 2);
  const dedupCodes = [...new Set(reasonCodes)];

  return {
    level,
    headline: headlineFor(level),
    body: bodyFor(level),
    reasonCodes: dedupCodes,
    gentleContextLines: dedupGentle,
  };
}
