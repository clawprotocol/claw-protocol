/**
 * Section Structure Authority — display-layer outline integrity validation and repair.
 * Detects orphan numbering restarts, mixed subsection schemes, duplicate/skipped section
 * identifiers, heading/body collapse, and execution-block hierarchy contamination.
 *
 * Display-only — never mutates source-of-truth, signer, party, or execution authority.
 */

import { splitGluedSectionHeadingFromLine } from "./documentSectionHeadingSplit";
import { isPaidProNumberedSectionHeadingLine } from "./paidProNumberedSectionHeading";

export type SectionStructureAnomalyCode =
  | "orphan_numbering_restart"
  | "numbering_hierarchy_violation"
  | "duplicate_section_identifier"
  | "skipped_section_identifier"
  | "mixed_subsection_scheme"
  | "heading_body_collapse"
  | "execution_block_hierarchy_contamination";

export type SectionStructureDiagnostic = {
  code: SectionStructureAnomalyCode;
  message: string;
  lineIndex?: number;
  detail?: string;
};

export type SectionStructureAnalysisResult = {
  diagnostics: SectionStructureDiagnostic[];
  anomalyCount: number;
};

export type SectionStructureRepairResult = SectionStructureAnalysisResult & {
  text: string;
  repairs: string[];
  repaired: boolean;
};

export type ApplySectionStructureIntegrityOpts = {
  source?: string;
  repair?: boolean;
};

const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;
const EXECUTION_BLOCK_LINE_RE =
  /^(?:IN WITNESS WHEREOF|CLIENT\s*:|SERVICE\s+PROVIDER\s*:|\bSIGNATURES\b|PARTY\s+\d+\s*:)/i;
const TOP_LEVEL_NUM_RE = /^(\d+)\.\s+(?!\d)(.+)$/;
const SUB_LEVEL_RE = /^(\d+)\.(\d+)\.?\s*(.*)$/;
const LETTERED_LIST_RE = /^\(([a-z])\)\s+(.+)$/i;
const HEADING_BODY_GLUE_RE = /^(\d+\.\s+(?!\d+\.\d).+?)\s+(\d+\.\d+\s+.+)$/s;

let lastStructureIntegrityLogKey = "";

export function resetSectionStructureIntegrityLogsForTests(): void {
  lastStructureIntegrityLogKey = "";
}

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

function logSectionStructureDiagnostics(payload: {
  source: string;
  anomalyCount: number;
  diagnostics: SectionStructureDiagnostic[];
  repaired: boolean;
  repairs: string[];
}): void {
  if (isTestMode()) return;
  const codes = payload.diagnostics.map((d) => d.code).join(",");
  const key = `${payload.source}|${payload.anomalyCount}|${codes}|${payload.repaired}|${payload.repairs.join(",")}`;
  if (key === lastStructureIntegrityLogKey) return;
  lastStructureIntegrityLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[section-structure-integrity]", payload);
}

function splitBeforeWitness(text: string): { head: string; tail: string; witnessLineIndex: number | null } {
  const witnessIdx = text.search(WITNESS_RE);
  if (witnessIdx < 0) {
    return { head: text, tail: "", witnessLineIndex: null };
  }
  const beforeWitness = text.slice(0, witnessIdx);
  const witnessLineIndex = beforeWitness.split("\n").length;
  return { head: beforeWitness, tail: text.slice(witnessIdx), witnessLineIndex };
}

function isProseLine(trimmed: string): boolean {
  if (!trimmed) return false;
  if (TOP_LEVEL_NUM_RE.test(trimmed) && isPaidProNumberedSectionHeadingLine(trimmed)) return false;
  if (SUB_LEVEL_RE.test(trimmed)) return false;
  if (LETTERED_LIST_RE.test(trimmed)) return false;
  if (EXECUTION_BLOCK_LINE_RE.test(trimmed)) return false;
  if (/^\d+\.\s+(?!\d)/.test(trimmed) && !isPaidProNumberedSectionHeadingLine(trimmed)) return false;
  return trimmed.length >= 8 && /[a-z]/i.test(trimmed);
}

function isNumericListItemLine(trimmed: string): boolean {
  return /^\d+\.\s+(?!\d)/.test(trimmed) && !isPaidProNumberedSectionHeadingLine(trimmed);
}

