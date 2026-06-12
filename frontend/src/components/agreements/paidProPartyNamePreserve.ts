/**
 * Restore full legal entity names in paid-Pro bodies when the model shortened them.
 * Email-safe: masks addresses before any party-label replacement.
 */

import { extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { maskEmailAddresses, unmaskEmailAddresses } from "./paidProEmailMask";

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company)\.?$/i;

export const PREAMBLE_MAX_LEN = 4_500;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Candidate short labels that may appear instead of the full legal name. */
export function shortFormsFromLegalName(full: string): string[] {
  const t = (full || "").replace(/\s+/g, " ").trim();
  if (t.length < 4) return [];
  const forms: string[] = [];
  const withoutSuffix = t.replace(ENTITY_SUFFIX, "").trim();
  if (withoutSuffix && withoutSuffix.length >= 3 && withoutSuffix !== t) {
    forms.push(withoutSuffix);
    const words = withoutSuffix.split(/\s+/);
    if (words.length >= 2) {
      forms.push(`${words[0]} ${words[1]}`);
    }
    const first = words[0];
    if (first && first.length >= 3) forms.push(first);
  }
  return [...new Set(forms)].filter((f) => f.length >= 3 && f.length < t.length).sort((a, b) => b.length - a.length);
}

/** Hard cap for paid-Pro recital/signature party lists (never body-derived phrase lists). */
export const MAX_AUTHORITATIVE_RECITAL_PARTIES = 12;

