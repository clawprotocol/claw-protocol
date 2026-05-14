/**
 * Deterministic change ledger for review / audit confidence: paragraph-level added / removed / changed
 * between baseline and revised plain text. Independent of inline redline rendering quality.
 */

import { normalizeNewlinesForLegalRedline } from "./legalRedlineBlocks";
import { diffPlainTextParagraphRows, type ClauseRow } from "../vs01/directAgreementTextCompare";

export type ReviewChangeLedgerKind = "added" | "removed" | "changed";

export type ReviewChangeRiskTag =
  | "parties"
  | "payment"
  | "term"
  | "governing_law"
  | "signature"
  | "confidentiality"
  | "ownership"
  | "general";

export type ReviewChangeLedgerEntry = {
  id: string;
  type: ReviewChangeLedgerKind;
  /** Best-effort first-line / heading label for navigation. */
  sectionHeading: string | null;
  beforeText: string;
  afterText: string;
  riskTags: ReviewChangeRiskTag[];
};

export type ReviewChangeLedger = {
  entries: ReviewChangeLedgerEntry[];
  truncated: boolean;
  stats: { added: number; removed: number; changed: number };
};

/**
 * Safe normalization only: newlines, NBSP, repeated blank lines, trailing line spaces.
 * Does not collapse internal single spaces or alter substantive wording.
 */
export function normalizeLedgerPlainText(raw: string): string {
  let s = normalizeNewlinesForLegalRedline(String(raw ?? ""));
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+$/g, ""))
    .join("\n");
  s = s.replace(/\n{4,}/g, "\n\n\n");
  return s.trim();
}

function inferSectionHeading(paragraph: string): string | null {
  const first = paragraph.split("\n")[0]?.trim() ?? "";
  if (!first || first.length > 140) return null;
  if (/^(?:ARTICLE|SECTION|SCHEDULE|EXHIBIT)\b/i.test(first)) return first.slice(0, 120);
  if (/^\d+(?:\.\d+)*[\.)]\s+\S/.test(first)) return first.slice(0, 120);
  if (/^SIGNATURE|IN\s+WITNESS|WITNESS\s+WHEREOF/i.test(first)) return first.slice(0, 120);
  if (/^[A-Z0-9][A-Z0-9\s&,.'’\-]{3,80}$/.test(first) && first === first.toUpperCase()) return first.slice(0, 120);
  return first.length <= 100 ? first : first.slice(0, 100);
}

function riskTagsForBlob(blob: string): ReviewChangeRiskTag[] {
  const low = blob.toLowerCase();
  const tags = new Set<ReviewChangeRiskTag>();
  if (
    /\b(?:party|parties)\b|llc|l\.l\.c\.|inc\.?|corp|limited partnership|\blp\b|signator|counterpart/i.test(
      low,
    )
  ) {
    tags.add("parties");
  }
  if (/signature|in witness|_{4,}|\bby:\s*\S/i.test(low)) tags.add("signature");
  if (/\$\s*[\d,]+|fee|fees|payment|compensat|invoice|net\s*\d+/i.test(low)) tags.add("payment");
  if (
    /\bterm\b|duration|months?|years?|effective date|expiration|renewal|calendar days|deadline/i.test(low)
  ) {
    tags.add("term");
  }
  if (/governing law|choice of law|laws of the state|venue|jurisdiction(?!.*dispute)/i.test(low)) {
    tags.add("governing_law");
  }
  if (/confidential|non-disclosure|non disclosure|proprietary information/i.test(low)) tags.add("confidentiality");
  if (/intellectual property|work product|ownership of|deliverable|license grant/i.test(low)) tags.add("ownership");
  if (/terminat|for cause|without cause|surviv/i.test(low)) tags.add("term");
  if (/arbitrat|mediation|dispute resolution|litigation/i.test(low)) tags.add("general");
  if (tags.size === 0) tags.add("general");
  return [...tags];
}

function clauseRowToLedgerEntry(row: ClauseRow, index: number): ReviewChangeLedgerEntry | null {
  if (row.kind === "same") return null;
  const id = `ledger_${index}_${row.kind}`;
  if (row.kind === "add") {
    const t = row.text;
    return {
      id,
      type: "added",
      sectionHeading: inferSectionHeading(t),
      beforeText: "",
      afterText: t,
      riskTags: riskTagsForBlob(t),
    };
  }
  if (row.kind === "remove") {
    const t = row.text;
    return {
      id,
      type: "removed",
      sectionHeading: inferSectionHeading(t),
      beforeText: t,
      afterText: "",
      riskTags: riskTagsForBlob(t),
    };
  }
  const before = row.before;
  const after = row.after;
  return {
    id,
    type: "changed",
    sectionHeading: inferSectionHeading(after) || inferSectionHeading(before),
    beforeText: before,
    afterText: after,
    riskTags: riskTagsForBlob(`${before}\n${after}`),
  };
}

/**
 * Build a deterministic paragraph-level change ledger between baseline and revised plain text.
 */
export function buildReviewChangeLedger(baselineText: string, revisedText: string): ReviewChangeLedger {
  const base = normalizeLedgerPlainText(baselineText);
  const rev = normalizeLedgerPlainText(revisedText);
  if (base === rev) {
    return { entries: [], truncated: false, stats: { added: 0, removed: 0, changed: 0 } };
  }
  const { rows, truncated } = diffPlainTextParagraphRows(base, rev);
  const entries: ReviewChangeLedgerEntry[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let idx = 0;
  for (const row of rows) {
    const e = clauseRowToLedgerEntry(row, idx++);
    if (!e) continue;
    entries.push(e);
    if (e.type === "added") added++;
    else if (e.type === "removed") removed++;
    else changed++;
  }
  return { entries, truncated, stats: { added, removed, changed } };
}
