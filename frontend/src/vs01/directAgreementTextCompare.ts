/**
 * Deterministic plain-text agreement comparison: paragraphs, topics, and
 * reuses buildAgreementRedline. No network / no AI.
 */

import { buildAgreementRedline, type RedlineResult } from "./agreementRedline";

const MAX_PARAGRAPHS = 200;

function normalizeSpaces(s: string): string {
  return s.replace(/\r/g, "\n").replace(/\s+/g, " ").trim();
}

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export type DirectTopicId = "payment" | "governing_law" | "dates" | "ip" | "termination" | "general";

export const DIRECT_TOPIC_DEFS: { id: DirectTopicId; label: string; test: (p: string) => boolean }[] = [
  {
    id: "payment",
    label: "Payment terms",
    test: (p) =>
      /\$|payment|fee|fees|compensat|invoic|invoices|net\s*\d+|\bprice|amounts?\b|payable|reimburs/i.test(
        p,
      ),
  },
  {
    id: "governing_law",
    label: "Governing law / venue",
    test: (p) =>
      /governing\s+law|jurisdiction|laws of the|laws of\s+\w|choice of law|venue|courts of|without regard to|conflict[- ]of[- ]laws?/i.test(
        p,
      ),
  },
  {
    id: "dates",
    label: "Dates & deadlines",
    test: (p) =>
      /\b20\d{2}\b|effective\s+date|due date|calendar days|not later than|deadline|commencing|on or before|within\s+\d+|\d{1,2}\s*\/\s*\d{1,2}/i.test(
        p,
      ) || /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*\.?\s+\d{1,2}/i.test(p),
  },
  {
    id: "ip",
    label: "IP & ownership",
    test: (p) =>
      /intellectual property|work[-\s]for[-\s]hire|copyright|trademark|trade secret|proprietary|license grant|sublicense|moral rights|ownership of/i.test(
        p,
      ),
  },
  {
    id: "termination",
    label: "Termination / duration",
    test: (p) =>
      /terminat(e|ion|able|ing)|\bfor cause\b|notice of termination|with or without cause|shall (?:expire|end)|\bsurvive(s|d)?\b|cancellation|renewal|auto[- ]?renew|initial term/i.test(
        p,
      ),
  },
];

function topicsForParagraph(p: string): DirectTopicId[] {
  const out: DirectTopicId[] = [];
  for (const d of DIRECT_TOPIC_DEFS) {
    if (d.test(p)) out.push(d.id);
  }
  if (out.length === 0) return ["general"];
  return out;
}

function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i]![j]! = 1 + dp[i + 1]![j + 1]!;
      else dp[i]![j]! = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  return dp;
}

export type ClauseRow =
  | { kind: "same"; beforeIdx: number; afterIdx: number; text: string }
  | { kind: "edit"; beforeIdx: number; afterIdx: number; before: string; after: string }
  | { kind: "add"; afterIdx: number; text: string }
  | { kind: "remove"; beforeIdx: number; text: string };

/**
 * Longest common subsequence of paragraphs; backtrack to a linear sequence of diffs.
 */
function alignParagraphs(before: string[], after: string[]): ClauseRow[] {
  if (before.length * after.length > 1_200_000) {
    // Fallback: cheap sequential (zip by index for min length) + remainder
    return alignParagraphsSequential(
      before.slice(0, MAX_PARAGRAPHS),
      after.slice(0, MAX_PARAGRAPHS),
    );
  }
  const dp = lcsTable(before, after);
  const out: ClauseRow[] = [];
  let i = 0;
  let j = 0;
  const n = before.length;
  const m = after.length;
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) {
      out.push({ kind: "same", beforeIdx: i, afterIdx: j, text: before[i]! });
      i++;
      j++;
    } else if (i < n && (j === m || dp[i + 1]![j]! >= dp[i]![j + 1]!)) {
      out.push({ kind: "remove", beforeIdx: i, text: before[i]! });
      i++;
    } else if (j < m) {
      out.push({ kind: "add", afterIdx: j, text: after[j]! });
      j++;
    } else {
      out.push({ kind: "remove", beforeIdx: i, text: before[i]! });
      i++;
    }
  }
  // Merge: adjacent remove+add that are the same index region might be "edit" for UX — do second pass: replace consecutive remove+add with edit
  return coalesceToEdits(out);
}

function coalesceToEdits(rows: ClauseRow[]): ClauseRow[] {
  const r: ClauseRow[] = [];
  for (let k = 0; k < rows.length; k++) {
    const cur = rows[k]!;
    const next = rows[k + 1];
    if (cur.kind === "remove" && next && next.kind === "add") {
      r.push({
        kind: "edit",
        beforeIdx: cur.beforeIdx,
        afterIdx: next.afterIdx,
        before: cur.text,
        after: next.text,
      });
      k++;
      continue;
    }
    r.push(cur);
  }
  return r;
}

