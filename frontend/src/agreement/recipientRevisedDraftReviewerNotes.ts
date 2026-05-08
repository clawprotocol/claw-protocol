/**
 * Heuristics: split reviewer commentary from a revised draft, and classify uploads
 * so notes-only PDFs never become the proposed agreement body.
 */

const HEADING_LINE = new RegExp(
  [
    "^reviewer\\s+notes\\s*$",
    "^reviewer\\s+perspective\\s*$",
    "^revised\\s+draft\\s+notes\\s*$",
    "^recommendation\\s*$",
    "^reasoning\\s*$",
    "^suggested\\s+message\\s*$",
    "^why\\s+these\\s+changes",
    "^notes?\\s+to\\s+sender\\s*$",
    "^comments?\\s*$",
    "^revision\\s+rationale\\s*$",
    "^why\\s+i\\s+changed",
    "^message\\s+to\\s+(the\\s+)?sender\\s*$",
  ].join("|"),
  "i",
);

/** Lines that suggest a commentary-first document (includes split headings + a few extras). */
const COMMENTARY_HEADING_LINE = new RegExp(
  [
    "^reviewer\\s+notes\\s*$",
    "^reviewer\\s+perspective\\s*$",
    "^revised\\s+draft\\s+notes\\s*$",
    "^recommendation\\s*$",
    "^reasoning\\s*$",
    "^suggested\\s+message\\s*$",
    "^why\\s+these\\s+changes",
    "^notes?\\s+to\\s+sender\\s*$",
    "^comments?\\s*$",
    "^revision\\s+rationale\\s*$",
    "^why\\s+i\\s+changed",
    "^message\\s+to\\s+(the\\s+)?sender\\s*$",
    "^notes?\\s*$",
    "^summary\\s+of\\s+changes\\s*$",
  ].join("|"),
  "i",
);

