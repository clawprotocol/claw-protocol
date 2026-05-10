/**
 * Single entry-point classification for recipient revised-draft uploads.
 * Every file is assigned exactly one role before compare / notes routing.
 */

import {
  classifyRecipientRevisedDraftUpload,
  type ClassifyRecipientRevisedDraftUploadResult,
  hasStructuredAsks,
  scoreAgreementLikeStructure,
} from "./recipientRevisedDraftReviewerNotes";
import { recipientImportsMatchAuthoritativeBaseline, recipientBaselinePlainFromRenderedHtml } from "./recipientNoChangeCompareGuard";

export type RecipientUploadedDraftRole =
  | "SAME_AS_CURRENT_DRAFT"
  | "FULL_REVISED_AGREEMENT"
  | "CONDENSED_CLEAN_REVISED_AGREEMENT"
  | "REVIEW_NOTES_ONLY"
  | "INVALID_OR_TOO_LOW_SIGNAL";

export type ClassifyRecipientUploadedDraftRoleResult = {
  role: RecipientUploadedDraftRole;
  rawLen: number;
  bodyLen: number;
  reasons: string[];
  /** Agreement body passed to whole-doc preview / compare */
  agreementBodyForCompare: string;
  reviewerNotesForUi: string | null;
  /** When true, use clause-suggestion cards UI (legacy clause_suggestions). */
  preferClauseSuggestionSurface?: boolean;
  /** Legacy split (mixed notes + agreement) for instruction assembly */
  legacyClassification: ClassifyRecipientRevisedDraftUploadResult;
};

const OBLIGATION_RE =
  /\b(shall|must|will\s+not|may\s+not|agrees?\s+to|agreed|liable|liability|indemnif|confidential|termination|terminate|payment|fees?|fee\b|invoice|net\s*\d+|deliverable|ownership|intellectual\s+property|warranty|dispute|governing\s+law|effective\s+date)\b/gi;

const TITLEISH_RE =
  /\b(agreement|consulting\s+services|master\s+services|statement\s+of\s+work|revised\s+draft|amended\s+and\s+restated|non-disclosure|nda|saas|subscription)\b/i;

/** Numbered / lettered section headings common in contract PDFs (lenient vs reviewerNotes scorer). */
function countContractSectionHeadings(text: string): number {
  const t = text.replace(/\r\n/g, "\n");
  const a = (t.match(/(?:^|\n)\s*(?:article|section)\s+[ivxlcdm\d]+[^\n]{0,80}/gi) ?? []).length;
  const b = (t.match(/(?:^|\n)\s*\d{1,2}[.)]\s+[^\n]{8,120}/g) ?? []).length;
  return Math.max(a, b);
}

function countObligationHits(text: string): number {
  const m = text.match(OBLIGATION_RE);
  return m?.length ?? 0;
}

/**
 * Short “Sarah Collins–style” edited agreement: contract-shaped body that legacy heuristics
 * mis-route to review_notes_only when paired with a much longer baseline.
 */
export function looksLikeCondensedCleanRevisedAgreementArchetype(uploadedPlain: string): boolean {
  const t = uploadedPlain.replace(/\r\n/g, "\n").trim();
  if (t.length < 160) return false;
  const sections = countContractSectionHeadings(t);
  const oblig = countObligationHits(t);
  const titleish = TITLEISH_RE.test(t.slice(0, 600));
  const bulletsOnly = hasStructuredAsks(t) && sections < 2 && oblig < 4;
  if (bulletsOnly) return false;
  if (oblig >= 6 && sections >= 3) return true;
  if (titleish && oblig >= 5 && sections >= 2) return true;
  if (oblig >= 8 && t.length >= 220) return true;
  return false;
}

export type ClassifyRecipientUploadedDraftInput = {
  /** Latest authoritative render HTML (`/render` → `rendered_html`). */
  baselineRenderedHtml: string;
  /** Sanitized plain text from extraction (full upload). */
  uploadedSanitizedPlain: string;
  filename?: string | null;
};

/**
 * Classify upload **without** reading prior preview / redline state.
 */
