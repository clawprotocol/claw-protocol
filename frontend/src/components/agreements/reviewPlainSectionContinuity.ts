/**
 * Review/plain corpus section continuity after Pro draft / Review paint.
 *
 * Customer-visible Review must not skip integers (12 then 14, 10 then 12) and
 * must not silently drop a governing-law term the intake already supplied.
 * Does not remint leftover 1..8 outlines into 10/11/12/13.
 */

import { extractGoverningLawFromIntake } from "./applyIntakeDraftPlaceholders";

const TOP_LEVEL_HEADING_RE = /^(\d{1,2})\.\s+(?!\d)(\S.*)$/;
const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;
const NOTICES_HEADING_RE = /^(\d{1,2})\.\s+NOTICES\b/i;
const GOVERNING_HEADING_RE = /^\d{1,2}\.\s+GOVERNING LAW\b/i;
const GOVERNED_BY_RE = /\bgoverned\s+by\s+(?:the\s+)?laws?\s+of\b/i;

/** Late-section holes (10 then 12, 12 then 14). Do not remint 1..8 leftovers. */
export const REVIEW_PLAIN_LATE_SECTION_SKIP_FLOOR = 10;

export type ReviewPlainSectionContinuityResult = {
  text: string;
  repairs: string[];
};

export type ReviewPlainSectionContinuityOpts = {
  intakeText?: string | null;
  jurisdiction?: string | null;
  /** Newly generated Pro drafts only — never leftover 8-section remint. */
  remintAllTopLevel?: boolean;
};

function splitBeforeWitness(text: string): { head: string; tail: string } {
  const raw = (text || "").replace(/\r\n/g, "\n");
  const idx = raw.search(WITNESS_RE);
  if (idx < 0) return { head: raw, tail: "" };
  return { head: raw.slice(0, idx), tail: raw.slice(idx) };
}

function parseTopLevelHeading(line: string): { number: number; title: string } | null {
  const trimmed = line.trim();
  if (/^\d+\.\d+/.test(trimmed)) return null;
  const match = trimmed.match(TOP_LEVEL_HEADING_RE);
  if (!match?.[1] || !match[2]) return null;
  return { number: Number(match[1]), title: match[2].trim() };
}

export function collectReviewPlainTopLevelSectionNumbers(plain: string): number[] {
  const { head } = splitBeforeWitness(plain || "");
  const nums: number[] = [];
  for (const line of head.split("\n")) {
    const parsed = parseTopLevelHeading(line);
    if (parsed) nums.push(parsed.number);
  }
  return nums;
}

/** True when Review/plain top-level headings skip or jump (N then N+2 is FAIL). */
export function reviewPlainHasSkippedSectionNumbers(plain: string): boolean {
  const nums = collectReviewPlainTopLevelSectionNumbers(plain);
  if (nums.length < 2) return false;
  for (let i = 1; i < nums.length; i += 1) {
    const prev = nums[i - 1]!;
    const curr = nums[i]!;
    if (curr <= prev) return true;
    if (curr >= prev + 2) return true;
  }
  return false;
}

/**
 * Live skip class: 10 then 12, 12 then 14 (prev >= late floor).
 * Persist Review seeds with an early hole (2 then 10) are a different fixture class.
 */
export function reviewPlainHasLateSkippedSectionNumbers(plain: string): boolean {
  const nums = collectReviewPlainTopLevelSectionNumbers(plain);
  if (nums.length < 2) return false;
  for (let i = 1; i < nums.length; i += 1) {
    const prev = nums[i - 1]!;
    const curr = nums[i]!;
    if (prev < REVIEW_PLAIN_LATE_SECTION_SKIP_FLOOR) continue;
    if (curr <= prev) return true;
    if (curr >= prev + 2) return true;
  }
  return false;
}

