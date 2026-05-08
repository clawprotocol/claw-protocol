/**
 * Heuristic: pull reviewer commentary out of the end of a revised draft so it
 * does not inflate the agreement comparison corpus (purpose field / redline).
 */

const HEADING_LINE = new RegExp(
  [
    "^reviewer\\s+notes\\s*$",
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

function stripLeadingHashes(line: string): string {
  return line.replace(/^#{1,6}\s*/, "").trim();
}

function looksLikeReviewerSectionHeading(trimmed: string): boolean {
  if (!trimmed || trimmed.length > 120) return false;
  const dehashed = stripLeadingHashes(trimmed);
  return HEADING_LINE.test(dehashed);
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
