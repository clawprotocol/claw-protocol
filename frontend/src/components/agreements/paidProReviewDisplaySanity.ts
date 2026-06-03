/**
 * Paid Pro review display sanity — allow canonical execution-tail lines after a single witness block.
 */

import { corpusHasPartyNoticeDetails } from "./paidProPartyNoticeDetails";
import { countWitnessExecutionSections } from "./paidProSignerSigningCorpusHygiene";

const PARTY_NOTICE_HEADING_RE = /^\s*Party Notice Details:\s*$/i;
const PARTY_NUMBER_HEADING_RE = /^\s*Party\s+\d+\s*:\s*$/i;
const EXECUTION_SANITY_FIELD_LINE_RE = /^\s*(?:By|Name|Title|Date)\s*:\s*_{2,}/i;
const NOTICE_STYLE_ROLE_HEADING_RE = /^(?:Client|Service\s+Provider)\s*:\s*$/i;

const ALWAYS_GLOBAL_SANITY_PATTERNS: ReadonlyArray<{ reason: string; re: RegExp }> = [
  { reason: "signature_dot", re: /\.signature\b/i },
  { reason: "signature_below", re: /\bsignature\s+below\b/i },
  { reason: "duplicate_opening", re: /Agreement["']?\s*\)\s+is\s+This\s+Agreement\s+is\s+between/i },
  { reason: "with_its_dot", re: /with its\s*\./i },
];

const EXECUTION_TAIL_SANITY_PATTERNS: ReadonlyArray<{ reason: string; re: RegExp }> = [
  { reason: "witness", re: /\bIN WITNESS WHEREOF\b/i },
  { reason: "execution_by_line", re: /^\s*By:\s*_{2,}/im },
  { reason: "execution_name_line", re: /^\s*Name:\s*_{2,}/im },
  { reason: "execution_title_line", re: /^\s*Title:\s*_{2,}/im },
  { reason: "execution_date_line", re: /^\s*Date:\s*_{2,}/im },
];

export type PaidProDisplaySanityExecutionContext = {
  witnessCount: number;
  firstWitnessLineIndex: number;
  hasCanonicalSingleExecutionTail: boolean;
};

function blockHasNoticeStyleSignerLines(lines: readonly string[], start: number): boolean {
  let hasSignerOrLooseEmail = false;
  let hasBy = false;
  for (let j = start + 1; j < lines.length; j += 1) {
    const t = (lines[j] ?? "").trim();
    if (!t) break;
    if (/^Signer\s*:/i.test(t)) hasSignerOrLooseEmail = true;
    if (/^Email\s*:/i.test(t) && !/^Email\s+for\s+Notice/i.test(t)) hasSignerOrLooseEmail = true;
    if (/^By\s*:/i.test(t)) hasBy = true;
    if (/^(?:CLIENT|SERVICE\s+PROVIDER)\s*:/i.test(t)) break;
    if (PARTY_NUMBER_HEADING_RE.test(t)) break;
    if (PARTY_NOTICE_HEADING_RE.test(t)) break;
  }
  return hasSignerOrLooseEmail && !hasBy;
}

function preWitnessHasForbiddenSummaryBlocks(prefix: string): boolean {
  if (corpusHasPartyNoticeDetails(prefix)) return true;
  const lines = prefix.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (PARTY_NOTICE_HEADING_RE.test(trimmed) || PARTY_NUMBER_HEADING_RE.test(trimmed)) {
      return true;
    }
    if (NOTICE_STYLE_ROLE_HEADING_RE.test(trimmed) && blockHasNoticeStyleSignerLines(lines, i)) {
      return true;
    }
  }
  return false;
}

function preWitnessHasExecutionFieldLines(lines: readonly string[], beforeLineIndex: number): boolean {
  for (let i = 0; i < beforeLineIndex; i += 1) {
    if (EXECUTION_SANITY_FIELD_LINE_RE.test((lines[i] ?? "").trim())) return true;
  }
  return false;
}

function tailHasDuplicateRoleHeadings(lines: readonly string[], fromLineIndex: number): boolean {
  let clientHeadings = 0;
  let serviceProviderHeadings = 0;
  for (let i = fromLineIndex; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (/^\s*CLIENT\s*:/i.test(trimmed)) clientHeadings += 1;
    if (/^\s*SERVICE\s+PROVIDER\s*:/i.test(trimmed)) serviceProviderHeadings += 1;
  }
  return clientHeadings > 1 || serviceProviderHeadings > 1;
}

/** Structural gate for allowing witness / execution placeholder lines in the signing tail only. */
export function analyzePaidProDisplaySanityExecutionContext(text: string): PaidProDisplaySanityExecutionContext {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const witnessLineIndices: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/\bIN WITNESS WHEREOF\b/i.test(lines[i] ?? "")) witnessLineIndices.push(i);
  }
  const witnessCount = countWitnessExecutionSections(normalized);
  const firstWitnessLineIndex = witnessLineIndices[0] ?? -1;

  let hasCanonicalSingleExecutionTail = false;
  if (witnessCount === 1 && firstWitnessLineIndex >= 0) {
    const prefix = lines.slice(0, firstWitnessLineIndex).join("\n");
    hasCanonicalSingleExecutionTail =
      !preWitnessHasForbiddenSummaryBlocks(prefix) &&
      !preWitnessHasExecutionFieldLines(lines, firstWitnessLineIndex) &&
      !tailHasDuplicateRoleHeadings(lines, firstWitnessLineIndex);
  }

  return { witnessCount, firstWitnessLineIndex, hasCanonicalSingleExecutionTail };
}

export function isAllowedExecutionTailLine(
  line: string,
  lineIndex: number,
  context: PaidProDisplaySanityExecutionContext,
): boolean {
  if (!context.hasCanonicalSingleExecutionTail || context.firstWitnessLineIndex < 0) return false;
  if (lineIndex < context.firstWitnessLineIndex) return false;
  const trimmed = line.trim();
  if (/\bIN WITNESS WHEREOF\b/i.test(trimmed)) return true;
  return EXECUTION_SANITY_FIELD_LINE_RE.test(trimmed);
}

function textMatchesPatternInPreWitnessRegion(
  text: string,
  re: RegExp,
  firstWitnessLineIndex: number,
): boolean {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const prefix = lines.slice(0, Math.max(0, firstWitnessLineIndex)).join("\n");
  return re.test(prefix);
}

export function detectProReviewDisplaySanityViolations(text: string): string[] {
  const t = (text || "").trim();
  if (!t) return [];

  const context = analyzePaidProDisplaySanityExecutionContext(t);
  const violations: string[] = [];

  for (const { reason, re } of ALWAYS_GLOBAL_SANITY_PATTERNS) {
    if (re.test(t)) violations.push(reason);
  }

  for (const { reason, re } of EXECUTION_TAIL_SANITY_PATTERNS) {
    if (reason === "witness") {
      if (context.witnessCount > 1) {
        violations.push(reason);
        continue;
      }
      if (context.hasCanonicalSingleExecutionTail) continue;
      if (re.test(t)) violations.push(reason);
      continue;
    }

    if (context.hasCanonicalSingleExecutionTail) {
      if (
        context.firstWitnessLineIndex >= 0 &&
        textMatchesPatternInPreWitnessRegion(t, re, context.firstWitnessLineIndex)
      ) {
        violations.push(reason);
      }
      continue;
    }

    if (re.test(t)) violations.push(reason);
  }

  return violations;
}
