/**
 * Canonical Section Structure Completeness Authority — ensures numbered section
 * hierarchies are intact before freeze, recovery adoption, or review render.
 */

import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import { isPaidProNumberedSectionHeadingLine } from "./paidProNumberedSectionHeading";
import {
  detectPaidProSyntheticMalformedSectionHeadings,
} from "./paidProSyntheticMalformedSectionHeadings";
import {
  applyPaidProSectionHeadingTitleAuthority,
  detectPaidProSectionHeadingTitleAnomalies,
  formatPaidProSectionHeadingTitleAnomalyDetails,
} from "./paidProSectionHeadingTitleAuthority";
import {
  isBeforeFirstOperativeSectionLineIndex,
  resolvePaidProDocumentOpeningAuthority,
} from "./paidProDocumentOpeningAuthority";
import {
  hasFalseFragmentSectionHeading,
  repairOrphanNumberFragmentContinuationLines,
} from "./paidProOrphanSectionNumberRepair";
import { classifyPaidProDocumentBlocks } from "./paidProDocumentBlockClassifier";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";

export type PaidProSectionHierarchyMarker = {
  major: number;
  minors: number[];
  depth: number;
  lineIndex: number;
  line: string;
  kind: "top" | "sub";
};

export type PaidProSectionSequenceGap = {
  parentMajor: number;
  missingSiblings: string[];
};