/** Reject glued-heading splits that leave a single-word tail (e.g. "2. Additional" / "deliverables"). */
function wouldInvalidlySplitGluedHeadingLine(trimmed: string): boolean {
  const split = splitGluedSectionHeadingFromLine(trimmed);
  if (split === trimmed) return false;
  const parts = split
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2) return false;
  const bodyWords = (parts[1] ?? "").split(/\s+/).filter(Boolean);
  return bodyWords.length === 1 && (parts[1]?.length ?? 0) < 32;
}

function shouldAttemptHeadingBodyCollapseSplit(trimmed: string): boolean {
  if (isNumericListItemLine(trimmed)) return false;
  if (wouldInvalidlySplitGluedHeadingLine(trimmed)) return false;
  return splitGluedSectionHeadingFromLine(trimmed) !== trimmed;
}

function collectTopSectionHeadings(lines: readonly string[]): { lineIndex: number; number: number; title: string }[] {
  const headings: { lineIndex: number; number: number; title: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!isPaidProNumberedSectionHeadingLine(trimmed)) continue;
    const match = trimmed.match(TOP_LEVEL_NUM_RE);
    if (!match?.[1] || !match[2]) continue;
    headings.push({
      lineIndex: i,
      number: Number(match[1]),
      title: match[2].trim(),
    });
  }
  return headings;
}

function detectHeadingBodyCollapse(lines: readonly string[]): SectionStructureDiagnostic[] {
  const diagnostics: SectionStructureDiagnostic[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    if (HEADING_BODY_GLUE_RE.test(trimmed)) {
      diagnostics.push({
        code: "heading_body_collapse",
        message: "Main section heading glued to subsection on same line",
        lineIndex: i,
        detail: trimmed.slice(0, 80),
      });
      continue;
    }
    if (isNumericListItemLine(trimmed)) continue;
    if (shouldAttemptHeadingBodyCollapseSplit(trimmed)) {
      diagnostics.push({
        code: "heading_body_collapse",
        message: "Section heading glued to body text on same line",
        lineIndex: i,
        detail: trimmed.slice(0, 80),
      });
    }
  }
  return diagnostics;
}

function hasSubsectionEvidenceForSection(lines: readonly string[], sectionNum: number): boolean {
  const subRe = new RegExp(`^${sectionNum}\\.\\d+(?:\\.\\d+)*`);
  return lines.some((line) => subRe.test(line.trim()));
}

function detectDuplicateAndSkippedSections(
  headings: readonly { lineIndex: number; number: number; title: string }[],
  lines: readonly string[],
): SectionStructureDiagnostic[] {
  const diagnostics: SectionStructureDiagnostic[] = [];
  const seen = new Map<number, number>();
  for (const heading of headings) {
    const prior = seen.get(heading.number);
    if (prior != null) {
      diagnostics.push({
        code: "duplicate_section_identifier",
        message: `Duplicate top-level section number ${heading.number}`,
        lineIndex: heading.lineIndex,
        detail: heading.title,
      });
    } else {
      seen.set(heading.number, heading.lineIndex);
    }
  }

  if (headings.length >= 2) {
    const sorted = [...headings].sort((a, b) => a.lineIndex - b.lineIndex);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (curr.number - prev.number > 1) {
        let hasMissingSectionWithoutSubsections = false;
        for (let missing = prev.number + 1; missing < curr.number; missing += 1) {
          if (!hasSubsectionEvidenceForSection(lines, missing)) {
            hasMissingSectionWithoutSubsections = true;
            break;
          }
        }
        if (hasMissingSectionWithoutSubsections) {
          diagnostics.push({
            code: "skipped_section_identifier",
            message: `Skipped top-level section number between ${prev.number} and ${curr.number}`,
            lineIndex: curr.lineIndex,
            detail: curr.title,
          });
        }
      }
    }
  }

  return diagnostics;
}

function isNumericListInSubsectionContext(line: string, parentSection: number): boolean {
  const match = line.trim().match(TOP_LEVEL_NUM_RE);
  if (!match?.[1]) return false;
  const num = Number(match[1]);
  return num <= parentSection;
}