const DISALLOWED_PARTY_PHRASE_RE: readonly RegExp[] = [
  /^the\s+parties$/i,
  /^collectively$/i,
  /^each\s+a\s+["']?party["']?$/i,
  /^party$/i,
  /^parties$/i,
  /^the$/i,
  /^agreement$/i,
  /^ownership\s+of\b/i,
  /^implementation\b/i,
  /^implementation\s+support$/i,
  /^process\s+documentation$/i,
  /^configuration\s+assistance$/i,
  /^training\s+services\b/i,
  /^staff\s+training\b/i,
  /^automation\s+deployment\s+services\b/i,
  /^ai\s+workflow\s+consulting$/i,
  /\bwill\s+(?:sign|provide)\b/i,
  /\bengagement\s+term\b/i,
  /\(["']party["']\)/i,
  /^milestone\s+approvals?$/i,
  /^technical\s+specifications?$/i,
  /^or\s+other\b/i,
  /^project\s+deliverables?$/i,
  /^deliverables?$/i,
];

function normPartyLabel(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Reject contract prose fragments mistaken for party names. */
export function isDisallowedPartyPhrase(name: string): boolean {
  const t = normPartyLabel(name);
  if (!t || t.length < 3) return true;
  return DISALLOWED_PARTY_PHRASE_RE.some((re) => re.test(t));
}

/** True when the label looks like a full legal entity (intake-authoritative), not body prose. */
export function isAuthoritativeLegalEntityName(name: string): boolean {
  const t = (name || "").replace(/\s+/g, " ").trim();
  if (t.length < 3 || isDisallowedPartyPhrase(t)) return false;
  if (ENTITY_SUFFIX.test(t)) return true;
  const words = t.split(/\s+/);
  return words.length >= 3 && words.every((w) => /^[A-Z0-9]/.test(w) || /^[&.,'-]+$/.test(w));
}

/** Authoritative ordered full legal parties from intake "between …" list or explicit partyNames. */
export function resolveFullLegalPartiesFromIntake(
  partyNames: readonly string[] | null | undefined,
  intakeRaw: string | null | undefined,
): string[] {
  const intake = String(intakeRaw || "").trim();
  const fromBetween = extractBetweenPartyNameList(intake).filter(isAuthoritativeLegalEntityName);
  if (fromBetween.length >= 2) return fromBetween;
  const fromIntakeEntities = extractAgreementEntityCandidates(intake).filter(isAuthoritativeLegalEntityName);
  if (fromIntakeEntities.length >= 2) return fromIntakeEntities;
  const fromArgs = (partyNames || [])
    .map((n) => String(n || "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length >= 3);
  const authoritativeArgs = fromArgs.filter(isAuthoritativeLegalEntityName);
  if (authoritativeArgs.length >= 2) return authoritativeArgs;
  if (fromArgs.length >= 2) return fromArgs;
  return extractAgreementEntityCandidates(intake);
}

/**
 * Recital/signature polish: intake-authoritative entities only — never draft.parties[] blobs
 * or body-derived phrase lists from generated agreement text.
 */
export function resolveAuthoritativePartiesForRecitalPolish(
  partyNames: readonly string[] | null | undefined,
  intakeRaw: string | null | undefined,
): string[] {
  const intake = String(intakeRaw || "").trim();
  const fromBetween = extractBetweenPartyNameList(intake).filter(isAuthoritativeLegalEntityName);
  const fromIntakeEntities = extractAgreementEntityCandidates(intake).filter(isAuthoritativeLegalEntityName);

  let authoritative: string[] = [];
  if (fromBetween.length >= 2) {
    authoritative = fromBetween;
  } else if (fromIntakeEntities.length >= 2) {
    authoritative = fromIntakeEntities;
  }

  const fromArgs = (partyNames || [])
    .map((n) => String(n || "").replace(/\s+/g, " ").trim())
    .filter(isAuthoritativeLegalEntityName);

  const rawArgCount = (partyNames || []).map((n) => String(n || "").trim()).filter((n) => n.length >= 2).length;

  if (authoritative.length >= 2) {
    if (rawArgCount > authoritative.length + 1) {
      return authoritative.slice(0, MAX_AUTHORITATIVE_RECITAL_PARTIES);
    }
    return authoritative.slice(0, MAX_AUTHORITATIVE_RECITAL_PARTIES);
  }

  if (fromArgs.length >= 2 && fromArgs.length <= MAX_AUTHORITATIVE_RECITAL_PARTIES) {
    return fromArgs;
  }

  return [];
}

function expandShortPartyLabelsToFullLegal(text: string, fullNames: readonly string[]): string {
  const pairs: { short: string; full: string }[] = [];
  for (const full of fullNames) {
    if (!full || full.length < 4) continue;
    for (const short of shortFormsFromLegalName(full)) {
      if (short && short !== full) pairs.push({ short, full });
    }
  }
  pairs.sort((a, b) => b.short.length - a.short.length);

  let out = text;
  for (const { short, full } of pairs) {
    const re = new RegExp(
      `(?<![@.\\w/])${escapeRe(short)}(?![\\w@])(?!\\s*(?:LLC|L\\.L\\.C\\.|Inc\\.?|Incorporated|Corp\\.?|Corporation|Ltd\\.?|Limited|LLP|LP)\\b)`,
      "gi",
    );
    const next = out.replace(re, (match, offset) => {
      if (typeof offset !== "number") return full;
      const window = out.slice(Math.max(0, offset - 8), offset + match.length + 16);
      if (/\[\[LDG_(?:EMAIL|URL)_\d+\]\]/i.test(window)) return match;
      const tail = out.slice(offset + match.length);
      const remainder = full.slice(match.length);
      if (remainder && tail.toLowerCase().startsWith(remainder.toLowerCase())) return match;
      if (out.slice(offset).toLowerCase().startsWith(full.toLowerCase())) return match;
      return full;
    });
    if (next !== out) out = next;
  }
  return out;
}

function preserveInSlice(slice: string, fullNames: readonly string[]): string {
  const { text: masked, emails } = maskEmailAddresses(slice);
  const expanded = expandShortPartyLabelsToFullLegal(masked, fullNames);
  return unmaskEmailAddresses(expanded, emails);
}

/**
 * Expand short party labels to full legal names across the document (email-safe).
 * Used before contact placeholder substitution.
 */
export function preserveFullLegalPartyNames(
  text: string,
  partyNames: readonly string[] | null | undefined,
  intakeRaw?: string | null,
): string {
  const fullNames = resolveFullLegalPartiesFromIntake(partyNames, intakeRaw);
  if (fullNames.length < 2) return text;
  return preserveInSlice(text, fullNames);
}

/**
 * Opening recital + signature/execution tail: full legal entity headings, not contact names.
 */
export function preserveFullLegalPartyNamesInOpeningAndSignatures(
  text: string,
  partyNames: readonly string[] | null | undefined,
  intakeRaw?: string | null,
): string {
  const fullNames = resolveFullLegalPartiesFromIntake(partyNames, intakeRaw);
  if (fullNames.length < 2) return text;

  const headLen = Math.min(text.length, PREAMBLE_MAX_LEN);
  let head = preserveInSlice(text.slice(0, headLen), fullNames);

  const sigMarker = text.search(/\b(?:IN WITNESS WHEREOF|SIGNATURES?|EXECUTION)\b/i);
  if (sigMarker < 0 || sigMarker <= headLen) {
    return head + text.slice(headLen);
  }

  const mid = text.slice(headLen, sigMarker);
  const tail = preserveInSlice(text.slice(sigMarker), fullNames);
  return head + mid + tail;
}

/** @deprecated Prefer preserveFullLegalPartyNamesInOpeningAndSignatures */
export function preserveFullLegalPartyNamesInOpening(
  text: string,
  partyNames: readonly string[] | null | undefined,
  intakeRaw?: string | null,
): string {
  return preserveFullLegalPartyNamesInOpeningAndSignatures(text, partyNames, intakeRaw);
}