/** When LCS is too big, pair by index up to min length, then add/rem tail. */
function alignParagraphsSequential(before: string[], after: string[]): ClauseRow[] {
  const out: ClauseRow[] = [];
  const L = Math.min(before.length, after.length);
  for (let i = 0; i < L; i++) {
    if (before[i] === after[i]) {
      out.push({ kind: "same", beforeIdx: i, afterIdx: i, text: before[i]! });
    } else {
      out.push({ kind: "edit", beforeIdx: i, afterIdx: i, before: before[i]!, after: after[i]! });
    }
  }
  for (let i = L; i < before.length; i++) {
    out.push({ kind: "remove", beforeIdx: i, text: before[i]! });
  }
  for (let j = L; j < after.length; j++) {
    out.push({ kind: "add", afterIdx: j, text: after[j]! });
  }
  return out;
}

export type TopicHighlight = {
  id: DirectTopicId | "general";
  label: string;
  before: string;
  after: string;
  changed: boolean;
};

function collectTopicSnippets(paragraphs: string[]): Map<DirectTopicId, string[]> {
  const m = new Map<DirectTopicId, string[]>();
  for (const p of paragraphs) {
    for (const id of topicsForParagraph(p)) {
      if (id === "general") continue;
      if (!m.has(id)) m.set(id, []);
      m.get(id)!.push(p);
    }
  }
  return m;
}

function buildTopicHighlights(
  beforeParas: string[],
  afterParas: string[],
  definitions: { id: DirectTopicId; label: string }[] = DIRECT_TOPIC_DEFS,
): TopicHighlight[] {
  const bMap = collectTopicSnippets(beforeParas);
  const aMap = collectTopicSnippets(afterParas);
  const ids = new Set<DirectTopicId | "general">([...bMap.keys(), ...aMap.keys()]);
  const out: TopicHighlight[] = [];
  for (const id of ids) {
    if (id === "general") continue;
    const def = definitions.find((d) => d.id === id);
    if (!def) continue;
    const b = (bMap.get(id) || []).join("\n\n");
    const a = (aMap.get(id) || []).join("\n\n");
    const changed = normalizeSpaces(b) !== normalizeSpaces(a) && (b || a) !== "";
    if (!b && !a) continue;
    out.push({
      id,
      label: def.label,
      before: b,
      after: a,
      changed,
    });
  }
  // Sort stable by label
  return out.sort((x, y) => x.label.localeCompare(y.label));
}

function countWords(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function countRedlineWords(segments: RedlineResult["segments"], type: "insert" | "delete"): number {
  let n = 0;
  for (const s of segments) {
    if (s.type !== type) continue;
    n += countWords(s.text);
  }
  return n;
}

export type DirectTextCompareResult = {
  redline: RedlineResult;
  additionWordsApprox: number;
  deletionWordsApprox: number;
  topicHighlights: TopicHighlight[];
  /** Paragraph-aligned rows; includes "same" for count */
  clauseRows: ClauseRow[];
  unchangedClauses: number;
  addedClauses: number;
  removedClauses: number;
  editedClauses: number;
  truncated: boolean;
};

/**
 * Full analysis for two full-text agreement pastes. Uses the same redline
 * diff engine as the rest of LawDog for insert/delete and inline view.
 */
export function analyzeDirectTextCompare(beforeRaw: string, afterRaw: string): DirectTextCompareResult {
  const before0 = (beforeRaw || "").replace(/\r/g, "\n");
  const after0 = (afterRaw || "").replace(/\r/g, "\n");

  let pBefore = splitParagraphs(before0);
  let pAfter = splitParagraphs(after0);
  const truncated = pBefore.length > MAX_PARAGRAPHS || pAfter.length > MAX_PARAGRAPHS;
  pBefore = pBefore.slice(0, MAX_PARAGRAPHS);
  pAfter = pAfter.slice(0, MAX_PARAGRAPHS);

  const redline = buildAgreementRedline(before0, after0);
  const additionWordsApprox = countRedlineWords(redline.segments, "insert");
  const deletionWordsApprox = countRedlineWords(redline.segments, "delete");
  const topicHighlights = buildTopicHighlights(pBefore, pAfter);
  const clauseRows = pBefore.length + pAfter.length < 1 ? [] : alignParagraphs(pBefore, pAfter);
  let unchangedClauses = 0;
  let addedClauses = 0;
  let removedClauses = 0;
  let editedClauses = 0;
  for (const row of clauseRows) {
    if (row.kind === "same") unchangedClauses++;
    else if (row.kind === "add") addedClauses++;
    else if (row.kind === "remove") removedClauses++;
    else editedClauses++;
  }

  return {
    redline,
    additionWordsApprox,
    deletionWordsApprox,
    topicHighlights: topicHighlights.filter((h) => h.changed),
    clauseRows,
    unchangedClauses,
    addedClauses,
    removedClauses,
    editedClauses,
    truncated,
  };
}