function stripLeadingHashes(line: string): string {
  return line.replace(/^#{1,6}\s*/, "").trim();
}

function looksLikeReviewerSectionHeading(trimmed: string): boolean {
  if (!trimmed || trimmed.length > 120) return false;
  const dehashed = stripLeadingHashes(trimmed);
  return HEADING_LINE.test(dehashed);
}

function countCommentaryHeadings(text: string): number {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let n = 0;
  for (const line of lines) {
    const t = stripLeadingHashes(line.trim());
    if (!t) continue;
    if (t.length > 120) continue;
    if (COMMENTARY_HEADING_LINE.test(t)) n++;
  }
  return n;
}

/** Rough 0–12 score: higher means more like an agreement body. */
export function scoreAgreementLikeStructure(text: string): number {
  const t = text.slice(0, 120_000);
  let s = 0;
  if (/\bwhereas\b/i.test(t)) s += 3;
  if (/\b(?:in\s+)?witness\s+whereof\b/i.test(t)) s += 2;
  if (/\b(this\s+)?agreement\b/i.test(t) && t.length > 120) s += 2;
  if (/\bparties?\b/i.test(t) && /\b(?:agree|hereby|obligations?)\b/i.test(t)) s += 2;
  if (/\bsignature\b|\/s\/|\bexecuted\b|electronic\s+signature\b/i.test(t)) s += 2;
  const articles = (t.match(/(?:^|\n)\s*(?:article|section)\s+[ivxlcdm0-9]+/gi) ?? []).length;
  s += Math.min(3, articles);
  const numberedClauses = (t.match(/(?:^|\n)\s*\d{1,2}[.)]\s+[A-Za-z"']/g) ?? []).length;
  if (numberedClauses >= 4) s += 3;
  else if (numberedClauses >= 2) s += 2;
  else if (numberedClauses >= 1) s += 1;
  if (t.length >= 2800) s += 1;
  return s;
}

/** Two or more markdown-style bullet lines (clause-style asks, not numbered agreement articles). */
export function hasStructuredAsks(text: string): boolean {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let bullets = 0;
  for (const line of lines) {
    if (/^\s*[-*•]\s+\S/.test(line)) bullets++;
  }
  return bullets >= 2;
}

function hasCommentaryTone(text: string): boolean {
  return /\b(i\s+recommend|i\s+propose|we\s+suggest|my\s+concern|rationale\s*:|reviewer\s+perspective)\b/i.test(
    text.slice(0, 50_000),
  );
}

export type SplitReviewerNotesResult = {
  agreementBody: string;
  reviewerNotes: string | null;
};

/**
 * If a recognized heading appears after some agreement-looking body, split.
 * Otherwise returns the full trimmed text as body and no separate notes.
 */
export function splitReviewerNotesFromRevisedDraft(raw: string): SplitReviewerNotesResult {
  const full = raw.replace(/\r\n/g, "\n");
  const lines = full.split("\n");
  let splitAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]?.trim() ?? "";
    if (!t) continue;
    if (looksLikeReviewerSectionHeading(t)) {
      splitAt = i;
      break;
    }
  }
  if (splitAt <= 0) {
    return { agreementBody: full.trim(), reviewerNotes: null };
  }
  const body = lines.slice(0, splitAt).join("\n").trim();
  const notes = lines.slice(splitAt).join("\n").trim();
  if (!body) {
    return { agreementBody: full.trim(), reviewerNotes: null };
  }
  return { agreementBody: body, reviewerNotes: notes || null };
}

export type RecipientRevisedUploadKind =
  | "full_revised_agreement"
  | "review_notes_only"
  | "clause_suggestions"
  | "mixed_notes_and_agreement";

export type ClassifyRecipientRevisedDraftUploadResult = {
  kind: RecipientRevisedUploadKind;
  agreementText: string;
  reviewerNotes: string | null;
  confidence: "low" | "medium" | "high";
  reason: string;
};

/**
 * When the first non-empty line is a reviewer-style heading, treat lines before real agreement
 * as a leading notes block (split() only handles notes *after* agreement).
 */
function splitLeadingCommentaryThenRest(uploaded: string): {
  leadingNotes: string | null;
  remainder: string;
} {
  const lines = uploaded.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const t = stripLeadingHashes(raw.trim());
    if (!t) continue;
    if (COMMENTARY_HEADING_LINE.test(t) || looksLikeReviewerSectionHeading(raw.trim())) {
      const rest = lines.slice(i + 1).join("\n").trim();
      const headingBlock = lines.slice(0, i + 1).join("\n").trim();
      return { leadingNotes: headingBlock || null, remainder: rest };
    }
    break;
  }
  return { leadingNotes: null, remainder: uploaded.trim() };
}

/**
 * Classify extracted upload text vs. the original agreement plain text (length + shape).
 * Call after PDF/text extraction, before building a proposed draft or redline.
 */
