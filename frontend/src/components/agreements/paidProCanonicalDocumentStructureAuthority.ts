/**
 * Canonical Document Structure Authority — pre-freeze structural normalization for Paid Pro corpus.
 * Ensures numbered section headings, body paragraphs, title, and execution blocks remain isolated
 * before SoT establishment, review acceptance, signer preparation, and snapshot generation.
 */

import { repairGluedSectionHeadingsInText } from "./documentSectionHeadingSplit";
import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import {
  classifyPaidProDocumentBlocks,
  detectPaidProPlainParagraphHeadingLeaks,
} from "./paidProDocumentBlockClassifier";
import { repairPaidProDocumentTitleOpening } from "./paidProDocumentTitleOpeningRepair";
import { normalizePaidProOrphanSubsections } from "./normalizePaidProOrphanSubsections";
import { repairPaidProOrphanSectionNumbers } from "./paidProOrphanSectionNumberRepair";
import { repairSplitPaidProHeadingFragments } from "./repairSplitPaidProHeadingFragments";
import {
  applySectionStructureIntegrity,
  type SectionStructureRepairResult,
} from "./sectionStructureAuthority";
import { isPaidProNumberedSectionHeadingLine } from "./paidProNumberedSectionHeading";
import { splitGluedNumberedSectionLine } from "./paidProNumberedSectionHeadingBodySplit";
import {
  applyPaidProSectionStructureCompletenessAuthority,
} from "./paidProSectionStructureCompletenessAuthority";

export type PaidProCanonicalStructureDiagnostics = {
  headingBodyCollapseCount: number;
  headingContinuationRepairs: number;
  orphanNumberRepairs: number;
  numberingRepairCount: number;
  headingPromotionCount: number;
  headingDemotionCount: number;
  structuralAnomalyCount: number;
};

export type ApplyPaidProCanonicalDocumentStructureAuthorityOpts = {
  source?: string;
  /** When true, emit [paid-pro-canonical-structure-authority] diagnostics (skipped in vitest). */
  log?: boolean;
  /** pre_freeze | post_freeze_check — post path is diagnostic-only by default. */
  phase?: "pre_freeze" | "post_freeze_check";
};

export type ApplyPaidProCanonicalDocumentStructureAuthorityResult = {
  text: string;
  repairs: string[];
  diagnostics: PaidProCanonicalStructureDiagnostics;
  structure: SectionStructureRepairResult;
};

let lastCanonicalStructureLogKey = "";

export function resetPaidProCanonicalDocumentStructureAuthorityLogsForTests(): void {
  lastCanonicalStructureLogKey = "";
}

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

function repairHeadingBodyCollapseInHead(head: string): { text: string; count: number } {
  let count = 0;
  const blocks = head.split(/\n\n+/);
  const outBlocks: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split("\n");
    if (lines.length === 1) {
      const split = splitGluedNumberedSectionLine(trimmed);
      if (split) {
        outBlocks.push(split.heading);
        outBlocks.push(split.body);
        count += 1;
        continue;
      }
      outBlocks.push(trimmed);
      continue;
    }

    const expanded: string[] = [];
    for (const line of lines) {
      const split = splitGluedNumberedSectionLine(line.trim());
      if (split) {
        expanded.push(split.heading);
        expanded.push(split.body);
        count += 1;
      } else {
        expanded.push(line);
      }
    }
    outBlocks.push(expanded.join("\n"));
  }

  return { text: outBlocks.join("\n\n"), count };
}

function ensureHeadingBodyBlockSpacing(head: string): { text: string; promotions: number } {
  let promotions = 0;
  const blocks = head.split(/\n\n+/);
  const out: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const firstLine = block.split("\n")[0]?.trim() ?? "";
    if (isPaidProNumberedSectionHeadingLine(firstLine) && block.includes("\n")) {
      const [headingLine, ...rest] = block.split("\n");
      const body = rest.join("\n").trim();
      if (headingLine?.trim() && body && !isPaidProNumberedSectionHeadingLine(body.split("\n")[0]?.trim() ?? "")) {
        out.push(headingLine.trim());
        out.push(body);
        promotions += 1;
        continue;
      }
    }
    out.push(trimmed);
  }

  return { text: out.join("\n\n"), promotions };
}

function logCanonicalStructureAuthority(payload: Record<string, unknown>): void {
  if (isTestMode()) return;
  const key = JSON.stringify(payload);
  if (key === lastCanonicalStructureLogKey) return;
  lastCanonicalStructureLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-canonical-structure-authority]", payload);
}

