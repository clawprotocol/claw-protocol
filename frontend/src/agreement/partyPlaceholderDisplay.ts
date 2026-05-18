/**
 * Display-layer cleanup for internal party/org tokens (ORG_1, org1, [ORG_1], etc.).
 * Prefer real names inferred from intake-like context when substituting.
 *
 * When a structured authoritative party list is available (e.g. from the merged free
 * draft or API `parties[]`), pass it as the third argument to
 * {@link substitutePartyPlaceholdersInUserFacingText} so slot `n` maps to `parties[n-1]`.
 * Context-only extraction (between-clause / LLC regex) is a fallback and can miss or
 * mis-order multi-party Oxford lists — never rely on it alone for Pro body / export text.
 */

import { extractBetweenPartyNameList } from "../components/agreements/partyBetweenParse";

const ENTITY_SUFFIX = /(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|PC|P\.C\.)/i;

function pushUnique(out: string[], seen: Set<string>, raw: string) {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 160) return;
  const low = t.toLowerCase();
  if (/^(you|i|we|they|counterparty|party|parties|the|a|an)\b/i.test(t)) return;
  if (seen.has(low)) return;
  seen.add(low);
  out.push(t);
}

function stripParenClauses(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Ordered entity-like phrases from free text (between X and Y, Org suffixes, etc.).
 */
export function extractAgreementEntityCandidates(context: string): string[] {
  const text = (context || "").trim();
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  const betweenNames = extractBetweenPartyNameList(text);
  for (const raw of betweenNames) {
    pushUnique(out, seen, stripParenClauses(raw));
  }

  const partiesLine = text.match(/\bparties?\s*:\s*([^\n]+)/i);
  if (partiesLine) {
    for (const part of partiesLine[1].split(/(?:,|;|&|\band\b)/i)) {
      const p = stripParenClauses(part);
      if (p) pushUnique(out, seen, p);
    }
  }

  for (const m of text.matchAll(
    /\b([A-Z][\w.&'’\-]+(?:\s+[A-Z][\w.&'’\-]+)*\s+(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|LLP|PLLC))\b/g,
  )) {
    pushUnique(out, seen, m[1]);
  }

  if (out.length < 2) {
    for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b/g)) {
      const frag = m[1].trim();
      if (ENTITY_SUFFIX.test(frag) || frag.split(/\s+/).length >= 2) pushUnique(out, seen, frag);
    }
  }

  return out;
}

/** Remove internal ref fragments from a single name field (no substitution). */
export function stripInternalPartyRefFragments(name: string): string {
  return substitutePlaceholderTokensWithFn((name || "").trim(), () => "").replace(/\s+/g, " ").trim();
}

function slotFallback(idx: number): string {
  if (idx === 0) return "Party A";
  if (idx === 1) return "Party B";
  return `Party ${String.fromCharCode(65 + idx)}`;
}

/**
 * Matches internal identity placeholders that must never appear in user-visible output.
 * Used by {@link textContainsUnresolvedIdentityPlaceholders} for regression tests.
 */
export const UNRESOLVED_IDENTITY_PLACEHOLDER_RE =
  /\[\s*(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)?[1-9]\d*\s*\]|\(\s*(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)?[1-9]\d*\s*\)|\b(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)[1-9]\d*\b|\b(?:ORG|PARTY|COMPANY)[1-9]\d*\b|\borg(?:[_\s\-]+)[1-9]\d*\b|\bparty(?:[_\s\-]+)[1-9]\d*\b|\borg[1-9]\d*\b|\bparty[1-9]\d*\b|\{\{\s*(?:party|entity|organization)(?:[_\s\-]+)?[1-9]\d*\s*\}\}|\b__(?:ORG|PERSON|PARTY|ENTITY)__\b/gi;

export function textContainsUnresolvedIdentityPlaceholders(text: string | null | undefined): boolean {
  const t = text || "";
  if (!t.trim()) return false;
  UNRESOLVED_IDENTITY_PLACEHOLDER_RE.lastIndex = 0;
  return UNRESOLVED_IDENTITY_PLACEHOLDER_RE.test(t);
}

