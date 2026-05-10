import { classifyRecipientRevisedDraftUpload } from "./recipientRevisedDraftReviewerNotes";

export type RecipientReviewPresentationMode =
  | "full_clause_redline"
  | "condensed_clean_revision"
  | "notes_or_suggestions"
  | "unknown";

const SUMMARY_META_RE =
  /(revised\s+draft\s+reflects|proposed\s+operational|clarifications\s+requested|this\s+draft\s+reflects|condensed\s+draft|summary\s+of\s+changes|key\s+changes\s+below|operational\s+clarifications)/i;

function countNumberedClauseStarts(plain: string): number {
  const t = String(plain ?? "").replace(/\r\n/g, "\n");
  const m = t.match(/(?:^|\n)(\d+(?:\.\d+)+)\s+\S/g);
  return m?.length ?? 0;
}

export type DetectRecipientReviewPresentationModeInput = {
  currentPlain: string;
  proposedPlain: string;
  /** Narrow payment-only path — never condensed mode. */
  narrowRecipientTargetedRedline?: boolean;
};

/**
 * Chooses how to present recipient compare UI + PDF (full redline vs condensed clean draft vs notes).
 */
export function detectRecipientReviewPresentationMode(
  input: DetectRecipientReviewPresentationModeInput,
): RecipientReviewPresentationMode {
  const cur = String(input.currentPlain ?? "").trim();
  const prop = String(input.proposedPlain ?? "").trim();
  if (!cur || !prop) return "unknown";
  if (input.narrowRecipientTargetedRedline) return "full_clause_redline";

  const cls = classifyRecipientRevisedDraftUpload(cur, prop);

  const origLen = Math.max(1, cur.length);
  const revLen = Math.max(1, prop.length);
  const ratio = origLen / revLen;
  const clausesCur = countNumberedClauseStarts(cur);
  const clausesProp = countNumberedClauseStarts(prop);
  const summaryMeta = SUMMARY_META_RE.test(prop);
  const shortRevVsLong = ratio >= 2.5 && origLen >= 2500 && revLen >= 400;
  const fewerNumberedHeadings =
    clausesCur >= 6 && clausesProp >= 2 && clausesProp <= Math.max(3, Math.ceil(clausesCur * 0.55));

  /** Upload classifier often labels LLM “clean rewrite” PDFs as notes; still compare as a condensed draft. */
  const condensedCleanRevisionOverride =
    shortRevVsLong && (summaryMeta || fewerNumberedHeadings) && clausesProp >= 2;

  if (
    (cls.kind === "clause_suggestions" || cls.kind === "review_notes_only") &&
    !condensedCleanRevisionOverride
  ) {
    return "notes_or_suggestions";
  }

  if (shortRevVsLong && (summaryMeta || fewerNumberedHeadings)) {
    return "condensed_clean_revision";
  }

  if (ratio >= 2.2 && origLen >= 4000 && revLen <= origLen * 0.42 && clausesProp <= clausesCur * 0.65) {
    return "condensed_clean_revision";
  }

  return "full_clause_redline";
}

export function buildHumanReviewHeadlineCondensedCleanRevision(
  reviewerDisplayLabel: string,
  keyRevisionAreaCount: number,
): string {
  const who = (reviewerDisplayLabel || "").trim() || "The reviewer";
  const n = Math.max(1, Math.floor(keyRevisionAreaCount));
  const areas = n === 1 ? "key revision area" : "key revision areas";
  return `${who} proposed a clean revised draft with ${n} ${areas}.`;
}
