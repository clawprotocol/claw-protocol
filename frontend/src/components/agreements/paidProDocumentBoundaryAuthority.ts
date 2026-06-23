/**
 * Document Boundary Authority — platform-level structural integrity for Paid Pro corpora.
 * Repairs section/heading fusion, duplicate clause families, execution isolation, and notice
 * contact boundaries before authoritative freeze and across acceptance surfaces.
 */

import { countStandaloneClauseFamilyHeadings } from "./clauseFamilyRegistry";
import { repairGluedSectionHeadingsInText } from "./documentSectionHeadingSplit";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { dedupeStandaloneOperativeClauseFamilies } from "./operativeClauseFamilyDedup";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { repairPaidProOrphanSectionNumbers } from "./paidProOrphanSectionNumberRepair";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  applyPaidProNoticeContactAuthority,
  type PaidProNoticeContactAuthorityOpts,
} from "./paidProNoticeContactAuthority";
import { assertClauseFamilyStructuralIntegrityForFreeze } from "./clauseFamilyStructuralIntegrity";
import { hasInlineMalformedNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  analyzeMultiPartyExecutionBlockShape,
  resolveAcceptanceManifestRecordsForExecution,
} from "./paidProAcceptanceExecutionBlockInvariant";

export type PaidProDocumentBoundaryAuthorityOpts = PaidProNoticeContactAuthorityOpts & {
  /** When true (freeze path), unresolved boundary violations throw. */
  blockOnViolation?: boolean;
  /** Party authority for clause-family structural validation at freeze. */
  parties?: readonly import("./paidProSignerMetadataAuthority").PaidProSignerMetadataParty[];
  /** Diagnostics — draft-derived party row count (may exceed canonical authority). */
  draftPartyCount?: number;
  /** Diagnostics — session handoff slot count before trim. */
  handoffPartySlots?: number;
};

export type PaidProDocumentBoundaryAuthorityResult = {
  text: string;
  repairs: string[];
  violations: string[];
  ok: boolean;
};

const RECITAL_FUSED_SECTION_RE = /Parties\."\d+\./i;

function lineHasInlineFusedTopLevelSection(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || /^\d+\.\s+/.test(trimmed)) return false;
  if (/[a-z]+\.\d+\.\s+(?:Notices|GOVERNING|Services|Relationship|MISCELLANEOUS|TERM|PAYMENT)/i.test(trimmed)) {
    return true;
  }
  return /\.\d+\.\s+Notices\b/i.test(trimmed);
}

function corpusHasInlineFusedTopLevelSection(corpus: string): boolean {
  return corpus.replace(/\r\n/g, "\n").split("\n").some(lineHasInlineFusedTopLevelSection);
}

