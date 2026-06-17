/**
 * Repair standalone orphan section-number lines (Test364) and stranded survival-clause references.
 * Runs in premium-structure-repair before witness / execution blocks.
 */

import {
  isOrphanStandaloneTopLevelSectionNumberLine,
  sanitizeVs01RenderCorpus,
} from "../../vs01/vs01CorpusOrphanSectionSanitizer";

const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;
const TOP_LEVEL_HEADING_RE = /^(\d+)\.\s+(.+)$/;
const THIS_SECTION_TAIL_RE = /this\s+section\.?\s*$/i;

export type PaidProOrphanSectionNumberRepairResult = {
  text: string;
  repairs: string[];
};

function splitBeforeWitness(text: string): { head: string; tail: string } {
  const witnessIdx = text.search(WITNESS_RE);
  return witnessIdx >= 0
    ? { head: text.slice(0, witnessIdx), tail: text.slice(witnessIdx) }
    : { head: text, tail: "" };
}

function nextNonEmptyLineIndex(lines: string[], from: number): number | null {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i]!.trim()) return i;
  }
  return null;
}

/** Join "...this Section" with a stranded orphan `N.` on the following line. */
export function repairStrandedThisSectionReference(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const skip = new Set<number>();
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (skip.has(i)) continue;
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || !THIS_SECTION_TAIL_RE.test(trimmed)) {
      out.push(line);
      continue;
    }

    const nextIdx = nextNonEmptyLineIndex(lines, i + 1);
    if (nextIdx == null) {
      out.push(line);
      continue;
    }

    const nextTrimmed = lines[nextIdx]!.trim();
    const orphanMatch = nextTrimmed.match(/^(\d+)\.\s*$/);
    if (!orphanMatch) {
      out.push(line);
      continue;
    }

    const sectionNum = orphanMatch[1]!;
    const joined = trimmed.replace(THIS_SECTION_TAIL_RE, `this Section ${sectionNum}.`);
    out.push(joined);
    skip.add(nextIdx);
    repairs.push(`stranded_this_section:${sectionNum}`);
  }

  return {
    text: out.join("\n").replace(/\n{3,}/g, "\n\n"),
    repairs,
  };
}

function isTopLevelHeadingLine(line: string): { number: number; title: string } | null {
  const trimmed = line.trim();
  const match = trimmed.match(TOP_LEVEL_HEADING_RE);
  if (!match) return null;
  const title = (match[2] ?? "").trim();
  if (!title || !/[A-Za-z]/.test(title)) return null;
  if (/^\d+\.\d+/.test(trimmed)) return null;
  return { number: Number(match[1]), title };
}

/** Renumber top-level headings sequentially when orphan lines left a trailing offset. */
export function renumberTopLevelHeadingsAfterOrphanRemoval(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const { head, tail } = splitBeforeWitness(text);
  const lines = head.split("\n");
  const headingIndexes: number[] = [];
  const numbers: number[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const parsed = isTopLevelHeadingLine(lines[i]!);
    if (!parsed) continue;
    headingIndexes.push(i);
    numbers.push(parsed.number);
  }

  if (headingIndexes.length < 2) {
    return { text, repairs };
  }

  const base = numbers[0]!;
  const needsRenumber = numbers.some((num, idx) => num !== base + idx);
  if (!needsRenumber) {
    return { text, repairs };
  }

  for (let idx = 0; idx < headingIndexes.length; idx += 1) {
    const lineIdx = headingIndexes[idx]!;
    const parsed = isTopLevelHeadingLine(lines[lineIdx]!);
    if (!parsed) continue;
    const nextNum = base + idx;
    if (parsed.number === nextNum) continue;
    lines[lineIdx] = lines[lineIdx]!.replace(
      TOP_LEVEL_HEADING_RE,
      `${nextNum}. ${parsed.title}`,
    );
    repairs.push(`section_renumber:${parsed.number}->${nextNum}`);
  }

  const mergedHead = lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  const merged = tail
    ? `${mergedHead}\n\n${tail.trim()}`
    : mergedHead;
  return { text: merged.replace(/\n{3,}/g, "\n\n"), repairs };
}

/**
 * Deterministic repair for orphaned standalone section numbers and survival-clause strand breaks.
 */
export function repairPaidProOrphanSectionNumbers(text: string): PaidProOrphanSectionNumberRepairResult {
  const repairs: string[] = [];
  let working = (text || "").replace(/\r\n/g, "\n").trim();
  if (!working) {
    return { text: working, repairs };
  }

  const stranded = repairStrandedThisSectionReference(working);
  working = stranded.text;
  repairs.push(...stranded.repairs);

  const orphanScanBefore = (working.match(/^\d+\.\s*$/gm) ?? []).length;
  const stripped = sanitizeVs01RenderCorpus(working, { boundary: "paid_pro_structure_repair" });
  working = stripped.text;
  if (stripped.removedLines.length > 0) {
    for (const line of stripped.removedLines) {
      repairs.push(`orphan_section_line_removed:${line}`);
    }
  }

  const orphanRemoved =
    stranded.repairs.length > 0 || stripped.removedLines.length > 0 || orphanScanBefore > 0;
  if (orphanRemoved) {
    const renumbered = renumberTopLevelHeadingsAfterOrphanRemoval(working);
    working = renumbered.text;
    repairs.push(...renumbered.repairs);
  }

  return { text: working.replace(/\n{3,}/g, "\n\n").trimEnd(), repairs };
}

export function hasOrphanStandaloneSectionNumberLines(text: string): boolean {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .some((line) => isOrphanStandaloneTopLevelSectionNumberLine(line));
}