function isTopLevelSectionBreakInSubsectionContext(line: string, parentSection: number): boolean {
  if (!isPaidProNumberedSectionHeadingLine(line)) return false;
  const match = line.trim().match(TOP_LEVEL_NUM_RE);
  if (!match?.[1]) return false;
  const num = Number(match[1]);
  return num > parentSection;
}

function detectMixedSubsectionScheme(lines: readonly string[]): SectionStructureDiagnostic[] {
  const diagnostics: SectionStructureDiagnostic[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    const subMatch = trimmed.match(SUB_LEVEL_RE);
    if (!subMatch) {
      i += 1;
      continue;
    }

    const parentSection = Number(subMatch[1]);
    const subsectionStart = i;
    i += 1;
    let scheme: "lettered" | "numeric" | null = null;

    while (i < lines.length) {
      const probe = lines[i]!.trim();
      if (!probe) {
        i += 1;
        continue;
      }
      if (WITNESS_RE.test(probe)) break;
      if (isTopLevelSectionBreakInSubsectionContext(probe, parentSection)) break;
      const nextSub = probe.match(SUB_LEVEL_RE);
      if (nextSub && Number(nextSub[1]) !== parentSection) break;
      if (nextSub && Number(nextSub[1]) === parentSection) {
        scheme = null;
        i = subsectionStart;
        break;
      }

      if (LETTERED_LIST_RE.test(probe)) {
        if (scheme === "numeric") {
          diagnostics.push({
            code: "mixed_subsection_scheme",
            message: `Mixed lettered and numeric list styles under section ${parentSection}`,
            lineIndex: i,
          });
          break;
        }
        scheme = "lettered";
        i += 1;
        continue;
      }

      if (isNumericListInSubsectionContext(probe, parentSection)) {
        if (scheme === "lettered") {
          diagnostics.push({
            code: "mixed_subsection_scheme",
            message: `Mixed lettered and numeric list styles under section ${parentSection}`,
            lineIndex: i,
          });
          break;
        }
        scheme = "numeric";
        i += 1;
        continue;
      }

      if (isProseLine(probe)) {
        i += 1;
        continue;
      }
      i += 1;
    }
    if (i <= subsectionStart) i = subsectionStart + 1;
  }
  return diagnostics;
}

function detectOrphanNumberingRestarts(lines: readonly string[]): SectionStructureDiagnostic[] {
  const diagnostics: SectionStructureDiagnostic[] = [];
  let lastSubsectionParent: number | null = null;
  let proseAfterSubsection = false;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;

    if (WITNESS_RE.test(trimmed)) break;

    if (isPaidProNumberedSectionHeadingLine(trimmed)) {
      lastSubsectionParent = null;
      proseAfterSubsection = false;
      continue;
    }

    const subMatch = trimmed.match(SUB_LEVEL_RE);
    if (subMatch) {
      lastSubsectionParent = Number(subMatch[1]);
      proseAfterSubsection = false;
      continue;
    }

    if (isProseLine(trimmed) && lastSubsectionParent != null) {
      proseAfterSubsection = true;
      continue;
    }

    if (isNumericListItemLine(trimmed) && lastSubsectionParent != null && proseAfterSubsection) {
      const listNum = Number(trimmed.match(/^(\d+)\./)?.[1]);
      if (listNum === lastSubsectionParent || listNum === 1) {
        diagnostics.push({
          code: "orphan_numbering_restart",
          message: `Orphan top-level-style numbering restart after subsection ${lastSubsectionParent}.x prose`,
          lineIndex: i,
          detail: trimmed.slice(0, 80),
        });
      } else {
        diagnostics.push({
          code: "numbering_hierarchy_violation",
          message: "Numbered list restarts after prose within subsection context",
          lineIndex: i,
          detail: trimmed.slice(0, 80),
        });
      }
      proseAfterSubsection = false;
      continue;
    }

    if (LETTERED_LIST_RE.test(trimmed)) {
      proseAfterSubsection = false;
    }
  }

  return diagnostics;
}

