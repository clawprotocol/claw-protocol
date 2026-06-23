/**
 * Canonical Section Structure Completeness Authority — ensures numbered section
 * hierarchies are intact before freeze, recovery adoption, or review render.
 */

import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import { isPaidProNumberedSectionHeadingLine } from "./paidProNumberedSectionHeading";

export type PaidProSectionHierarchyMarker = {
  major: number;
  minors: number[];
  depth: number;
  lineIndex: number;
  line: string;
  kind: "top" | "sub";
};

export type PaidProSectionStructureCompletenessDiagnostics = {
  missingParentSections: number[];
  missingIntermediateSections: string[];
  orphanChildren: string[];
  brokenFamilies: number[];
  truncatedFamilies: number[];
  repairable: boolean;
  fatal: boolean;
};

export type ApplyPaidProSectionStructureCompletenessResult = {
  text: string;
  repairs: string[];
  diagnostics: PaidProSectionStructureCompletenessDiagnostics;
  rejected: boolean;
  rejectReason: string | null;
};

const SUBSECTION_HEADING_RE = /^(\d+)\.(\d+)(?:\.(\d+))?\s+(.+)$/;
const TOP_LEVEL_HEADING_RE = /^(\d{1,2})\.\s+(?!\d+\.\d)(.+)$/;

const MAX_REPAIRABLE_MISSING_PARENTS = 2;
const MAX_REPAIRABLE_MISSING_INTERMEDIATES = 4;

let lastCompletenessLogKey = "";

export function resetPaidProSectionStructureCompletenessLogsForTests(): void {
  lastCompletenessLogKey = "";
}

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

function logSectionStructureCompleteness(payload: Record<string, unknown>): void {
  if (isTestMode()) return;
  const key = JSON.stringify(payload);
  if (key === lastCompletenessLogKey) return;
  lastCompletenessLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-section-structure-completeness]", payload);
}

/** Collect top-level and subsection heading markers from operative text. */
export function collectPaidProSectionHierarchyMarkers(text: string): PaidProSectionHierarchyMarker[] {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text || "");
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const lines = head.replace(/\r\n/g, "\n").split("\n");
  const markers: PaidProSectionHierarchyMarker[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;

    const subMatch = trimmed.match(SUBSECTION_HEADING_RE);
    if (subMatch?.[1] && subMatch[2] && subMatch[4]) {
      const major = Number.parseInt(subMatch[1], 10);
      const minor = Number.parseInt(subMatch[2], 10);
      const tertiary = subMatch[3] ? Number.parseInt(subMatch[3], 10) : null;
      if (major >= 1 && minor >= 1) {
        markers.push({
          major,
          minors: tertiary != null ? [minor, tertiary] : [minor],
          depth: tertiary != null ? 3 : 2,
          lineIndex: i,
          line: trimmed,
          kind: "sub",
        });
      }
      continue;
    }

    if (isPaidProNumberedSectionHeadingLine(trimmed)) {
      const topMatch = trimmed.match(TOP_LEVEL_HEADING_RE);
      if (topMatch?.[1]) {
        markers.push({
          major: Number.parseInt(topMatch[1], 10),
          minors: [],
          depth: 1,
          lineIndex: i,
          line: trimmed,
          kind: "top",
        });
      }
    }
  }

  return markers;
}

function inferParentHeadingTitle(major: number, childLines: readonly string[]): string {
  const joined = childLines.join(" ").toLowerCase();
  if (/warrant|represent|compliance|authority|non-?conflict/i.test(joined)) {
    return "REPRESENTATIONS, WARRANTIES AND COMPLIANCE";
  }
  if (/notice|communication|contact/i.test(joined)) {
    return "NOTICES";
  }
  if (/payment|fee|consideration|invoice/i.test(joined)) {
    return "PAYMENT AND CONSIDERATION";
  }
  if (/confidential|nda|trade secret/i.test(joined)) {
    return "CONFIDENTIALITY";
  }
  if (/intellectual property|work product|license/i.test(joined)) {
    return "INTELLECTUAL PROPERTY";
  }
  if (/terminat|term and/i.test(joined)) {
    return "TERM AND TERMINATION";
  }
  if (/governing law|jurisdiction|venue|dispute/i.test(joined)) {
    return "GOVERNING LAW AND DISPUTE RESOLUTION";
  }
  if (/miscellaneous|counterpart|electronic signature/i.test(joined)) {
    return "MISCELLANEOUS";
  }
  return `SECTION ${major}`;
}

function inferIntermediateHeadingTitle(major: number, minor: number, siblingLines: readonly string[]): string {
  const joined = siblingLines.join(" ").toLowerCase();
  if (/mutual authority|non-?conflict|represent/i.test(joined) && minor === 1) {
    return "Mutual Authority and Non-Conflict";
  }
  if (/warrant|service condition/i.test(joined)) {
    return "Service Warranties and Conditions";
  }
  if (/general|provision/i.test(joined)) {
    return "General Provisions";
  }
  return `Section ${major}.${minor} Provisions`;
}