/**
 * Replace ORG_n / PARTY_n / org1 / [ORG_1] style tokens using context-derived names,
 * or — when provided — the authoritative ordered `parties[]` names from the structured draft.
 *
 * @param authoritativePartyNames When non-empty, slot `n` (1-based) maps to `authoritativePartyNames[n - 1]`.
 *        This is the preferred path for Pro agreement body / signature / export text.
 */
export function substitutePartyPlaceholdersInUserFacingText(
  text: string,
  context: string,
  authoritativePartyNames?: readonly (string | null | undefined)[] | null,
): string {
  const t = (text || "").trim();
  if (!t) return t;

  const auth = (authoritativePartyNames || [])
    .map((n) => String(n ?? "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length > 0);

  const candidates = extractAgreementEntityCandidates(context);

  const replacer = (slot: number): string => {
    const idx = Math.max(0, slot - 1);
    if (auth.length > 0) {
      if (auth[idx]) return auth[idx];
      return slotFallback(idx);
    }
    return candidates[idx] ?? slotFallback(idx);
  };

  let out = substitutePlaceholderTokensWithFn(t, replacer);
  // Second pass: catch any bracket / mustache forms the primary pass might miss, or
  // mixed corruption (e.g. "Smith & [ORG_4]") after partial replacement.
  if (textContainsUnresolvedIdentityPlaceholders(out)) {
    out = substitutePlaceholderTokensWithFn(out, replacer);
  }
  return out;
}

function substitutePlaceholderTokensWithFn(text: string, replacer: (slot: number) => string): string {
  const re =
    /\[\s*(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)?[1-9]\d*\s*\]|\(\s*(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)?[1-9]\d*\s*\)|\b(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)[1-9]\d*\b|\b(?:ORG|PARTY|COMPANY)[1-9]\d*\b|\borg(?:[_\s\-]+)[1-9]\d*\b|\bparty(?:[_\s\-]+)[1-9]\d*\b|\borg[1-9]\d*\b|\bparty[1-9]\d*\b|\{\{\s*(?:party|entity|organization)(?:[_\s\-]+)?[1-9]\d*\s*\}\}|\b__(?:ORG|PERSON|PARTY|ENTITY)__(?:[_\s\-]+)?[1-9]\d*\b|\b__(?:ORG|PERSON|PARTY|ENTITY)__\b/gi;
  return text.replace(re, (match, offset, whole) => {
    const num = match.match(/([1-9]\d*)/);
    const slot = num ? parseInt(num[1], 10) : 1;
    const replacement = replacer(Number.isFinite(slot) && slot > 0 ? slot : 1);
    return dedupeAmpersandPrefixBeforePlaceholder(whole.slice(0, offset), replacement);
  });
}

/**
 * When the text before a placeholder already ends with "Acme & " and the replacement is
 * "Acme & Co LLC", concatenating yields "Acme & Acme & Co LLC". Strip a leading duplicate
 * `Word &` prefix from the replacement only when it exactly matches the end of `before`
 * (case-insensitive). Conservative: requires `&` in the overlapping prefix.
 */
function dedupeAmpersandPrefixBeforePlaceholder(before: string, replacement: string): string {
  const rep = (replacement || "").trim();
  if (!rep || !before) return rep;
  const m = before.match(/([\w'’.\-]+)\s*&\s*$/);
  if (!m) return rep;
  const head = m[1];
  const headAmp = new RegExp(`^${head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*&\\s*`, "i");
  if (headAmp.test(rep)) return rep.replace(headAmp, "").trimStart();
  return rep;
}

/** Resolve a party row name from API/LLM output using optional intake/context text. */
export function resolvePartyNameForUserFacing(
  rawName: string,
  partyIndex: number,
  context: string,
  authoritativePartyNames?: readonly (string | null | undefined)[] | null,
): string {
  const stripped = stripInternalPartyRefFragments(rawName);
  if (stripped.length >= 2) {
    return substitutePartyPlaceholdersInUserFacingText(stripped, context, authoritativePartyNames);
  }
  const auth = (authoritativePartyNames || [])
    .map((n) => String(n ?? "").trim())
    .filter((n) => n.length > 0);
  if (auth[partyIndex]) return auth[partyIndex];
  const candidates = extractAgreementEntityCandidates(context);
  return candidates[partyIndex] ?? slotFallback(partyIndex);
}