function detectExecutionBlockContamination(tail: string, witnessLineIndex: number | null): SectionStructureDiagnostic[] {
  if (!tail.trim()) return [];
  const diagnostics: SectionStructureDiagnostic[] = [];
  const tailLines = tail.split("\n");
  for (let i = 0; i < tailLines.length; i += 1) {
    const trimmed = tailLines[i]!.trim();
    if (!trimmed || EXECUTION_BLOCK_LINE_RE.test(trimmed)) continue;
    if (isPaidProNumberedSectionHeadingLine(trimmed) || SUB_LEVEL_RE.test(trimmed)) {
      diagnostics.push({
        code: "execution_block_hierarchy_contamination",
        message: "Numbered hierarchy content inside execution block",
        lineIndex: witnessLineIndex != null ? witnessLineIndex + i : i,
        detail: trimmed.slice(0, 80),
      });
    }
  }
  return diagnostics;
}

/** Analyze outline hierarchy integrity without mutating text. */
export function analyzeSectionStructureIntegrity(text: string): SectionStructureAnalysisResult {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    return { diagnostics: [], anomalyCount: 0 };
  }

  const { head, tail, witnessLineIndex } = splitBeforeWitness(normalized);
  const lines = head.split("\n");
  const diagnostics: SectionStructureDiagnostic[] = [
    ...detectHeadingBodyCollapse(lines),
    ...detectDuplicateAndSkippedSections(collectTopSectionHeadings(lines), lines),
    ...detectMixedSubsectionScheme(lines),
    ...detectOrphanNumberingRestarts(lines),
    ...detectExecutionBlockContamination(tail, witnessLineIndex),
  ];

  return { diagnostics, anomalyCount: diagnostics.length };
}

function repairDuplicateSectionIdentifiers(
  lines: string[],
  duplicateDiagnostics: readonly SectionStructureDiagnostic[],
): { lines: string[]; repairs: string[] } {
  const repairs: string[] = [];
  if (duplicateDiagnostics.length === 0) {
    return { lines, repairs };
  }

  const out = [...lines];
  for (const diagnostic of duplicateDiagnostics) {
    if (diagnostic.code !== "duplicate_section_identifier" || diagnostic.lineIndex == null) continue;
    const line = out[diagnostic.lineIndex];
    if (!line) continue;
    const trimmed = line.trim();
    if (!isPaidProNumberedSectionHeadingLine(trimmed)) continue;
    const match = trimmed.match(TOP_LEVEL_NUM_RE);
    if (!match?.[2]) continue;
    const demoted = match[2].trim();
    if (demoted && demoted !== trimmed) {
      out[diagnostic.lineIndex] = demoted;
      repairs.push(`duplicate_section_identifier:demoted:${match[1]}`);
    }
  }

  return { lines: out, repairs };
}

function repairOrphanNumberingRestarts(lines: string[]): { lines: string[]; repairs: string[] } {
  const repairs: string[] = [];
  const out = [...lines];
  let lastSubsectionParent: number | null = null;
  let proseAfterSubsection = false;

  for (let i = 0; i < out.length; i += 1) {
    const trimmed = out[i]!.trim();
    if (!trimmed) continue;
    if (WITNESS_RE.test(trimmed)) break;

    if (isPaidProNumberedSectionHeadingLine(trimmed)) {
      lastSubsectionParent = null;
      proseAfterSubsection = false;
      continue;
    }

    const subMatch = trimmed.match(SUB_LEVEL_RE);
    if (subMatch) {
      lastSubsectionParent = Number(subMatch[1]);
      proseAfterSubsection = false;
      continue;
    }

    if (isProseLine(trimmed) && lastSubsectionParent != null) {
      proseAfterSubsection = true;
      continue;
    }

    if (isNumericListItemLine(trimmed) && lastSubsectionParent != null && proseAfterSubsection) {
      const demoted = trimmed.replace(/^\d+\.\s+/, "").trim();
      if (demoted && demoted !== trimmed) {
        out[i] = demoted;
        repairs.push("orphan_numbering_restart:demoted_to_body");
      }
      proseAfterSubsection = false;
    }
  }

  return { lines: out, repairs };
}

/** Sentence-ending period glued to a top-level section heading (e.g. "...termination.12. Disputes"). */
const JOINED_TOP_LEVEL_SECTION_HEADING_RE = /([a-z)])(\.)(\d{1,2}\.\s+)(?=[A-Z][A-Za-z])/g;