export function classifyRecipientRevisedDraftUpload(
  originalText: string,
  uploadedText: string,
): ClassifyRecipientRevisedDraftUploadResult {
  const orig = originalText.replace(/\r\n/g, "\n").trim() || " ";
  const uploaded = uploadedText.replace(/\r\n/g, "\n").trim();
  const origLen = Math.max(40, orig.length);

  if (!uploaded) {
    return {
      kind: "review_notes_only",
      agreementText: "",
      reviewerNotes: null,
      confidence: "high",
      reason: "Empty upload.",
    };
  }

  const { leadingNotes, remainder } = splitLeadingCommentaryThenRest(uploaded);
  if (leadingNotes && remainder.trim().length === 0) {
    return {
      kind: "review_notes_only",
      agreementText: "",
      reviewerNotes: uploaded,
      confidence: "high",
      reason: "Upload is only a reviewer-style heading or note block.",
    };
  }
  const coreForSplit = remainder.trim().length > 0 ? remainder : uploaded;
  const split = splitReviewerNotesFromRevisedDraft(coreForSplit);
  let body = split.agreementBody;
  let trailNotes = split.reviewerNotes;
  if (leadingNotes && remainder.trim().length > 0) {
    if (trailNotes) {
      trailNotes = [leadingNotes, trailNotes].filter(Boolean).join("\n\n");
    } else {
      trailNotes = leadingNotes;
    }
  }
  const bodyScore = scoreAgreementLikeStructure(body);
  const fullScore = scoreAgreementLikeStructure(uploaded);
  const headingHits = countCommentaryHeadings(uploaded);

  const longBodyWithTrailingNotes =
    Boolean(trailNotes) &&
    body.length >= Math.min(4000, Math.max(350, Math.floor(origLen * 0.14))) &&
    (bodyScore >= 2 || body.length >= Math.max(900, Math.floor(origLen * 0.18)));

  if (longBodyWithTrailingNotes) {
    return {
      kind: "mixed_notes_and_agreement",
      agreementText: body,
      reviewerNotes: trailNotes,
      confidence: bodyScore >= 2 ? "high" : "medium",
      reason: "Agreement-shaped main text with a trailing reviewer section.",
    };
  }

  if (trailNotes && body.length < 500 && bodyScore < 2) {
    return {
      kind: "review_notes_only",
      agreementText: "",
      reviewerNotes: uploaded,
      confidence: "high",
      reason: "Leading block is too small or non-agreement-like for a full draft; remainder is commentary.",
    };
  }

  const primary = trailNotes ? body : uploaded;
  const primaryLen = primary.length;
  const weak = bodyScore < 2 && fullScore < 3;
  const shortVsOriginal = primaryLen < Math.max(500, Math.floor(origLen * 0.22));
  const noteLike =
    headingHits >= 1 ||
    hasCommentaryTone(uploaded) ||
    (weak && shortVsOriginal && primaryLen >= 120 && primaryLen < Math.max(3500, Math.floor(origLen * 0.55)));

  if (
    hasStructuredAsks(uploaded) &&
    weak &&
    fullScore < 3 &&
    primaryLen >= 120 &&
    primaryLen <= 8000 &&
    primaryLen < Math.max(7500, Math.floor(origLen * 0.95))
  ) {
    return {
      kind: "clause_suggestions",
      agreementText: "",
      reviewerNotes: uploaded,
      confidence: "medium",
      reason: "Multiple list-style recommendations without full agreement text.",
    };
  }

  if (noteLike && weak && primaryLen < Math.max(4500, Math.floor(origLen * 0.85))) {
    if (primaryLen <= 100 && headingHits === 0 && !hasCommentaryTone(uploaded)) {
      return {
        kind: "full_revised_agreement",
        agreementText: body,
        reviewerNotes: trailNotes,
        confidence: "low",
        reason: "Very short upload without commentary headings; allow compare.",
      };
    }
    return {
      kind: "review_notes_only",
      agreementText: "",
      reviewerNotes: uploaded,
      confidence: headingHits >= 1 ? "high" : "medium",
      reason: "Commentary signals with weak agreement structure relative to the original.",
    };
  }

  if (fullScore >= 3 || primaryLen >= Math.max(1300, Math.floor(origLen * 0.28))) {
    return {
      kind: "full_revised_agreement",
      agreementText: trailNotes ? body : uploaded,
      reviewerNotes: trailNotes,
      confidence: "high",
      reason: "Strong agreement structure or substantial length.",
    };
  }

  if (fullScore >= 2 && primaryLen >= 700) {
    return {
      kind: "full_revised_agreement",
      agreementText: trailNotes ? body : uploaded,
      reviewerNotes: trailNotes,
      confidence: "medium",
      reason: "Moderate agreement-like signals.",
    };
  }

  return {
    kind: "full_revised_agreement",
    agreementText: trailNotes ? body : uploaded,
    reviewerNotes: trailNotes,
    confidence: "low",
    reason: "Default to full revised draft compare when classification is uncertain.",
  };
}
