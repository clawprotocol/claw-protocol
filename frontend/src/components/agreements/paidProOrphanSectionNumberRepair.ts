/**
 * Repair standalone orphan section-number lines (Test364) and stranded survival-clause references.
 * Runs in premium-structure-repair before witness / execution blocks.
 */

import {
  isOrphanStandaloneTopLevelSectionNumberLine,
  sanitizeVs01RenderCorpus,
} from "../../vs01/vs01CorpusOrphanSectionSanitizer";
import { isPaidProHeadingContinuationFragment } from "./repairSplitPaidProHeadingFragments";

const BODY_SENTENCE_START_RE =
  /^(?:The|This|Each|Either|Any|Neither|Both|When|If|Unless|Upon|Where|As|An|A|In|For|Client|Service Provider|Neither party|Either party|During|Within|After|Before|All|Some|Such|Notwithstanding)\b/i;
const BODY_VERB_RE =
  /\b(?:will|shall|must|may|should|are|is|was|were|have|has|had|agrees?|represents?)\b/i;

function nextNonEmptyLineIndex(lines: readonly string[], from: number): number | null {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i]!.trim()) return i;
  }
  return null;
}

function isCanonicalSplitOperativeSectionHeadingLine(
  lines: readonly string[],
  lineIndex: number,
  title: string,
): boolean {
  if (!isFalseFragmentSectionTitle(title)) return false;
  const nextIdx = nextNonEmptyLineIndex(lines, lineIndex + 1);
  if (nextIdx == null) return false;
  const nextTrimmed = lines[nextIdx]!.trim();
  if (!nextTrimmed || /^\d+\.\s/.test(nextTrimmed)) return false;
  if (isPaidProHeadingContinuationFragment(nextTrimmed)) return false;
  if (isFalseFragmentSectionTitle(nextTrimmed.replace(/[.,;:]+$/, ""))) return false;
  if (BODY_VERB_RE.test(nextTrimmed)) return true;
  if (BODY_SENTENCE_START_RE.test(nextTrimmed)) return true;
  return /[a-z]/.test(nextTrimmed) && nextTrimmed.length >= 16;
}

const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;
const EXECUTION_BLOCK_START_RE =
  /^(?:IN WITNESS WHEREOF|CLIENT\s*:|SERVICE\s+PROVIDER\s*:|\bSIGNATURES\b)/i;
const TOP_LEVEL_HEADING_RE = /^(\d+)\.\s+(.+)$/;
const THIS_SECTION_TAIL_RE = /this\s+section\.?\s*$/i;

/** One-word titles that are continuation fragments, not real section headings. */
export const FALSE_FRAGMENT_SECTION_TITLE_WORDS = new Set([
  "service",
  "provider",
  "client",
  "if",
  "each",
  "either",
  "the",
  "upon",
  "unless",
  "when",
  "during",
  "within",
  "after",
  "before",
  "neither",
  "both",
  "notwithstanding",
  "all",
  "some",
  "such",
  "an",
  "a",
  "in",
  "for",
  "where",
  "as",
  "one",
  "party",
  "no",
  "not",
  "any",
  "upon",
  "fees",
  "invoices",
]);

const BODY_CONTINUATION_START_RE =
  /^(?:Provider|Client|will|shall|may|must|party|parties|agrees?|represents?)\b/i;

export function isFalseFragmentSectionTitle(title: string): boolean {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length !== 1) return false;
  const normalized = words[0].replace(/[.,;:]+$/, "").toLowerCase();
  return FALSE_FRAGMENT_SECTION_TITLE_WORDS.has(normalized);
}

export function hasFalseFragmentSectionHeading(text: string): boolean {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    const match = trimmed.match(TOP_LEVEL_HEADING_RE);
    if (!match?.[2] || /^\d+\.\d+/.test(trimmed)) continue;
    if (
      isFalseFragmentSectionTitle(match[2]) &&
      !isCanonicalSplitOperativeSectionHeadingLine(lines, i, match[2])
    ) {
      return true;
    }
  }
  return false;
}