/** Analyze numbered hierarchy completeness without mutating text. */
export function analyzePaidProSectionStructureCompleteness(
  text: string,
): PaidProSectionStructureCompletenessDiagnostics {
  const markers = collectPaidProSectionHierarchyMarkers(text);
  const topLevel = new Set<number>();
  const subsectionsByMajor = new Map<number, Set<number>>();

  for (const marker of markers) {
    if (marker.kind === "top") {
      topLevel.add(marker.major);
      continue;
    }
    const minor = marker.minors[0];
    if (minor == null) continue;
    const bucket = subsectionsByMajor.get(marker.major) ?? new Set<number>();
    bucket.add(minor);
    subsectionsByMajor.set(marker.major, bucket);
  }

  const missingParentSections: number[] = [];
  const missingIntermediateSections: string[] = [];
  const orphanChildren: string[] = [];
  const brokenFamilies: number[] = [];
  const truncatedFamilies: number[] = [];

  for (const [major, minors] of subsectionsByMajor) {
    if (!topLevel.has(major)) {
      missingParentSections.push(major);
      brokenFamilies.push(major);
    }

    const sorted = [...minors].sort((a, b) => a - b);
    if (sorted.length === 0) continue;

    if (sorted[0]! > 1 && (!topLevel.has(major) || sorted.length >= 2)) {
      for (let m = 1; m < sorted[0]!; m += 1) {
        missingIntermediateSections.push(`${major}.${m}`);
      }
    }

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      for (let gap = prev + 1; gap < curr; gap += 1) {
        missingIntermediateSections.push(`${major}.${gap}`);
      }
    }

    for (const minor of sorted) {
      if (!topLevel.has(major)) {
        orphanChildren.push(`${major}.${minor}`);
      }
    }

    const expectedSpan = sorted[sorted.length - 1]!;
    const presentRatio = sorted.length / expectedSpan;
    if (!topLevel.has(major) && expectedSpan >= 3 && presentRatio < 0.5) {
      truncatedFamilies.push(major);
    }
  }

  const uniqueMissingParents = [...new Set(missingParentSections)].sort((a, b) => a - b);
  const uniqueMissingIntermediates = [...new Set(missingIntermediateSections)];
  const uniqueBroken = [...new Set(brokenFamilies)];
  const uniqueTruncated = [...new Set(truncatedFamilies)];

  const repairable =
    uniqueMissingParents.length <= MAX_REPAIRABLE_MISSING_PARENTS &&
    uniqueMissingIntermediates.length <= MAX_REPAIRABLE_MISSING_INTERMEDIATES &&
    uniqueTruncated.length === 0;

  const fatal =
    uniqueMissingParents.length > MAX_REPAIRABLE_MISSING_PARENTS ||
    uniqueMissingIntermediates.length > MAX_REPAIRABLE_MISSING_INTERMEDIATES ||
    uniqueTruncated.length > 0;

  return {
    missingParentSections: uniqueMissingParents,
    missingIntermediateSections: uniqueMissingIntermediates,
    orphanChildren: [...new Set(orphanChildren)],
    brokenFamilies: uniqueBroken,
    truncatedFamilies: uniqueTruncated,
    repairable: repairable && (uniqueMissingParents.length > 0 || uniqueMissingIntermediates.length > 0),
    fatal: fatal && !repairable,
  };
}

function insertLineBeforeIndex(lines: string[], index: number, line: string): void {
  lines.splice(index, 0, line, "");
}

