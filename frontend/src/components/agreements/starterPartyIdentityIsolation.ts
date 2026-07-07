/**
 * Free starter: isolate legal entity names from stacked Party N blocks and contaminated
 * draft party strings (signer name / title / email local-part must never appear in entity).
 */

import { PARTY_ENTITY_SUFFIX_RE } from "./canonicalPartyIdentityResolver";
import { normalizeCommaSeparatedEntitySuffix } from "./partySlotIdentityNormalize";

const LEGAL_ENTITY_PREFIX_RE =
  /^((?:[A-Za-z0-9][A-Za-z0-9\s&'.-]*?)\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.|Company))\.?/i;

const EMAIL_LINE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const COMMON_SIGNER_TITLE_RE =
  /^(?:CEO|CFO|COO|CTO|CIO|CMO|CPO|President|Vice President|VP|Secretary|Treasurer|Managing Member|Member|Manager|Director|Owner|Partner|General Manager|Principal|Chairman|Chairwoman|Chairperson)$/i;

const PERSON_NAME_LINE_RE = /^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+$/;

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function looksLikeStackedPartyEmailLine(line: string): boolean {
  return EMAIL_LINE_RE.test(norm(line));
}

export function looksLikeStackedPartyTitleLine(line: string): boolean {
  return COMMON_SIGNER_TITLE_RE.test(norm(line));
}

export function looksLikeStackedPartyPersonNameLine(line: string): boolean {
  const t = norm(line);
  if (!t || looksLikeStackedPartyEmailLine(t)) return false;
  if (PARTY_ENTITY_SUFFIX_RE.test(t)) return false;
  if (looksLikeStackedPartyTitleLine(t)) return false;
  return PERSON_NAME_LINE_RE.test(t);
}

const INTAKE_INSTRUCTION_ENTITY_RE =
  /\b(?:require|draft|include\s+(?:provisions|a\b)|commercial\s+terms|execution\s+block|representative\s+name|mailing\s+address\s+for|under\s+which|specialized\s+services)\b/i;

export function looksLikeStackedPartyLegalEntityLine(line: string): boolean {
  const t = norm(line);
  if (!t || looksLikeStackedPartyEmailLine(t)) return false;
  if (t.length > 90) return false;
  if (INTAKE_INSTRUCTION_ENTITY_RE.test(t)) return false;
  if (/\bfor\s+each\s+company\b/i.test(t)) return false;
  return PARTY_ENTITY_SUFFIX_RE.test(t);
}

/** Strip sentence-leading jurisdiction fragments — never part of a legal entity name. */
const JURISDICTION_SENTENCE_PREFIX_RE =
  /^(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming|Venue|Governing\s+Law)\.\s+(?=[A-Z])/i;

export function stripJurisdictionPrefixFromEntityName(raw: string): string {
  let s = norm(raw);
  if (!s) return s;
  for (let i = 0; i < 3; i++) {
    const next = s.replace(JURISDICTION_SENTENCE_PREFIX_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * Collapse repeated entity mentions in one candidate ("Entity LLC. Entity LLC" → "Entity LLC").
 * Preserves "Entity Name, LLC" comma-suffix merges.
 */
export function collapseRepeatedEntityMentionCandidate(raw: string): string {
  let s = stripJurisdictionPrefixFromEntityName(raw);
  if (!s) return s;
  const periodParts = s
    .split(/\.\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (periodParts.length > 1) {
    const withSuffix = periodParts.filter((p) => PARTY_ENTITY_SUFFIX_RE.test(p));
    if (withSuffix.length >= 1) {
      return withSuffix.sort((a, b) => b.length - a.length)[0]!;
    }
    return periodParts[0]!;
  }
  return normalizeCommaSeparatedEntitySuffix(s);
}

/**
 * Truncate a contaminated party label at the first legal-entity suffix.
 * "Blue Canyon Analytics LLC Sarah Mitchell CEO sarah" → "Blue Canyon Analytics LLC"
 */
export function isolateLegalEntityFromContaminatedName(raw: string): string {
  let s = collapseRepeatedEntityMentionCandidate(norm(raw));
  if (!s) return s;
  // TEST536 — strip a trailing role parenthetical ("Redwood Biologics, Inc. (Client)")
  // ONLY when the remainder is still a real legal entity. Without this, the paren blocks
  // comma-suffix normalization ("… , Inc." → "… Inc.") and the whole party is dropped.
  const withoutRoleParen = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (
    withoutRoleParen &&
    withoutRoleParen !== s &&
    PARTY_ENTITY_SUFFIX_RE.test(withoutRoleParen)
  ) {
    s = normalizeCommaSeparatedEntitySuffix(withoutRoleParen);
  }
  const m = s.match(LEGAL_ENTITY_PREFIX_RE);
  if (m?.[1]) return norm(m[1]);
  return s;
}

/** True when a party label carries signer metadata after the entity suffix. */
export function isStackedPartyIdentityContamination(name: string): boolean {
  const t = norm(name);
  if (!t || !LEGAL_ENTITY_PREFIX_RE.test(t)) return false;
  const isolated = isolateLegalEntityFromContaminatedName(t);
  if (!isolated || isolated === t) return false;
  const tail = t.slice(isolated.length).trim();
  if (!tail) return false;
  if (looksLikeStackedPartyPersonNameLine(tail)) return true;
  if (/\b(?:CEO|President|CFO|CTO|Secretary|Treasurer|Manager|Director)\b/i.test(tail)) return true;
  if (/\b[a-z]{2,}@[a-z]/i.test(tail)) return true;
  const words = tail.split(/\s+/);
  const last = words[words.length - 1] || "";
  if (/^[a-z]{2,}$/i.test(last) && !PARTY_ENTITY_SUFFIX_RE.test(last)) return true;
  return tail.length >= 3;
}