export function repairJoinedTopLevelSectionHeadings(text: string): { text: string; repairs: string[] } {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  if (!JOINED_TOP_LEVEL_SECTION_HEADING_RE.test(normalized)) {
    return { text: normalized, repairs: [] };
  }
  JOINED_TOP_LEVEL_SECTION_HEADING_RE.lastIndex = 0;
  let repairs = 0;
  const repaired = normalized.replace(JOINED_TOP_LEVEL_SECTION_HEADING_RE, (_match, prior, period, heading) => {
    repairs += 1;
    return `${prior}${period}\n\n${heading}`;
  });
  return {
    text: repaired.replace(/\n{3,}/g, "\n\n"),
    repairs: repairs > 0 ? [`joined_top_level_section_heading:${repairs}`] : [],
  };
}

function repairHeadingBodyCollapse(lines: string[]): { lines: string[]; repairs: string[] } {
  const repairs: string[] = [];
  const out = lines.map((line) => {
    const trimmed = line.trim();
    const glued = trimmed.match(HEADING_BODY_GLUE_RE);
    if (glued?.[1] && glued[2]) {
      repairs.push("heading_body_collapse:main_subsection_split");
      return `${glued[1].trim()}\n${glued[2].trim()}`;
    }
    if (isNumericListItemLine(trimmed)) return line;
    if (wouldInvalidlySplitGluedHeadingLine(trimmed)) return line;
    const split = splitGluedSectionHeadingFromLine(line);
    if (split !== line) {
      repairs.push("heading_body_collapse:split");
      return split;
    }
    return line;
  });
  return { lines: out, repairs };
}

/** Repair clearly invalid structures while preserving legitimate legal drafting patterns. */
export function repairSectionStructureIntegrity(
  text: string,
  priorAnalysis?: SectionStructureAnalysisResult,
): SectionStructureRepairResult {
  const normalized = (text || "").replace(/\r\n/g, "\n").trimEnd();
  if (!normalized.trim()) {
    return {
      text: "",
      diagnostics: [],
      anomalyCount: 0,
      repairs: [],
      repaired: false,
    };
  }

  const analysis = priorAnalysis ?? analyzeSectionStructureIntegrity(normalized);
  const joinedHeadings = repairJoinedTopLevelSectionHeadings(normalized);
  const workingText = joinedHeadings.text;
  const { head, tail } = splitBeforeWitness(workingText);
  const repairs: string[] = [...joinedHeadings.repairs];

  let lines = head.split("\n");
  const collapse = repairHeadingBodyCollapse(lines);
  if (collapse.repairs.length > 0) {
    lines = collapse.lines;
    repairs.push(...collapse.repairs);
  }

  const duplicates = repairDuplicateSectionIdentifiers(
    lines,
    analysis.diagnostics.filter((d) => d.code === "duplicate_section_identifier"),
  );
  if (duplicates.repairs.length > 0) {
    lines = duplicates.lines;
    repairs.push(...duplicates.repairs);
  }

  const orphan = repairOrphanNumberingRestarts(lines);
  if (orphan.repairs.length > 0) {
    lines = orphan.lines;
    repairs.push(...orphan.repairs);
  }

  const mergedHead = lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  const merged = tail ? `${mergedHead}\n\n${tail.trimStart()}` : mergedHead;
  const postAnalysis = analyzeSectionStructureIntegrity(merged);

  return {
    text: merged.replace(/\n{3,}/g, "\n\n").trimEnd(),
    diagnostics: postAnalysis.diagnostics.length > 0 ? postAnalysis.diagnostics : analysis.diagnostics,
    anomalyCount: postAnalysis.anomalyCount,
    repairs,
    repaired: repairs.length > 0,
  };
}

/** Analyze and optionally repair section structure for display surfaces. */
export function applySectionStructureIntegrity(
  text: string,
  opts: ApplySectionStructureIntegrityOpts = {},
): SectionStructureRepairResult {
  const source = opts.source ?? "section_structure_integrity";
  const analysis = analyzeSectionStructureIntegrity(text);
  const result =
    opts.repair === false
      ? { text, diagnostics: analysis.diagnostics, anomalyCount: analysis.anomalyCount, repairs: [], repaired: false }
      : repairSectionStructureIntegrity(text, analysis);

  if (analysis.anomalyCount > 0 || result.repaired) {
    logSectionStructureDiagnostics({
      source,
      anomalyCount: analysis.anomalyCount,
      diagnostics: analysis.diagnostics,
      repaired: result.repaired,
      repairs: result.repairs,
    });
  }

  return result;
}