export type PaidProSectionStructureCompletenessDiagnostics = {
  missingParentSections: number[];
  /** Missing ancestor subsection headings (e.g. 11.6 when 11.6.1 exists) — not prior siblings. */
  missingIntermediateSections: string[];
  sequenceGaps: PaidProSectionSequenceGap[];
  orphanChildren: string[];
  brokenFamilies: number[];
  truncatedFamilies: number[];
  repairable: boolean;
  fatal: boolean;
  syntheticMalformedHeadings: string[];
  sectionHeadingTitleAnomalies: string[];
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

function countRemainingHeadingBodyCollapses(text: string): number {
  return classifyPaidProDocumentBlocks(text).filter((block) => {
    if (block.kind !== "main_section_heading") return false;
    const remainder = block.block.slice(block.firstLine.length).trim();
    return Boolean(
      remainder && !isPaidProNumberedSectionHeadingLine(remainder.split("\n")[0]?.trim() ?? ""),
    );
  }).length;
}

function shouldWarnOnlySectionHeadingTitleAnomaliesForSubstantiveFreeze(
  text: string,
  diagnostics: PaidProSectionStructureCompletenessDiagnostics,
): boolean {
  if (text.trim().length < SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) return false;
  if (diagnostics.sectionHeadingTitleAnomalies.length === 0) return false;
  if (diagnostics.missingParentSections.length > 0) return false;
  if (diagnostics.missingIntermediateSections.length > 0) return false;
  if (diagnostics.syntheticMalformedHeadings.length > 0) return false;
  if (diagnostics.fatal) return false;
  if (countRemainingHeadingBodyCollapses(text) > 0) return false;
  const openingAuthority = resolvePaidProDocumentOpeningAuthority(text);
  const operativeRegionAnomaly = detectPaidProSectionHeadingTitleAnomalies(text).some(
    (anomaly) => !isBeforeFirstOperativeSectionLineIndex(anomaly.lineIndex, openingAuthority),
  );
  if (operativeRegionAnomaly) return false;
  return true;
}

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

function collectMissingSiblingSequenceGaps(
  major: number,
  sortedMinors: readonly number[],
): string[] {
  if (sortedMinors.length === 0) return [];
  const missingSiblings: string[] = [];
  if (sortedMinors[0]! > 1) {
    for (let m = 1; m < sortedMinors[0]!; m += 1) {
      missingSiblings.push(`${major}.${m}`);
    }
  }
  for (let i = 1; i < sortedMinors.length; i += 1) {
    const prev = sortedMinors[i - 1]!;
    const curr = sortedMinors[i]!;
    for (let gap = prev + 1; gap < curr; gap += 1) {
      missingSiblings.push(`${major}.${gap}`);
    }
  }
  return [...new Set(missingSiblings)];
}

function familyHasInternalSequenceGaps(sortedMinors: readonly number[]): boolean {
  for (let i = 1; i < sortedMinors.length; i += 1) {
    if (sortedMinors[i]! - sortedMinors[i - 1]! > 1) return true;
  }
  return false;
}

function collectMissingAncestorSubsections(markers: readonly PaidProSectionHierarchyMarker[]): string[] {
  const missingAncestors: string[] = [];
  for (const marker of markers) {
    if (marker.kind !== "sub" || marker.depth !== 3 || marker.minors.length < 2) continue;
    const parentSubNum = marker.minors[0]!;
    const ancestorKey = `${marker.major}.${parentSubNum}`;
    const hasDepth2Parent = markers.some(
      (m) =>
        m.kind === "sub" &&
        m.major === marker.major &&
        m.depth === 2 &&
        m.minors[0] === parentSubNum &&
        m.minors.length === 1,
    );
    if (!hasDepth2Parent && !missingAncestors.includes(ancestorKey)) {
      missingAncestors.push(ancestorKey);
    }
  }
  return missingAncestors;
}

function deriveSubsectionTitleFromLine(line: string): string | null {
  const trimmed = line.trim();
  const subMatch = trimmed.match(SUBSECTION_HEADING_RE);
  if (subMatch?.[4]) {
    const title = subMatch[4].trim().replace(/\.\s*$/, "");
    if (title.length >= 4 && /[a-z]/i.test(title)) return title;
  }
  return null;
}

function deriveParentTitleFromChildLines(childLines: readonly string[]): string {
  for (const line of childLines) {
    const fromSub = deriveSubsectionTitleFromLine(line);
    if (fromSub && fromSub.length >= 4) {
      return fromSub.length > 72 ? `${fromSub.slice(0, 72).trim()}…` : fromSub;
    }
  }
  const joined = childLines
    .map((l) => l.replace(SUBSECTION_HEADING_RE, "$4").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (joined.length >= 12) {
    const snippet = joined.slice(0, 72).trim();
    if (snippet.length >= 8) return snippet;
  }
  return "OPERATIVE PROVISIONS";
}

function inferParentHeadingTitle(_major: number, childLines: readonly string[]): string | null {
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
  return deriveParentTitleFromChildLines(childLines);
}

function inferIntermediateHeadingTitle(
  major: number,
  minor: number,
  siblingLines: readonly string[],
): string {
  const joined = siblingLines.join(" ").toLowerCase();
  if (/mutual authority|non-?conflict|represent/i.test(joined) && minor === 1) {
    return "Mutual Authority and Non-Conflict";
  }
  if (/warrant|service condition/i.test(joined)) {
    return "Service Warranties and Conditions";
  }
  if (/general|provision/i.test(joined)) {
    return `General Provisions ${major}.${minor}`;
  }
  const fromSibling = siblingLines.find((line) => deriveSubsectionTitleFromLine(line));
  if (fromSibling) {
    const title = deriveSubsectionTitleFromLine(fromSibling);
    if (title) return title;
  }
  return `Subsection ${major}.${minor}`;
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
  const sequenceGaps: PaidProSectionSequenceGap[] = [];
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

    const missingSiblings = collectMissingSiblingSequenceGaps(major, sorted);
    if (missingSiblings.length > 0) {
      sequenceGaps.push({ parentMajor: major, missingSiblings });
    }

    for (const minor of sorted) {
      if (!topLevel.has(major)) {
        orphanChildren.push(`${major}.${minor}`);
      }
    }

    const loneHighOrphan = sorted.length === 1 && sorted[0]! >= 3;
    const internalGaps = familyHasInternalSequenceGaps(sorted);
    if (!topLevel.has(major) && (loneHighOrphan || internalGaps)) {
      truncatedFamilies.push(major);
    }
  }

  missingIntermediateSections.push(...collectMissingAncestorSubsections(markers));

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
    sequenceGaps,
    orphanChildren: [...new Set(orphanChildren)],
    brokenFamilies: uniqueBroken,
    truncatedFamilies: uniqueTruncated,
    repairable: repairable && (uniqueMissingParents.length > 0 || uniqueMissingIntermediates.length > 0),
    fatal: fatal && !repairable,
    syntheticMalformedHeadings: [],
    sectionHeadingTitleAnomalies: [],
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
  const synthetic = detectPaidProSyntheticMalformedSectionHeadings(merged);
  post.syntheticMalformedHeadings = synthetic.map((s) => s.line);

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

  const orphanFragmentMerge = repairOrphanNumberFragmentContinuationLines(out);
  if (orphanFragmentMerge.repairs.length > 0) {
    out = orphanFragmentMerge.text;
    repairs.push(...orphanFragmentMerge.repairs.map((r) => `orphan_fragment:${r}`));
  }

  let analysis = analyzePaidProSectionStructureCompleteness(out);
  if (analysis.repairable && (analysis.missingParentSections.length > 0 || analysis.missingIntermediateSections.length > 0)) {
    const repaired = repairPaidProSectionStructureCompleteness(out);
    if (repaired.repairs.length > 0) {
      out = repaired.text;
      repairs.push(...repaired.repairs);
      analysis = repaired.diagnostics;
    }
  }

  const syntheticFindings = detectPaidProSyntheticMalformedSectionHeadings(out);
  if (syntheticFindings.length > 0) {
    analysis = {
      ...analysis,
      syntheticMalformedHeadings: syntheticFindings.map((s) => s.line),
    };
  }

  let titleAnomalies = detectPaidProSectionHeadingTitleAnomalies(out);
  if (titleAnomalies.length > 0) {
    const titleRepair = applyPaidProSectionHeadingTitleAuthority(out);
    if (titleRepair.repairs.length > 0) {
      out = titleRepair.text;
      repairs.push(...titleRepair.repairs.map((r) => `section_heading_title:${r}`));
      titleAnomalies = detectPaidProSectionHeadingTitleAnomalies(out);
    }
    if (titleAnomalies.length > 0) {
      analysis = {
        ...analysis,
        sectionHeadingTitleAnomalies: titleAnomalies.map((a) => `${a.code}:${a.line}`),
      };
    }
  }

  if (titleAnomalies.length > 0) {
    const retryTitle = applyPaidProSectionHeadingTitleAuthority(out);
    if (retryTitle.repairs.length > 0) {
      out = retryTitle.text;
      repairs.push(...retryTitle.repairs.map((r) => `section_heading_title_retry:${r}`));
      titleAnomalies = detectPaidProSectionHeadingTitleAnomalies(out);
      if (titleAnomalies.length === 0) {
        analysis = {
          ...analysis,
          sectionHeadingTitleAnomalies: [],
        };
      } else {
        analysis = {
          ...analysis,
          sectionHeadingTitleAnomalies: titleAnomalies.map((a) => `${a.code}:${a.line}`),
        };
      }
    }
  }

  if (titleAnomalies.length > 0) {
    const finalTitle = applyPaidProSectionHeadingTitleAuthority(out);
    if (finalTitle.repairs.length > 0) {
      out = finalTitle.text;
      repairs.push(...finalTitle.repairs.map((r) => `section_heading_title_final:${r}`));
      titleAnomalies = detectPaidProSectionHeadingTitleAnomalies(out);
      if (titleAnomalies.length === 0) {
        analysis = {
          ...analysis,
          sectionHeadingTitleAnomalies: [],
        };
      } else {
        analysis = {
          ...analysis,
          sectionHeadingTitleAnomalies: titleAnomalies.map((a) => `${a.code}:${a.line}`),
        };
      }
    }
  }

  if (hasFalseFragmentSectionHeading(out)) {
    analysis = {
      ...analysis,
      sectionHeadingTitleAnomalies: [
        ...analysis.sectionHeadingTitleAnomalies,
        "false_fragment_section_heading:persisted",
      ],
    };
  }

  const warnOnlyTitleAnomalies = shouldWarnOnlySectionHeadingTitleAnomaliesForSubstantiveFreeze(
    out,
    analysis,
  );
  if (warnOnlyTitleAnomalies && analysis.sectionHeadingTitleAnomalies.length > 0) {
    repairs.push("section_heading_title_anomaly:warn_only_substantive_freeze");
  }

  const rejected =
    analysis.fatal ||
    analysis.missingParentSections.length > 0 ||
    analysis.missingIntermediateSections.length > 0 ||
    analysis.syntheticMalformedHeadings.length > 0 ||
    (!warnOnlyTitleAnomalies && analysis.sectionHeadingTitleAnomalies.length > 0);

  const rejectReason = rejected
    ? analysis.sectionHeadingTitleAnomalies.length > 0 && !warnOnlyTitleAnomalies
      ? "section_heading_title_anomaly"
      : analysis.syntheticMalformedHeadings.length > 0
        ? "section_structure_synthetic_malformed_headings"
        : analysis.fatal
          ? "section_structure_completeness_fatal"
          : "section_structure_completeness_unresolved"
    : null;

  if (opts?.log !== false && (repairs.length > 0 || rejected)) {
    const headingAnomalyDetails =
      titleAnomalies.length > 0
        ? formatPaidProSectionHeadingTitleAnomalyDetails(out, titleAnomalies)
        : [];
    logSectionStructureCompleteness({
      source,
      phase,
      repairs: repairs.slice(0, 12),
      rejected,
      rejectReason,
      headingAnomalyDetails,
      unresolvedSections: {
        missingParents: analysis.missingParentSections,
        missingIntermediates: analysis.missingIntermediateSections.slice(0, 12),
        sequenceGaps: analysis.sequenceGaps.slice(0, 6),
        orphanChildren: analysis.orphanChildren.slice(0, 12),
        truncatedFamilies: analysis.truncatedFamilies,
        brokenFamilies: analysis.brokenFamilies,
        syntheticMalformedHeadings: analysis.syntheticMalformedHeadings.slice(0, 6),
        sectionHeadingTitleAnomalies: analysis.sectionHeadingTitleAnomalies.slice(0, 6),
      },
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

/** Mirror the SoT pre-freeze section-structure gate for acceptance (repair + reject check, no throw). */
export function evaluatePaidProSectionStructureFreezeGate(
  text: string,
  source = "section_structure_freeze_preview",
): {
  ok: boolean;
  rejectReason: string | null;
  text: string;
  diagnostics: PaidProSectionStructureCompletenessDiagnostics;
} {
  const result = applyPaidProSectionStructureCompletenessAuthority(text, {
    source,
    phase: "pre_freeze",
    blockOnFatal: false,
  });
  if (result.rejected) {
    return {
      ok: false,
      rejectReason: result.rejectReason,
      text: result.text,
      diagnostics: result.diagnostics,
    };
  }
  return {
    ok: true,
    rejectReason: null,
    text: result.text,
    diagnostics: result.diagnostics,
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
    const headingAnomalies = result.diagnostics.sectionHeadingTitleAnomalies.slice(0, 6).join("|");
    throw new Error(
      `[paid-pro-sot-freeze-blocked] section_structure_incomplete reason=${result.rejectReason} parents=${result.diagnostics.missingParentSections.join(",") || "none"} intermediates=${result.diagnostics.missingIntermediateSections.slice(0, 8).join(",") || "none"} synthetic=${result.diagnostics.syntheticMalformedHeadings.slice(0, 4).join("|") || "none"} heading_anomalies=${headingAnomalies || "none"}`,
    );
  }
  return result.text;
}