/** Repair missing parent and intermediate section headings when structurally safe. */
export function repairPaidProSectionStructureCompleteness(text: string): {
  text: string;
  repairs: string[];
  diagnostics: PaidProSectionStructureCompletenessDiagnostics;
} {
  const analysis = analyzePaidProSectionStructureCompleteness(text);
  if (!analysis.repairable) {
    return { text, repairs: [], diagnostics: analysis };
  }

  const witnessIdx = resolveAuthoritativeWitnessIndex(text || "");
  let head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
  const repairs: string[] = [];

  for (const major of analysis.missingParentSections) {
    const markers = collectPaidProSectionHierarchyMarkers(head);
    const childMarkers = markers
      .filter((m) => m.major === major && m.kind === "sub")
      .sort((a, b) => a.lineIndex - b.lineIndex);
    if (childMarkers.length === 0) continue;
    const lines = head.replace(/\r\n/g, "\n").split("\n");
    const firstChild = childMarkers[0]!;
    const title = inferParentHeadingTitle(
      major,
      childMarkers.map((m) => m.line),
    );
    insertLineBeforeIndex(lines, firstChild.lineIndex, `${major}. ${title}`);
    head = lines.join("\n");
    repairs.push(`insert_missing_parent:${major}`);
  }

  for (const missing of analysis.missingIntermediateSections) {
    const markers = collectPaidProSectionHierarchyMarkers(head);
    const [majorStr, minorStr] = missing.split(".");
    const major = Number.parseInt(majorStr ?? "", 10);
    const minor = Number.parseInt(minorStr ?? "", 10);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) continue;
    if (markers.some((m) => m.major === major && m.kind === "sub" && m.minors[0] === minor)) {
      continue;
    }

    const familyMarkers = markers
      .filter((m) => m.major === major && m.kind === "sub")
      .sort((a, b) => a.lineIndex - b.lineIndex);
    const insertBefore =
      familyMarkers.find((m) => (m.minors[0] ?? 0) > minor) ?? familyMarkers[0];
    if (!insertBefore) continue;

    const lines = head.replace(/\r\n/g, "\n").split("\n");
    const title = inferIntermediateHeadingTitle(
      major,
      minor,
      familyMarkers.map((m) => m.line),
    );
    insertLineBeforeIndex(lines, insertBefore.lineIndex, `${major}.${minor} ${title}`);
    head = lines.join("\n");
    repairs.push(`insert_missing_intermediate:${major}.${minor}`);
  }

  const mergedHead = head.replace(/\n{3,}/g, "\n\n").trimEnd();
  const merged = tail ? `${mergedHead}\n\n${tail.trimStart()}` : mergedHead;
  const post = analyzePaidProSectionStructureCompleteness(merged);

  return {
    text: merged.replace(/\n{3,}/g, "\n\n").trimEnd(),
    repairs,
    diagnostics: post,
  };
}

export type ApplyPaidProSectionStructureCompletenessOpts = {
  source?: string;
  phase?: "pre_freeze" | "recovery_adoption" | "review_render" | "post_repair_check";
  /** When true, throw on fatal incomplete structure instead of returning rejected. */
  blockOnFatal?: boolean;
  log?: boolean;
};

/** Validate and optionally repair section hierarchy completeness. */
export function applyPaidProSectionStructureCompletenessAuthority(
  text: string,
  opts?: ApplyPaidProSectionStructureCompletenessOpts,
): ApplyPaidProSectionStructureCompletenessResult {
  const source = opts?.source ?? "section_structure_completeness";
  const phase = opts?.phase ?? "pre_freeze";
  let out = (text || "").replace(/\r\n/g, "\n").trim();
  const repairs: string[] = [];

  let analysis = analyzePaidProSectionStructureCompleteness(out);
  if (analysis.repairable && (analysis.missingParentSections.length > 0 || analysis.missingIntermediateSections.length > 0)) {
    const repaired = repairPaidProSectionStructureCompleteness(out);
    if (repaired.repairs.length > 0) {
      out = repaired.text;
      repairs.push(...repaired.repairs);
      analysis = repaired.diagnostics;
    }
  }

  const rejected =
    analysis.fatal ||
    analysis.missingParentSections.length > 0 ||
    analysis.missingIntermediateSections.length > 0;

  const rejectReason = rejected
    ? analysis.fatal
      ? "section_structure_completeness_fatal"
      : "section_structure_completeness_unresolved"
    : null;

  if (opts?.log !== false && (repairs.length > 0 || rejected)) {
    logSectionStructureCompleteness({
      source,
      phase,
      repairs: repairs.slice(0, 12),
      rejected,
      rejectReason,
      ...analysis,
    });
  }

  if (rejected && opts?.blockOnFatal) {
    throw new Error(
      `[paid-pro-section-structure-completeness-blocked] ${rejectReason} parents=${analysis.missingParentSections.join(",") || "none"} intermediates=${analysis.missingIntermediateSections.slice(0, 6).join(",") || "none"}`,
    );
  }

  return {
    text: out,
    repairs,
    diagnostics: analysis,
    rejected,
    rejectReason,
  };
}

/** Hard gate for canonical freeze — repairs when possible, throws when incomplete. */
export function assertPaidProSectionStructureCompletenessForFreeze(
  text: string,
  source: string,
): string {
  const result = applyPaidProSectionStructureCompletenessAuthority(text, {
    source,
    phase: "pre_freeze",
    blockOnFatal: true,
    log: true,
  });
  if (result.rejected) {
    throw new Error(
      `[paid-pro-sot-freeze-blocked] section_structure_incomplete reason=${result.rejectReason} parents=${result.diagnostics.missingParentSections.join(",") || "none"} intermediates=${result.diagnostics.missingIntermediateSections.slice(0, 8).join(",") || "none"}`,
    );
  }
  return result.text;
}