export function extractSuppliedGoverningLaw(
  intakeText?: string | null,
  jurisdiction?: string | null,
): string {
  const hinted = String(jurisdiction || "").trim();
  if (hinted && !/^\[/.test(hinted)) return hinted;
  return extractGoverningLawFromIntake(intakeText) || "";
}

function plainOutsideNoticeAddresses(plain: string): string {
  return (plain || "")
    .split("\n")
    .map((line) => {
      if (/^\s*(?:Address|Attn|Email)\s*:/i.test(line)) return "";
      if (/\bAddress:\s+/i.test(line) && /governing\s+law/i.test(line)) {
        return line.replace(/Address:.*/i, "");
      }
      return line;
    })
    .join("\n");
}

export function reviewPlainHasOperativeGoverningLaw(plain: string, jurisdiction = ""): boolean {
  const body = plainOutsideNoticeAddresses(plain || "");
  if (GOVERNING_HEADING_RE.test(body) || GOVERNED_BY_RE.test(body)) return true;
  const juris = jurisdiction.trim();
  if (!juris) return false;
  const escaped = juris.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\b${escaped}\\s+law\\s+governs?\\b`, "i").test(body)) return true;
  if (new RegExp(`\\blaws?\\s+of(?:\\s+the\\s+state\\s+of)?\\s+${escaped}\\b`, "i").test(body)) return true;
  return false;
}

function headingLineIndexes(head: string): Array<{ lineIndex: number; number: number; title: string }> {
  const found: Array<{ lineIndex: number; number: number; title: string }> = [];
  const lines = head.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseTopLevelHeading(lines[i]!);
    if (!parsed) continue;
    found.push({ lineIndex: i, number: parsed.number, title: parsed.title });
  }
  return found;
}

function unusedIntegersBetween(prev: number, curr: number, used: readonly number[]): number[] {
  const usedSet = new Set(used);
  const hole: number[] = [];
  for (let n = prev + 1; n < curr; n += 1) {
    if (!usedSet.has(n)) hole.push(n);
  }
  return hole;
}

function insertGoverningLawSection(plain: string, jurisdiction: string): ReviewPlainSectionContinuityResult {
  const repairs: string[] = [];
  const raw = (plain || "").replace(/\r\n/g, "\n");
  const { head, tail } = splitBeforeWitness(raw);
  const headings = headingLineIndexes(head);
  const used = headings.map((h) => h.number);
  const lines = head.split("\n");

  let insertAt = head.length;
  let sectionNum = used.length ? used[used.length - 1]! + 1 : 1;

  let noticesIdx = -1;
  let noticesNum: number | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i]!.trim().match(NOTICES_HEADING_RE);
    if (!match?.[1]) continue;
    noticesIdx = i;
    noticesNum = Number(match[1]);
    break;
  }

  if (noticesIdx >= 0 && noticesNum != null) {
    const prior = used.filter((n) => n < noticesNum);
    const prev = prior.length ? prior[prior.length - 1]! : noticesNum - 1;
    const hole = unusedIntegersBetween(prev, noticesNum, used);
    sectionNum = hole[0] ?? Math.max(prev, 0) + 1;
    insertAt = lines.slice(0, noticesIdx).reduce((acc, line) => acc + line.length + 1, 0);
  }

  const block = [
    `${sectionNum}. Governing Law`,
    "",
    `This Agreement is governed by the laws of ${jurisdiction}, without regard to conflict-of-laws principles.`,
  ].join("\n");

  const prefix = head.slice(0, insertAt).replace(/\s+$/g, "");
  const suffix = head.slice(insertAt).replace(/^\s+/g, "");
  const mergedHead = [prefix, block, suffix].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n");
  const text = (tail ? `${mergedHead}\n\n${tail}` : mergedHead).replace(/\n{3,}/g, "\n\n").trim();
  repairs.push(`review_plain:restore_governing_law:${jurisdiction}`);
  return { text, repairs };
}

function renumberHeadingLine(line: string, newNum: number, title: string): string {
  const leading = line.slice(0, line.length - line.trimStart().length);
  return `${leading}${newNum}. ${title}`;
}

function compressLateUnusedSkips(plain: string): ReviewPlainSectionContinuityResult {
  const repairs: string[] = [];
  const raw = (plain || "").replace(/\r\n/g, "\n");
  const { head, tail } = splitBeforeWitness(raw);
  const lines = head.split("\n");

  const readHeadings = () => headingLineIndexes(lines.join("\n"));

  let changed = true;
  while (changed) {
    changed = false;
    const found = readHeadings();
    const used = found.map((h) => h.number);
    for (let i = 1; i < found.length; i += 1) {
      const prev = found[i - 1]!;
      const curr = found[i]!;
      if (prev.number < REVIEW_PLAIN_LATE_SECTION_SKIP_FLOOR) continue;
      if (curr.number < prev.number + 2) continue;
      const hole = unusedIntegersBetween(prev.number, curr.number, used);
      if (!hole.length) continue;
      const shift = curr.number - prev.number - 1;
      for (let j = i; j < found.length; j += 1) {
        const item = found[j]!;
        const nextNum = item.number - shift;
        if (nextNum === item.number) continue;
        lines[item.lineIndex] = renumberHeadingLine(lines[item.lineIndex]!, nextNum, item.title);
        repairs.push(`review_plain:section_renumber:${item.number}->${nextNum}`);
      }
      changed = true;
      break;
    }
  }

  const mergedHead = lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "");
  const text = (tail.trim() ? `${mergedHead}\n\n${tail.trim()}` : mergedHead).replace(/\n{3,}/g, "\n\n").trim();
  return { text, repairs };
}

function renumberAllTopLevelSequential(plain: string): ReviewPlainSectionContinuityResult {
  const repairs: string[] = [];
  const raw = (plain || "").replace(/\r\n/g, "\n");
  const { head, tail } = splitBeforeWitness(raw);
  const found = headingLineIndexes(head);
  if (found.length < 2) return { text: raw, repairs };
  const nums = found.map((h) => h.number);
  const expected = found.map((_, idx) => idx + 1);
  if (nums.every((n, i) => n === expected[i])) return { text: raw, repairs };

  const lines = head.split("\n");
  let nextNum = 1;
  for (const item of found) {
    if (item.number !== nextNum) {
      lines[item.lineIndex] = renumberHeadingLine(lines[item.lineIndex]!, nextNum, item.title);
      repairs.push(`review_plain:section_renumber:${item.number}->${nextNum}`);
    }
    nextNum += 1;
  }
  const mergedHead = lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "");
  const text = (tail.trim() ? `${mergedHead}\n\n${tail.trim()}` : mergedHead).replace(/\n{3,}/g, "\n\n").trim();
  return { text, repairs };
}

/**
 * Restore a customer-supplied governing-law term if Review/plain dropped it,
 * then fill unused late-section integer holes (10 then 12, 12 then 14).
 */
export function repairReviewPlainSectionContinuity(
  plain: string,
  opts?: ReviewPlainSectionContinuityOpts,
): ReviewPlainSectionContinuityResult {
  const repairs: string[] = [];
  let working = (plain || "").replace(/\r\n/g, "\n");
  if (!working.trim()) return { text: working, repairs };

  const gov = extractSuppliedGoverningLaw(opts?.intakeText, opts?.jurisdiction);
  if (gov && !reviewPlainHasOperativeGoverningLaw(working, gov)) {
    const inserted = insertGoverningLawSection(working, gov);
    working = inserted.text;
    repairs.push(...inserted.repairs);
  }

  // Do not close an unused late hole (12 then 14) before governing law is restored;
  // compressing first would leave Notices as 13 and a later insert would duplicate 13.
  if (reviewPlainHasOperativeGoverningLaw(working, gov)) {
    const late = compressLateUnusedSkips(working);
    working = late.text;
    repairs.push(...late.repairs);
  }

  if (opts?.remintAllTopLevel) {
    const reminted = renumberAllTopLevelSequential(working);
    working = reminted.text;
    repairs.push(...reminted.repairs);
  }

  return { text: working.replace(/\n{3,}/g, "\n\n").trim(), repairs };
}