export function classifyRecipientUploadedDraftRole(
  input: ClassifyRecipientUploadedDraftInput,
): ClassifyRecipientUploadedDraftRoleResult {
  const baselineHtml = String(input.baselineRenderedHtml ?? "").trim();
  const uploaded = String(input.uploadedSanitizedPlain ?? "").replace(/\r\n/g, "\n").trim();
  const rawLen = input.uploadedSanitizedPlain.length;
  const authoritativePlain = recipientBaselinePlainFromRenderedHtml(baselineHtml).trim() || " ";
  const legacy = classifyRecipientRevisedDraftUpload(authoritativePlain, uploaded);
  const agreementBodyForCompare = legacy.agreementText.trim() || uploaded;
  const bodyLen = agreementBodyForCompare.length;
  const reasons: string[] = [];

  if (!uploaded) {
    return {
      role: "INVALID_OR_TOO_LOW_SIGNAL",
      rawLen,
      bodyLen: 0,
      reasons: ["empty_upload"],
      agreementBodyForCompare: "",
      reviewerNotesForUi: null,
      preferClauseSuggestionSurface: false,
      legacyClassification: legacy,
    };
  }

  if (recipientImportsMatchAuthoritativeBaseline({ baselineRenderedHtml: baselineHtml, importedAgreementPlain: uploaded })) {
    reasons.push("matches_authoritative_baseline");
    return {
      role: "SAME_AS_CURRENT_DRAFT",
      rawLen,
      bodyLen: uploaded.trim().length,
      reasons,
      agreementBodyForCompare: uploaded,
      reviewerNotesForUi: null,
      preferClauseSuggestionSurface: false,
      legacyClassification: legacy,
    };
  }

  const collapsed = uploaded.replace(/\s+/g, " ").trim();
  if (collapsed.length < 60) {
    reasons.push("below_min_signal_threshold");
    return {
      role: "INVALID_OR_TOO_LOW_SIGNAL",
      rawLen,
      bodyLen,
      reasons,
      agreementBodyForCompare: agreementBodyForCompare,
      reviewerNotesForUi: legacy.reviewerNotes,
      preferClauseSuggestionSurface: false,
      legacyClassification: legacy,
    };
  }

  const archetype = looksLikeCondensedCleanRevisedAgreementArchetype(uploaded);
  if (
    archetype &&
    (legacy.kind === "review_notes_only" || legacy.kind === "clause_suggestions")
  ) {
    reasons.push("condensed_revised_archetype_override");
    reasons.push(`legacy_was_${legacy.kind}`);
    const role: RecipientUploadedDraftRole =
      uploaded.length >= 2800 || scoreAgreementLikeStructure(uploaded) >= 4
        ? "FULL_REVISED_AGREEMENT"
        : "CONDENSED_CLEAN_REVISED_AGREEMENT";
    return {
      role,
      rawLen,
      bodyLen: uploaded.length,
      reasons,
      agreementBodyForCompare: uploaded,
      reviewerNotesForUi: legacy.reviewerNotes,
      preferClauseSuggestionSurface: false,
      legacyClassification: {
        ...legacy,
        kind: "full_revised_agreement",
        agreementText: uploaded,
        confidence: "high",
        reason: "Condensed/clean revised agreement archetype (operative language + headings).",
      },
    };
  }

  if (legacy.kind === "review_notes_only") {
    reasons.push("legacy_review_notes_only");
    return {
      role: "REVIEW_NOTES_ONLY",
      rawLen,
      bodyLen,
      reasons,
      agreementBodyForCompare: "",
      reviewerNotesForUi: legacy.reviewerNotes ?? uploaded,
      preferClauseSuggestionSurface: false,
      legacyClassification: legacy,
    };
  }

  if (legacy.kind === "clause_suggestions") {
    reasons.push("legacy_clause_suggestions");
    return {
      role: "REVIEW_NOTES_ONLY",
      rawLen,
      bodyLen,
      reasons,
      agreementBodyForCompare: "",
      reviewerNotesForUi: legacy.reviewerNotes ?? uploaded,
      preferClauseSuggestionSurface: true,
      legacyClassification: legacy,
    };
  }

  const origLen = Math.max(40, authoritativePlain.length);
  const propLen = Math.max(1, agreementBodyForCompare.length);
  const ratio = origLen / propLen;
  const summaryMeta =
    /(revised\s+draft\s+reflects|proposed\s+operational|clarifications\s+requested|this\s+draft\s+reflects|condensed\s+draft|summary\s+of\s+changes|key\s+changes\s+below|operational\s+clarifications)/i.test(
      agreementBodyForCompare,
    );
  const shortRevVsLong = ratio >= 2.4 && origLen >= 2200 && propLen >= 350 && propLen <= 9000;

  if (shortRevVsLong && (summaryMeta || archetype || scoreAgreementLikeStructure(agreementBodyForCompare) >= 2)) {
    reasons.push("condensed_shape_vs_long_baseline");
    return {
      role: "CONDENSED_CLEAN_REVISED_AGREEMENT",
      rawLen,
      bodyLen: agreementBodyForCompare.length,
      reasons,
      agreementBodyForCompare,
      reviewerNotesForUi: legacy.reviewerNotes,
      preferClauseSuggestionSurface: false,
      legacyClassification: legacy,
    };
  }

  reasons.push("legacy_full_or_mixed");
  return {
    role: "FULL_REVISED_AGREEMENT",
    rawLen,
    bodyLen: agreementBodyForCompare.length,
    reasons,
    agreementBodyForCompare,
    reviewerNotesForUi: legacy.reviewerNotes,
    preferClauseSuggestionSurface: false,
    legacyClassification: legacy,
  };
}