/** Apply canonical document structure repairs — idempotent and safe pre-freeze. */
export function applyPaidProCanonicalDocumentStructureAuthority(
  text: string,
  opts?: ApplyPaidProCanonicalDocumentStructureAuthorityOpts,
): ApplyPaidProCanonicalDocumentStructureAuthorityResult {
  const source = opts?.source ?? "canonical_document_structure_authority";
  const phase = opts?.phase ?? "pre_freeze";
  const repairs: string[] = [];
  const diagnostics: PaidProCanonicalStructureDiagnostics = {
    headingBodyCollapseCount: 0,
    headingContinuationRepairs: 0,
    orphanNumberRepairs: 0,
    numberingRepairCount: 0,
    headingPromotionCount: 0,
    headingDemotionCount: 0,
    structuralAnomalyCount: 0,
  };

  let out = (text || "").replace(/\r\n/g, "\n").trim();
  if (!out) {
    return {
      text: "",
      repairs,
      diagnostics,
      structure: {
        text: "",
        diagnostics: [],
        anomalyCount: 0,
        repairs: [],
        repaired: false,
      },
    };
  }

  const titleOpening = repairPaidProDocumentTitleOpening(out);
  if (titleOpening.repairs.length > 0) {
    out = titleOpening.text;
    repairs.push(...titleOpening.repairs.map((r) => `title:${r}`));
  }

  const witnessIdx = resolveAuthoritativeWitnessIndex(out);
  const head = witnessIdx >= 0 ? out.slice(0, witnessIdx) : out;
  const tail = witnessIdx >= 0 ? out.slice(witnessIdx) : "";

  const collapse = repairHeadingBodyCollapseInHead(head);
  diagnostics.headingBodyCollapseCount = collapse.count;
  if (collapse.count > 0) {
    repairs.push(`structure:heading_body_collapse:${collapse.count}`);
  }

  const gluedHead = repairGluedSectionHeadingsInText(collapse.text);
  if (gluedHead !== collapse.text) {
    repairs.push("structure:glued_section_headings");
  }

  const collapseAfterGlued = repairHeadingBodyCollapseInHead(gluedHead);
  if (collapseAfterGlued.count > 0) {
    diagnostics.headingBodyCollapseCount += collapseAfterGlued.count;
    repairs.push(`structure:heading_body_collapse:${collapseAfterGlued.count}`);
  }

  const spacing = ensureHeadingBodyBlockSpacing(collapseAfterGlued.text);
  diagnostics.headingPromotionCount = spacing.promotions;
  if (spacing.promotions > 0) {
    repairs.push(`structure:heading_body_block_spacing:${spacing.promotions}`);
  }

  const splitFragments = repairSplitPaidProHeadingFragments(spacing.text);
  diagnostics.headingContinuationRepairs = splitFragments.repairs.length;
  if (splitFragments.repairs.length > 0) {
    out = `${splitFragments.text}${tail ? `\n\n${tail.trimStart()}` : ""}`.replace(/\n{3,}/g, "\n\n").trimEnd();
    repairs.push(...splitFragments.repairs.map((r) => `heading_continuation:${r}`));
  } else {
    out = `${spacing.text}${tail ? `\n\n${tail.trimStart()}` : ""}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  }

  const orphans = normalizePaidProOrphanSubsections(out, { source });
  diagnostics.orphanNumberRepairs = orphans.orphanSectionsRepaired;
  if (orphans.orphanSectionsRepaired > 0) {
    out = orphans.text;
    repairs.push(...orphans.repairs.map((r) => `orphan_subsection:${r}`));
  }

  const orphanNumbers = repairPaidProOrphanSectionNumbers(out);
  diagnostics.numberingRepairCount = orphanNumbers.repairs.length;
  if (orphanNumbers.repairs.length > 0) {
    out = orphanNumbers.text;
    repairs.push(...orphanNumbers.repairs.map((r) => `orphan_section_number:${r}`));
  }

  const structure = applySectionStructureIntegrity(out, { source, repair: phase === "pre_freeze" });
  if (structure.repaired) {
    out = structure.text;
    repairs.push(...structure.repairs.map((r) => `section_structure:${r}`));
  }
  diagnostics.structuralAnomalyCount = structure.anomalyCount;

  if (phase === "pre_freeze") {
    const completeness = applyPaidProSectionStructureCompletenessAuthority(out, {
      source: `${source}:section_completeness`,
      phase: "pre_freeze",
      blockOnFatal: false,
      log: opts?.log !== false,
    });
    if (completeness.repairs.length > 0) {
      out = completeness.text;
      repairs.push(...completeness.repairs.map((r) => `section_completeness:${r}`));
    }
    if (completeness.rejected) {
      repairs.push(`section_completeness:unresolved:${completeness.rejectReason ?? "unknown"}`);
    }
  }

  const leaks = detectPaidProPlainParagraphHeadingLeaks(out);
  diagnostics.headingDemotionCount = leaks.plainParagraphHeadingLeakCount;

  const remainingHeadingBodyCollapses = classifyPaidProDocumentBlocks(out).filter((block) => {
    if (block.kind !== "main_section_heading") return false;
    const remainder = block.block.slice(block.firstLine.length).trim();
    return Boolean(
      remainder && !isPaidProNumberedSectionHeadingLine(remainder.split("\n")[0]?.trim() ?? ""),
    );
  }).length;
  if (remainingHeadingBodyCollapses > 0) {
    repairs.push(`structure:remaining_heading_body_collapse:${remainingHeadingBodyCollapses}`);
  }

  if (opts?.log !== false && (repairs.length > 0 || diagnostics.structuralAnomalyCount > 0)) {
    logCanonicalStructureAuthority({
      source,
      phase,
      repairs: repairs.slice(0, 12),
      remainingHeadingBodyCollapses,
      ...diagnostics,
    });
  }

  return {
    text: out.replace(/\n{3,}/g, "\n\n").trimEnd(),
    repairs: [...new Set(repairs)],
    diagnostics,
    structure,
  };
}