/** Extra fusion repairs before the shared heading-split pass. */
export function repairDocumentBoundaryFusion(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");
  const before = out;

  out = out.replace(/([A-Za-z]+)\."(\d+\.\s+)/g, "$1.\"\n\n$2");
  out = out.replace(/([a-z]+)\.(\d+\.\s+Notices\b)/gi, "$1.\n\n$2");
  out = out.replace(/([a-z]+)\.(\d+\.\s+GOVERNING\b)/gi, "$1.\n\n$2");
  out = out.replace(/([a-z])\.\s*(\d+\.\s+(?!\d+\.\d)(?:Notices|GOVERNING|Services|Relationship))/gi, "$1.\n\n$2");
  out = out.replace(/([a-z])\.\s*(\d+\.\s+(?!\d+\.\d)[A-Z])/g, "$1.\n\n$2");
  out = out.replace(/(\d)\.(\d+\.\s+(?!\d+\.\d)[A-Z])/g, "$1.\n\n$2");
  out = out.replace(/([.!?)"\u201d])\s*(\d+\.\s+(?!\d+\.\d)[A-Z])/g, "$1\n\n$2");

  if (hasInlineMalformedNoticeStanzas(out)) {
    out = out.replace(/\s+(If to\s+)/gi, "\n\n$1");
    repairs.push("boundary:split_inline_notice_stanzas");
  }

  out = repairGluedSectionHeadingsInText(out);

  const fixedLines: string[] = [];
  for (const line of out.split("\n")) {
    let segment = line;
    if (lineHasInlineFusedTopLevelSection(line)) {
      segment = line
        .replace(/([a-z]+)\.(\d+\.\s+Notices\b)/gi, "$1.\n\n$2")
        .replace(/([a-z]+)\.(\d+\.\s+GOVERNING\b)/gi, "$1.\n\n$2");
      repairs.push("boundary:split_fused_line");
    }
    fixedLines.push(...segment.split("\n"));
  }
  out = fixedLines.join("\n");

  if (out !== before) repairs.push("boundary:repair_fusion");
  return { text: out.replace(/\n{3,}/g, "\n\n").trimEnd(), repairs: [...new Set(repairs)] };
}

export function detectDocumentBoundaryViolations(text: string): string[] {
  const corpus = (text || "").replace(/\r\n/g, "\n");
  const issues = new Set<string>();
  if (RECITAL_FUSED_SECTION_RE.test(corpus)) issues.add("recital_fused_section");
  if (corpusHasInlineFusedTopLevelSection(corpus)) issues.add("inline_top_level_section");
  if (hasInlineMalformedNoticeStanzas(corpus)) issues.add("inline_malformed_notices");
  if (countStandaloneClauseFamilyHeadings(corpus, "governing_law") > 1) {
    issues.add("duplicate_governing_law");
  }
  if (countStandaloneClauseFamilyHeadings(corpus, "notices") > 1) {
    issues.add("duplicate_notices");
  }
  if (countPaidProExecutionBlocks(corpus) > 1) issues.add("duplicate_execution_block");
  return [...issues];
}

export function applyPaidProDocumentBoundaryAuthority(
  raw: string,
  opts?: PaidProDocumentBoundaryAuthorityOpts,
): PaidProDocumentBoundaryAuthorityResult {
  const repairs: string[] = [];
  let out = (raw || "").replace(/\r\n/g, "\n");

  const fusion = repairDocumentBoundaryFusion(out);
  if (fusion.text !== out) {
    out = fusion.text;
    repairs.push(...fusion.repairs);
  }

  const display = preparePaidProReviewDisplayPlain(out);
  if (display.text !== out) {
    out = display.text;
    repairs.push(...display.repairs.map((r) => `display:${r}`));
  }

  if (/\bIN WITNESS WHEREOF\b/i.test(out)) {
    const executionManifest = resolveAcceptanceManifestRecordsForExecution({
      draft: opts?.draft ?? null,
      intakeText: opts?.intakeText ?? null,
    });
    const skipMultiPartyExecutionNormalize =
      executionManifest.length >= 3 &&
      !analyzeMultiPartyExecutionBlockShape(out, executionManifest).malformed;
    if (!skipMultiPartyExecutionNormalize) {
      const execution = enforcePaidProSingleExecutionBlock(out);
      if (execution.text !== out) {
        out = execution.text;
        repairs.push(...execution.repairs.map((r) => `execution:${r}`));
      }
    }
  }

  const renumbered = repairPaidProOrphanSectionNumbers(out);
  if (renumbered.text !== out) {
    out = renumbered.text;
    repairs.push(...renumbered.repairs.map((r) => `section:${r}`));
  }

  const deduped = dedupeStandaloneOperativeClauseFamilies(out);
  if (deduped.text !== out) {
    out = deduped.text;
    repairs.push(...deduped.repairs);
  }

  const postDedupeRenumber = repairPaidProOrphanSectionNumbers(out);
  if (postDedupeRenumber.text !== out) {
    out = postDedupeRenumber.text;
    repairs.push(...postDedupeRenumber.repairs.map((r) => `section:${r}`));
  }

  const postFusion = repairDocumentBoundaryFusion(out);
  if (postFusion.text !== out) {
    out = postFusion.text;
    repairs.push(...postFusion.repairs.map((r) => `post:${r}`));
  }

  const contact = applyPaidProNoticeContactAuthority(out, {
    draft: opts?.draft ?? null,
    intakeText: opts?.intakeText ?? null,
    surface: opts?.surface ?? "paid_pro_document_boundary_authority",
    blockOnUnresolved: opts?.blockOnUnresolved ?? false,
  });
  if (contact.text !== out) {
    out = contact.text;
    repairs.push(...contact.repairs.map((r) => `contact:${r}`));
  }

  const terminalFusion = repairDocumentBoundaryFusion(out);
  if (terminalFusion.text !== out) {
    out = terminalFusion.text;
    repairs.push(...terminalFusion.repairs.map((r) => `terminal:${r}`));
  }

  const terminalRenumber = repairPaidProOrphanSectionNumbers(out);
  if (terminalRenumber.text !== out) {
    out = terminalRenumber.text;
    repairs.push(...terminalRenumber.repairs.map((r) => `terminal:${r}`));
  }

  const violations = detectDocumentBoundaryViolations(out);
  const ok = violations.length === 0 && contact.ok;
  if (opts?.blockOnViolation && violations.length > 0) {
    throw new Error(`[paid-pro-document-boundary-blocked] ${violations.join(",")}`);
  }

  return {
    text: out,
    repairs: [...new Set(repairs)],
    violations,
    ok,
  };
}

export function assertPaidProDocumentBoundaryAuthorityForFreeze(
  text: string,
  opts?: PaidProDocumentBoundaryAuthorityOpts,
): string {
  let out = (text || "").replace(/\r\n/g, "\n");
  let lastViolations: string[] = ["uninitialized"];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = applyPaidProDocumentBoundaryAuthority(out, {
      ...opts,
      blockOnViolation: false,
      blockOnUnresolved: true,
      surface: opts?.surface ?? "paid_pro_document_boundary_freeze",
    });
    out = result.text;
    lastViolations = result.violations;
    if (result.ok && result.violations.length === 0) {
      assertClauseFamilyStructuralIntegrityForFreeze(out, {
        parties: opts?.parties,
        surface: opts?.surface ?? "paid_pro_document_boundary_freeze",
        phase: "post_acceptance",
        draftPartyCount: opts?.draftPartyCount,
        handoffPartySlots: opts?.handoffPartySlots,
      });
      return out;
    }
  }
  throw new Error(
    `[paid-pro-document-boundary-blocked] violations=${lastViolations.join(",") || "contact"}`,
  );
}
