/**
 * Restore full legal entity names in paid-Pro bodies when the model shortened them.
 * Email-safe: masks addresses before any party-label replacement.
 */

import { extractAgreementEntityCandidates } from "../../agreement/partyPlaceholderDisplay";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { maskEmailAddresses, unmaskEmailAddresses } from "./paidProEmailMask";

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP)\.?$/i;

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

/** Authoritative ordered full legal parties from intake "between …" list or explicit partyNames. */
export function resolveFullLegalPartiesFromIntake(
  partyNames: readonly string[] | null | undefined,
  intakeRaw: string | null | undefined,
): string[] {
  const fromArgs = (partyNames || [])
    .map((n) => String(n || "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length >= 3);
  if (fromArgs.length >= 2) return fromArgs;
  const fromBetween = extractBetweenPartyNameList(String(intakeRaw || ""));
  if (fromBetween.length >= 2) return fromBetween;
  return extractAgreementEntityCandidates(String(intakeRaw || ""));
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
