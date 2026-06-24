/**
 * Detect and repair stitched / duplicated Pro corpus blocks before acceptance or render.
 */

import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import { normalizeProAgreementSectionContinuity } from "./normalizeProAgreementSectionContinuity";

const OPENING_RECITAL_RE =
  /\b(?:entered\s+into\s+as\s+of\s+the\s+Effective\s+Date\s+by\s+and\s+between|This\s+(?:Services|Consulting)\s+Agreement\b[\s\S]{0,120}?\bis\s+entered\s+into)/gi;

const DUPLICATE_PAYMENT_HEADING_RE = /^\s*\d+\.\s+PAYMENT\s+AND\s+CONSIDERATION\s*$/gim;

const FALSE_TOP_LEVEL_IF_HEADING_RE = /^(\d+)\.\s+(If\s+.+)$/i;

export type PaidProCorpusDuplicationDiagnostics = {
  duplicateOpeningRecitals: number;
  duplicatePaymentHeadings: number;
  falseIfHeadings: number;
  repeatedPreamblePhrase: boolean;
  duplicateMiscellaneousSections: number;
  duplicateSignaturesFollowMarkers: number;
};

export function diagnosePaidProCorpusDuplication(text: string): PaidProCorpusDuplicationDiagnostics {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text || "");
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const openingMatches = head.match(OPENING_RECITAL_RE) ?? [];
  const paymentMatches = head.match(DUPLICATE_PAYMENT_HEADING_RE) ?? [];
  let falseIfHeadings = 0;
  let duplicateMiscellaneous = 0;
  let duplicateSignaturesFollow = 0;
  for (const line of head.split("\n")) {
    const trimmed = line.trim();
    const falseHeading = trimmed.match(FALSE_TOP_LEVEL_IF_HEADING_RE);
    if (falseHeading && /^(?:If|The|Each|Either|Any|Unless|When)\b/i.test(falseHeading[2])) {
      falseIfHeadings += 1;
    }
    if (/^\d+\.\s+Miscellaneous\b/i.test(trimmed)) duplicateMiscellaneous += 1;
    if (/^\[?\s*SIGNATURES\s+FOLLOW\s*\]?$/i.test(trimmed)) duplicateSignaturesFollow += 1;
  }
  const preamblePhrase =
    /\bentered\s+into\s+as\s+of\s+the\s+Effective\s+Date\s+by\s+and\s+between\b/gi;
  const preambleCount = (head.match(preamblePhrase) ?? []).length;
  return {
    duplicateOpeningRecitals: openingMatches.length,
    duplicatePaymentHeadings: paymentMatches.length,
    falseIfHeadings,
    repeatedPreamblePhrase: preambleCount >= 2,
    duplicateMiscellaneousSections: duplicateMiscellaneous,
    duplicateSignaturesFollowMarkers: duplicateSignaturesFollow,
  };
}

export function rejectPaidProCorpusDuplication(text: string): { ok: boolean; reasons: string[] } {
  const diag = diagnosePaidProCorpusDuplication(text);
  const reasons: string[] = [];
  if (diag.repeatedPreamblePhrase || diag.duplicateOpeningRecitals >= 2) {
    reasons.push("duplicate_opening_recital");
  }
  if (diag.duplicatePaymentHeadings >= 2) {
    reasons.push("duplicate_payment_and_consideration_heading");
  }
  if (diag.falseIfHeadings >= 2) {
    reasons.push("false_top_level_if_heading");
  }
  if (diag.duplicateMiscellaneousSections >= 2) {
    reasons.push("duplicate_miscellaneous_section");
  }
  if (diag.duplicateSignaturesFollowMarkers >= 2) {
    reasons.push("duplicate_signatures_follow_marker");
  }
  return { ok: reasons.length === 0, reasons };
}

/** Repair false `N. If …` headings and dedupe repeated section blocks. */
export function repairPaidProCorpusDuplication(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");

  const witnessIdx = resolveAuthoritativeWitnessIndex(out);
  const head = witnessIdx >= 0 ? out.slice(0, witnessIdx) : out;
  const tail = witnessIdx >= 0 ? out.slice(witnessIdx) : "";
  const lines = head.split("\n");
  const repairedLines: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const falseHeading = trimmed.match(FALSE_TOP_LEVEL_IF_HEADING_RE);
    if (falseHeading && /^(?:If|The|Each|Either|Any|Unless|When)\b/i.test(falseHeading[2])) {
      const prevIdx = repairedLines.length - 1;
      while (prevIdx >= 0 && !repairedLines[prevIdx]?.trim()) {
        /* skip blanks */
      }
      const prev = repairedLines[repairedLines.length - 1]?.trim() ?? "";
      if (/Section\s*$/i.test(prev) || /described\s+in\s+Section\s*$/i.test(prev)) {
        repairedLines[repairedLines.length - 1] = `${prev} ${falseHeading[2].trim()}`;
        repairs.push(`false_if_heading_merged:${falseHeading[1]}`);
        continue;
      }
      if (prev && !/^\d+\.\s+/.test(prev)) {
        repairedLines[repairedLines.length - 1] = `${prev} ${falseHeading[2].trim()}`;
        repairs.push(`false_if_heading_merged:${falseHeading[1]}`);
        continue;
      }
    }
    repairedLines.push(line);
  }

  out = repairedLines.join("\n") + (tail ? tail : "");
  const diagAfterMerge = diagnosePaidProCorpusDuplication(out);
  const needsSectionContinuity =
    repairs.length > 0 ||
    diagAfterMerge.duplicatePaymentHeadings >= 2 ||
    diagAfterMerge.duplicateOpeningRecitals >= 2 ||
    diagAfterMerge.duplicateMiscellaneousSections >= 2 ||
    diagAfterMerge.duplicateSignaturesFollowMarkers >= 2;
  if (needsSectionContinuity) {
    const sections = normalizeProAgreementSectionContinuity(out);
    if (sections.repairs.length > 0) {
      out = sections.text;
      repairs.push(...sections.repairs.map((r) => `section_continuity:${r}`));
    }
  }

  return { text: out.replace(/\n{3,}/g, "\n\n").trimEnd(), repairs };
}

export function applyPaidProCorpusDuplicationAuthority(text: string): {
  text: string;
  repairs: string[];
  rejected: boolean;
  reasons: string[];
} {
  const repaired = repairPaidProCorpusDuplication(text);
  const rejection = rejectPaidProCorpusDuplication(repaired.text);
  return {
    text: repaired.text,
    repairs: repaired.repairs,
    rejected: !rejection.ok,
    reasons: rejection.reasons,
  };
}