function mergeFragmentWithContinuationLine(fragment: string, continuation: string): string | null {
  const frag = fragment.trim();
  const cont = continuation.trim();
  if (!frag || !cont) return null;
  if (/^provider\b/i.test(cont) && /^service$/i.test(frag)) {
    return `Service ${cont}`;
  }
  if (/^client\b/i.test(cont) && /^service$/i.test(frag)) {
    return `Service ${cont}`;
  }
  if (isFalseFragmentSectionTitle(frag) && BODY_CONTINUATION_START_RE.test(cont)) {
    return `${frag} ${cont}`;
  }
  if (isFalseFragmentSectionTitle(frag) && /[a-z]/.test(cont)) {
    return `${frag} ${cont}`;
  }
  return null;
}

function isContinuationBodyLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 8) return false;
  if (isOrphanStandaloneTopLevelSectionNumberLine(t)) return false;
  if (TOP_LEVEL_HEADING_RE.test(t) && !/^\d+\.\d+/.test(t)) return false;
  if (EXECUTION_BLOCK_START_RE.test(t)) return false;
  return /[a-z]/.test(t);
}

/**
 * Merge orphan `N.` + fragment + continuation patterns into operative paragraphs.
 * Example: `5.` / `Service` / `Provider will resume…` => `Service Provider will resume…`
 */
export function repairOrphanNumberFragmentContinuationLines(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const skip = new Set<number>();
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (skip.has(i)) continue;
    const trimmed = lines[i]!.trim();

    const falseHeading = trimmed.match(/^(\d+)\.\s+([A-Za-z]+)\s*$/);
    if (falseHeading?.[2] && isFalseFragmentSectionTitle(falseHeading[2])) {
      const nextIdx = nextNonEmptyLineIndex(lines, i + 1);
      if (nextIdx != null) {
        const merged = mergeFragmentWithContinuationLine(falseHeading[2], lines[nextIdx]!.trim());
        if (merged) {
          out.push(merged);
          skip.add(nextIdx);
          repairs.push(`orphan_fragment_heading_merged:${falseHeading[1]}`);
          continue;
        }
      }
    }

    if (isFalseFragmentSectionTitle(trimmed)) {
      const nextIdx = nextNonEmptyLineIndex(lines, i + 1);
      if (nextIdx != null && isContinuationBodyLine(lines[nextIdx]!)) {
        const merged = mergeFragmentWithContinuationLine(trimmed, lines[nextIdx]!.trim());
        if (merged) {
          out.push(merged);
          skip.add(nextIdx);
          repairs.push(`orphan_title_fragment_merged:${trimmed}`);
          continue;
        }
      }
    }

    if (isOrphanStandaloneTopLevelSectionNumberLine(trimmed)) {
      const fragIdx = nextNonEmptyLineIndex(lines, i + 1);
      if (fragIdx != null) {
        const fragTrimmed = lines[fragIdx]!.trim();
        const contIdx = nextNonEmptyLineIndex(lines, fragIdx + 1);
        if (
          isFalseFragmentSectionTitle(fragTrimmed) &&
          contIdx != null &&
          isContinuationBodyLine(lines[contIdx]!)
        ) {
          const merged = mergeFragmentWithContinuationLine(fragTrimmed, lines[contIdx]!.trim());
          if (merged) {
            out.push(merged);
            skip.add(fragIdx);
            skip.add(contIdx);
            repairs.push(`orphan_number_fragment_merged:${trimmed}`);
            continue;
          }
        }
      }
      out.push(lines[i]!);
      continue;
    }

    out.push(lines[i]!);
  }

  return {
    text: out.join("\n").replace(/\n{3,}/g, "\n\n"),
    repairs,
  };
}

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

function isSubstantiveBodyLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 12) return false;
  if (isOrphanStandaloneTopLevelSectionNumberLine(t)) return false;
  if (isTopLevelHeadingLine(t)) return false;
  if (/^\d+\.\d+\s+/.test(t)) return false;
  if (/^[A-Z][A-Z0-9\s/&-]{4,}$/.test(t) && t.length < 80) return false;
  return /[a-z]/i.test(t);
}

/**
 * Final guard: drop standalone `N.` lines that cannot start a real section, especially
 * terminal orphans immediately before witness / signature block starts.
 */
export function removeOrphanStandaloneSectionNumbersBeforeExecution(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!isOrphanStandaloneTopLevelSectionNumberLine(trimmed)) {
      out.push(line);
      continue;
    }

    const nextIdx = nextNonEmptyLineIndex(lines, i + 1);
    const nextTrimmed = nextIdx != null ? lines[nextIdx]!.trim() : "";
    const terminalBeforeExecution =
      !nextTrimmed ||
      WITNESS_RE.test(nextTrimmed) ||
      EXECUTION_BLOCK_START_RE.test(nextTrimmed);
    const followedByRealHeading = Boolean(nextTrimmed && isTopLevelHeadingLine(nextTrimmed));
    const followedBySubsectionHeading = /^\d+\.\d+\s+\S/.test(nextTrimmed);
    const followedBySubstantiveBody =
      nextIdx != null && isSubstantiveBodyLine(lines[nextIdx]!);

    if (terminalBeforeExecution) {
      repairs.push(`terminal_orphan_before_witness:${trimmed}`);
      continue;
    }
    if (followedByRealHeading || followedBySubsectionHeading || !followedBySubstantiveBody) {
      repairs.push(`orphan_section_line_removed:${trimmed}`);
      continue;
    }
    out.push(line);
  }

  return {
    text: out.join("\n").replace(/\n{3,}/g, "\n\n"),
    repairs,
  };
}

function compactBlankLinesBeforeWitness(text: string): string {
  const witnessIdx = text.search(WITNESS_RE);
  if (witnessIdx < 0) return text;
  const head = text.slice(0, witnessIdx).replace(/\n{3,}/g, "\n\n").trimEnd();
  const tail = text.slice(witnessIdx).trimStart();
  return `${head}\n\n${tail}`;
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

  const fragmentMerge = repairOrphanNumberFragmentContinuationLines(working);
  if (fragmentMerge.repairs.length > 0) {
    working = fragmentMerge.text;
    repairs.push(...fragmentMerge.repairs);
  }

  const orphanScanBefore = (working.match(/^\d+\.\s*$/gm) ?? []).length;
  const terminalGuard = removeOrphanStandaloneSectionNumbersBeforeExecution(working);
  working = terminalGuard.text;
  repairs.push(...terminalGuard.repairs);

  const stripped = sanitizeVs01RenderCorpus(working, { boundary: "paid_pro_structure_repair" });
  working = stripped.text;
  if (stripped.removedLines.length > 0) {
    for (const line of stripped.removedLines) {
      if (!repairs.includes(`orphan_section_line_removed:${line}`)) {
        repairs.push(`orphan_section_line_removed:${line}`);
      }
    }
  }

  const orphanRemoved =
    stranded.repairs.length > 0 ||
    terminalGuard.repairs.length > 0 ||
    stripped.removedLines.length > 0 ||
    orphanScanBefore > 0;
  if (orphanRemoved) {
    const renumbered = renumberTopLevelHeadingsAfterOrphanRemoval(working);
    working = renumbered.text;
    repairs.push(...renumbered.repairs);
  }

  working = compactBlankLinesBeforeWitness(working);

  return { text: working.replace(/\n{3,}/g, "\n\n").trimEnd(), repairs };
}

export function hasOrphanStandaloneSectionNumberLines(text: string): boolean {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .some((line) => isOrphanStandaloneTopLevelSectionNumberLine(line));
}
