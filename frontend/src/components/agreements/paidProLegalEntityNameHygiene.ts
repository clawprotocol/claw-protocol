/**
 * Shared legal-entity name hygiene for Paid Pro party/execution surfaces.
 */

import { dedupeEntitySuffixes } from "./partyFormat";

const RECITAL_EXECUTION_PARTY_PREFIX_RE =
  /^(?:this\s+(?:mutual\s+[\w\s]+?\s+)?agreement|agreement|entered\s+into|between|by\s+and\s+between)\b/i;

const TRAILING_DUPLICATE_SUFFIX_RUN_RE =
  /\b((?:[A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+)*)\s+(?:Systems\s+Inc\.?|LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC))\s+(?:Systems\s+)?(?:Inc\.?|LLC|Corp\.?|Ltd\.?|Limited|Systems\s+Inc\.?)\.?\s*$/i;

const RECITAL_FRAGMENT_ANYWHERE_RE =
  /\bis entered into\b|\bas of the effective date\b|\bby and between\b|\bthis agreement is between\b/i;

/** Full opening recital with Client / Service Provider parentheticals — keep in operative body. */
export function isCanonicalPaidProOpeningRecitalLine(line: string): boolean {
  const t = String(line || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "");
  if (t.length < 24) return false;
  if (!/\(\s*["']?Client["']?\s*\)/i.test(t)) return false;
  if (!/\(\s*["']?Service\s+Provider["']?\s*\)/i.test(t)) return false;
  return /\b(?:between|by\s+and\s+between|entered\s+into)\b/i.test(t);
}

export function isRecitalFragmentExecutionPartyLine(line: string): boolean {
  const t = String(line || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "");
  if (!t || t.length < 8) return false;
  if (isCanonicalPaidProOpeningRecitalLine(t)) return false;
  if (RECITAL_EXECUTION_PARTY_PREFIX_RE.test(t)) return true;
  if (/^this agreement is between\b/i.test(t)) return true;
  if (RECITAL_FRAGMENT_ANYWHERE_RE.test(t)) return true;
  if (/^and\s+[A-Z]/i.test(t) && /\b(?:LLC|Inc\.?|Corp\.?|Ltd\.?|Limited|Systems)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** "Iron Vale Systems Inc. Systems Inc" → "Iron Vale Systems Inc." */
export function repairDuplicatedLegalEntitySuffixPhrase(name: string): string {
  let s = dedupeEntitySuffixes(String(name || "").replace(/\s+/g, " ").trim());
  if (!s) return s;
  s = s.replace(/^(.*\bSystems\s+Inc\.?)\s+Systems(?:\s+Inc\.?)?\s*$/i, "$1");
  const collapsed = s.replace(TRAILING_DUPLICATE_SUFFIX_RUN_RE, "$1");
  if (collapsed !== s) s = collapsed.trim();
  s = s.replace(/\bSystems\s+\.(?=\s|$)/gi, "Systems Inc.");
  s = s.replace(/\b(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?)\s+\.(?=\s+[a-z])/gi, "$1.");
  return s.trim();
}

export function repairOrphanedLegalEntitySuffixSpacingInCorpus(text: string): { text: string; repairs: number } {
  let repairs = 0;
  const out = String(text || "").replace(/\r\n/g, "\n").replace(
    /\b([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]+)*\s+Systems)\s+\.\s+(?=[a-z])/g,
    (_match, prefix: string) => {
      repairs += 1;
      return `${prefix} Inc. `;
    },
  );
  return { text: out, repairs };
}

export function repairDuplicatedLegalEntitySuffixInCorpus(text: string): { text: string; repairs: number } {
  let repairs = 0;
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 12) return line;
    if (!/\b(?:LLC|Inc\.?|Corp\.?|Ltd\.?|Limited|Systems\s+Inc)\b/i.test(trimmed)) return line;
    const repaired = repairDuplicatedLegalEntitySuffixPhrase(trimmed);
    if (repaired !== trimmed) {
      repairs += 1;
      return line.replace(trimmed, repaired);
    }
    return line;
  });
  return { text: out.join("\n"), repairs };
}
