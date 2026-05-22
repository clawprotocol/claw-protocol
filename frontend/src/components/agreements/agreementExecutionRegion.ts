/**
 * Execution / signature region anchors for agreement QA (batch harness + placeholder safety).
 * Avoids matching operative prose like "signature process" via loose SIGNATURES? patterns.
 */

import {
  LAWDOG_ESIGN_CLAUSE,
  LAWDOG_WITNESS_EXECUTION_SENTENCE,
} from "./premiumExecutionNormalization";

const WITNESS_HEADING_RE = /\bIN WITNESS WHEREOF\b/gi;
const SIGNATURES_HEADING_RE = /^\s*(?:\d+\.?\s*)?SIGNATURES\s*\.?\s*$/gim;
const EXECUTION_HEADING_RE = /^\s*(?:\d+\.?\s*)?EXECUTION\s*\.?\s*$/gim;
const MANUAL_SIG_GRID_RE = /\n\s*By:\s*(?:_{2,}|\[SIGNATURE\])/i;

/** Normalize entity suffix punctuation for stable name matching in QA. */
export function normalizeLegalEntityNameForMatch(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.\s*$/g, "")
    .replace(/,/g, "")
    .replace(/\bL\.?\s*L\.?\s*C\.?\b/gi, "llc")
    .replace(/\bIncorporated\b/gi, "inc")
    .replace(/\bInc\.?\b/gi, "inc")
    .replace(/\bCorporation\b/gi, "corp")
    .replace(/\bCorp\.?\b/gi, "corp")
    .toLowerCase();
}

export function textContainsLegalEntityName(haystack: string, party: string): boolean {
  if (!haystack || !party) return false;
  if (haystack.includes(party)) return true;
  const core = party.replace(/\.\s*$/g, "").trim();
  if (core !== party && haystack.includes(core)) return true;
  const normHay = normalizeLegalEntityNameForMatch(haystack);
  const normParty = normalizeLegalEntityNameForMatch(party);
  return normHay.includes(normParty);
}

function collectRegexIndices(text: string, re: RegExp): number[] {
  const indices: number[] = [];
  const pattern = new RegExp(re.source, re.flags);
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index != null) indices.push(m.index);
  }
  return indices;
}

/** Index of the canonical execution footer (witness, headings, or LawDog closing). */
export function findAgreementExecutionRegionStart(text: string): number {
  const candidates: number[] = [
    ...collectRegexIndices(text, WITNESS_HEADING_RE),
    ...collectRegexIndices(text, SIGNATURES_HEADING_RE),
    ...collectRegexIndices(text, EXECUTION_HEADING_RE),
  ];

  const lawdogWitness = text.indexOf(LAWDOG_WITNESS_EXECUTION_SENTENCE);
  if (lawdogWitness >= 0) candidates.push(lawdogWitness);

  const lawdogEsign = text.indexOf(LAWDOG_ESIGN_CLAUSE);
  if (lawdogEsign >= 0) candidates.push(lawdogEsign);

  if (!candidates.length) return -1;
  return Math.max(...candidates);
}

export function extractKeyContactsRegion(text: string, beforeIdx?: number): string {
  const head = beforeIdx != null && beforeIdx >= 0 ? text.slice(0, beforeIdx) : text;
  return (
    head.match(
      /\n\s*KEY\s+CONTACTS\s*\n([\s\S]*?)(?=\n\n(?:This Agreement may be executed|IN WITNESS WHEREOF|SCHEDULE\s+[A-Z]|\n\s*\d+\.|\n\s*(?:NOTICES|DISPUTES)\b|$))/i,
    )?.[1] ?? ""
  );
}

/** Paid Pro replaces wet-signature grids with LawDog workflow + e-sign clause. */
export function isLawDogWorkflowExecutionFooter(text: string, anchorIdx: number): boolean {
  const tail = text.slice(anchorIdx);
  const hasLawDog =
    tail.includes(LAWDOG_WITNESS_EXECUTION_SENTENCE) ||
    tail.includes(LAWDOG_ESIGN_CLAUSE) ||
    /LawDog\s+(?:signing\s+)?workflow/i.test(tail);
  if (!hasLawDog) return false;
  const window = tail.slice(0, 4_000);
  return !MANUAL_SIG_GRID_RE.test(window);
}
