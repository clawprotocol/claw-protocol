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
import {
  isStandaloneLegalEntitySuffix,
  normalizeAgreementPartyName,
} from "../components/agreements/partySlotIdentityNormalize";
import {
  countIdentityPlaceholders,
  inferOrgSlotOriginMetadata,
  listUnresolvedIdentityPlaceholderTokens,
  logOrgPlaceholderOriginsFromText,
  logPaidProPlaceholderOrigin,
  logPaidProPlaceholderRepair,
} from "../components/agreements/paidProPlaceholderAttributionLog";

const ENTITY_SUFFIX = /(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|PC|P\.C\.|Co\.?|Company)/i;

const ENTITY_DOUBLE_PERIOD_RE =
  /\b((?:LLC|L\.L\.C\.|Inc|Inc\.|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company))\.{2,}/gi;

/** Display-layer only — collapse Inc.. / LLC.. without mutating authoritative corpus upstream. */
export function repairDuplicatedEntityPunctuationInDisplay(text: string): string {
  let out = String(text || "");
  if (!out) return out;
  out = out.replace(ENTITY_DOUBLE_PERIOD_RE, "$1.");
  out = out.replace(/\b(Inc)\.\./gi, "Inc.");
  out = out.replace(/\b(LLC)\.\./gi, "LLC.");
  out = out.replace(/\b(Corp)\.\./gi, "Corp.");
  out = out.replace(/\b(Ltd)\.\./gi, "Ltd.");
  return out;
}

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
  return s
    .replace(/\s*\(\s*["'“”]?party[_\s-]?[ab]\d*["'“”]?\s*\)\s*/gi, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NON_ENTITY_PROSE_PHRASE_RE =
  /\b(?:texas|california|delaware|new\s+york|florida|illinois)\s+law\b|\belectronic\s+signatures?\b|\b(?:either|each|any)\s+party\b/i;

function isLegalEntityCandidateName(name: string): boolean {
  const t = name.replace(/\s+/g, " ").trim();
  if (t.length < 2 || NON_ENTITY_PROSE_PHRASE_RE.test(t)) return false;
  if (ENTITY_SUFFIX.test(t)) return true;
  return t.split(/\s+/).length >= 2;
}

function isAliasOfLongerLegalEntity(short: string, long: string): boolean {
  const s = short.replace(/\s+/g, " ").trim().toLowerCase();
  const l = long.replace(/\s+/g, " ").trim().toLowerCase();
  if (!s || !l || s === l) return s === l;
  if (l.startsWith(s)) return true;
  const sw = s.split(/\s+/);
  const lw = l.split(/\s+/);
  return sw.length < lw.length && sw.every((w, i) => lw[i] === w);
}

/**
 * Collapse short role references ("Red Mesa") into full legal names ("Red Mesa Logistics LLC")
 * and drop non-entity prose fragments mistaken for parties.
 */
export function dedupeEntityCandidatesToLegalParties(candidates: readonly string[]): string[] {
  const unique = [
    ...new Set(
      candidates
        .map((c) => c.replace(/\s+/g, " ").trim())
        .filter((c) => c.length >= 2 && isLegalEntityCandidateName(c)),
    ),
  ];
  const withEntitySuffix = unique.filter((n) => ENTITY_SUFFIX.test(n));
  const pool = withEntitySuffix.length >= 2 ? withEntitySuffix : unique;
  const sorted = [...pool].sort((a, b) => b.length - a.length);
  const kept: string[] = [];
  for (const name of sorted) {
    if (kept.some((k) => isAliasOfLongerLegalEntity(name, k))) continue;
    const withoutShorter = kept.filter((k) => !isAliasOfLongerLegalEntity(k, name));
    kept.length = 0;
    kept.push(...withoutShorter, name);
  }
  return kept;
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
    /\b([A-Z][\w.&'’\-]+(?:\s+[A-Z][\w.&'’\-]+)*\s+(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company))\b/g,
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
  /\[\s*(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)?[1-9]\d*\s*\]|\(\s*(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)?[1-9]\d*\s*\)|\(\s*["'“”]?party[_\s-]?[ab]\d*["'“”]?\s*\)|\b(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\s\-]+)[1-9]\d*\b|\b(?:ORG|PARTY|COMPANY)[1-9]\d*\b|\borg(?:[_\s\-]+)[1-9]\d*\b|\bparty(?:[_\s\-]+)[1-9]\d*\b|\bparty[_\s-]?[ab]\d*\b|\borg[1-9]\d*\b|\bparty[1-9]\d*\b|\{\{\s*(?:party|entity|organization)(?:[_\s\-]+)?[1-9]\d*\s*\}\}|\b__(?:ORG|PERSON|PARTY|ENTITY)__\b/gi;

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

  let out = auth.length >= 2 ? repairKnownPartyAliasDisplayFragments(t, auth) : t;
  out = substitutePlaceholderTokensWithFn(out, replacer);
  // Second pass: catch any bracket / mustache forms the primary pass might miss, or
  // mixed corruption (e.g. "Smith & [ORG_4]") after partial replacement.
  if (textContainsUnresolvedIdentityPlaceholders(out)) {
    out = substitutePlaceholderTokensWithFn(out, replacer);
  }
  if (auth.length >= 2) {
    out = repairKnownPartyAliasDisplayFragments(out, auth);
  }
  return repairDuplicatedEntityPunctuationInDisplay(out);
}

const PARTY_PLACEHOLDER_TOKEN_SOURCE =
  "\\[\\s*(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\\s\\-]+)?[1-9]\\d*\\s*\\]|\\(\\s*(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\\s\\-]+)?[1-9]\\d*\\s*\\)|\\(\\s*[\"'“”]?party[_\\s-]?[ab]\\d*[\"'“”]?\\s*\\)|\\b(?:ORG|PARTY|PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)(?:[_\\s\\-]+)[1-9]\\d*\\b|\\b(?:ORG|PARTY|COMPANY)[1-9]\\d*\\b|\\borg(?:[_\\s\\-]+)[1-9]\\d*\\b|\\bparty(?:[_\\s\\-]+)[1-9]\\d*\\b|\\bparty[_\\s-]?[ab]\\d*\\b|\\borg[1-9]\\d*\\b|\\bparty[1-9]\\d*\\b|\\{\\{\\s*(?:party|entity|organization)(?:[_\\s\\-]+)?[1-9]\\d*\\s*\\}\\}|\\b__(?:ORG|PERSON|PARTY|ENTITY)__(?:[_\\s\\-]+)?[1-9]\\d*\\b|\\b__(?:ORG|PERSON|PARTY|ENTITY)__\\b";

function slotIndexFromPlaceholderMatch(match: string): number {
  const m = match.trim();
  if (/party[_\s-]?a\b/i.test(m)) return 1;
  if (/party[_\s-]?b\b/i.test(m)) return 2;
  const num = m.match(/([1-9]\d*)/);
  return num ? parseInt(num[1], 10) : 1;
}

function substitutePlaceholderTokensWithFn(text: string, replacer: (slot: number) => string): string {
  const re = new RegExp(PARTY_PLACEHOLDER_TOKEN_SOURCE, "gi");
  return text.replace(re, (match, offset, whole) => {
    const slot = slotIndexFromPlaceholderMatch(match);
    const replacement = replacer(Number.isFinite(slot) && slot > 0 ? slot : 1);
    return dedupeAmpersandPrefixBeforePlaceholder(whole.slice(0, offset), replacement);
  });
}

function repairKnownPartyAliasDisplayFragments(
  text: string,
  authoritativePartyNames: readonly string[],
): string {
  const auth = authoritativePartyNames
    .map((n) => normalizeAgreementPartyName(String(n ?? "")))
    .filter((n) => n.length >= 2);
  if (auth.length < 2) return text;
  let out = text;
  out = out.replace(/\s*\(\s*["'“”]?party[_\s-]?a\d*["'“”]?\s*\)/gi, "");
  out = out.replace(/\s*\(\s*["'“”]?party[_\s-]?b\d*["'“”]?\s*\)/gi, "");
  if (/\band\s+LLC\b/i.test(out) && auth[1] && !isStandaloneLegalEntitySuffix(auth[1])) {
    out = out.replace(/\band\s+LLC\b/i, `and ${auth[1]}`);
  }
  for (const full of auth) {
    const base = full.replace(
      /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\.?$/i,
      "",
    );
    if (base.length < 4 || base === full) continue;
    const re = new RegExp(
      `\\b${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?!\\s+(?:LLC|L\\.L\\.C\\.|Inc\\.?|Corp\\.?|Corporation|Ltd\\.?|Limited))`,
      "i",
    );
    if (re.test(out) && !out.includes(full)) {
      out = out.replace(re, full);
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/** A candidate is a usable real party name (not blank, not another placeholder, not a generic word). */
function isRealPartyName(name: string | null | undefined): boolean {
  const t = String(name ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 160) return false;
  if (textContainsUnresolvedIdentityPlaceholders(t)) return false;
  if (/^(you|i|we|they|counterparty|party|parties|the|a|an)\b/i.test(t)) return false;
  return true;
}

export type RepairKnownPartyPlaceholdersResult = {
  text: string;
  repaired: boolean;
  repairedSlots: number[];
  collapsedExtraOrgSlots: number[];
  hasRemainingIdentityPlaceholder: boolean;
};

/** Paid Pro only: collapse ORG_n / PARTY_n overflow (n > 2) when every guard is satisfied. */
export type SyntheticOrgOverflowCollapseGuard = {
  structuredPartyCount: number;
  canonicalIdentityCount: number;
  placeholderResolutionPartyCount: number;
  intakeHasFullLegalEntities: boolean;
};

const SYNTHETIC_ORG_OVERFLOW_REPLACEMENT = "the applicable Party";

export function shouldCollapseSyntheticOrgPartyOverflow(args: {
  realAuthoritativePartyCount: number;
  structuredPartyCount: number;
  canonicalIdentityCount: number;
  placeholderResolutionPartyCount: number;
  intakeHasFullLegalEntities: boolean;
}): boolean {
  return (
    args.realAuthoritativePartyCount === 2 &&
    args.structuredPartyCount === 2 &&
    args.canonicalIdentityCount === 2 &&
    args.placeholderResolutionPartyCount === 2 &&
    args.intakeHasFullLegalEntities
  );
}

/** True when the token is a numbered ORG/PARTY slot (not PERSON, ENTITY, mustache, etc.). */
function isCollapsibleSyntheticOrgPartyToken(match: string, slot: number): boolean {
  if (slot <= 2) return false;
  const t = match.trim();
  if (/\{\{|\}\}/.test(t) || /__/.test(t)) return false;
  if (/\b(?:PERSON|ENTITY|CLIENT|COMPANY|ORGANIZATION)\b/i.test(t)) return false;
  return /(?:^|\[|\(|\b)(ORG|PARTY)(?:[_\s\-]+)?[1-9]\d*/i.test(t);
}

/**
 * Deterministically replace ONLY party/identity placeholders ([ORG_1], "[ORG_2]", PARTY_2, …) whose
 * slot maps to a KNOWN real party name. Unknown slots (no authoritative or context name) are left
 * untouched so the hard-fail / dev-context-leak gates still trip on genuinely unresolved placeholders.
 *
 * Slot `n` (1-based) maps to `authoritativePartyNames[n-1]`, falling back to ordered entity candidates
 * extracted from `context` (raw intake) for that same slot. Quoted variants and repeated occurrences
 * are all replaced because every matching token is resolved by slot.
 */
export function repairKnownPartyPlaceholders(
  text: string,
  authoritativePartyNames?: readonly (string | null | undefined)[] | null,
  context?: string | null,
  syntheticOverflowCollapse?: SyntheticOrgOverflowCollapseGuard | null,
): RepairKnownPartyPlaceholdersResult {
  const original = text || "";
  if (!original.trim()) {
    return {
      text: original,
      repaired: false,
      repairedSlots: [],
      collapsedExtraOrgSlots: [],
      hasRemainingIdentityPlaceholder: false,
    };
  }
  const auth = (authoritativePartyNames || []).map((n) => String(n ?? "").replace(/\s+/g, " ").trim());
  const candidates = context ? extractAgreementEntityCandidates(context) : [];
  const repairedSlots = new Set<number>();
  const collapsedExtraOrgSlots = new Set<number>();

  const resolveSlot = (slot: number): string | null => {
    const idx = Math.max(0, slot - 1);
    const a = auth[idx];
    if (isRealPartyName(a)) return a;
    const realAuthCount = auth.filter((n) => isRealPartyName(n)).length;
    if (slot > realAuthCount) return null;
    const c = candidates[idx];
    if (isRealPartyName(c)) return c;
    return null;
  };

  const re = new RegExp(PARTY_PLACEHOLDER_TOKEN_SOURCE, "gi");
  const beforeCount = countIdentityPlaceholders(original);
  const canonicalPartyCount = auth.filter((n) => isRealPartyName(n)).length;
  const collapseSyntheticOverflow =
    syntheticOverflowCollapse != null &&
    shouldCollapseSyntheticOrgPartyOverflow({
      realAuthoritativePartyCount: canonicalPartyCount,
      structuredPartyCount: syntheticOverflowCollapse.structuredPartyCount,
      canonicalIdentityCount: syntheticOverflowCollapse.canonicalIdentityCount,
      placeholderResolutionPartyCount: syntheticOverflowCollapse.placeholderResolutionPartyCount,
      intakeHasFullLegalEntities: syntheticOverflowCollapse.intakeHasFullLegalEntities,
    });
  logOrgPlaceholderOriginsFromText({
    text: original,
    sourceModule: "repairKnownPartyPlaceholders",
    canonicalPartyCount,
  });
  const out = original.replace(re, (match, offset, whole) => {
    const num = match.match(/([1-9]\d*)/);
    const slot = num ? parseInt(num[1], 10) : 1;
    const normalizedSlot = Number.isFinite(slot) && slot > 0 ? slot : 1;
    const replacement = resolveSlot(normalizedSlot);
    if (replacement != null) {
      repairedSlots.add(normalizedSlot);
      return dedupeAmpersandPrefixBeforePlaceholder(whole.slice(0, offset), replacement);
    }
    if (
      collapseSyntheticOverflow &&
      isCollapsibleSyntheticOrgPartyToken(match, normalizedSlot)
    ) {
      collapsedExtraOrgSlots.add(normalizedSlot);
      return dedupeAmpersandPrefixBeforePlaceholder(
        whole.slice(0, offset),
        SYNTHETIC_ORG_OVERFLOW_REPLACEMENT,
      );
    }
    return match;
  });

  const unresolved = listUnresolvedIdentityPlaceholderTokens(out);
  for (const token of unresolved) {
    const meta = inferOrgSlotOriginMetadata(token, canonicalPartyCount);
    logPaidProPlaceholderOrigin({
      placeholder: token,
      sourceModule: "repairKnownPartyPlaceholders",
      sourceEntityType:
        meta.sourceEntityType === "contracting_party_slot"
          ? "unresolved_contracting_party_slot"
          : meta.sourceEntityType,
      sourceValue: meta.sourceValue,
    });
  }
  const collapsedSlots = [...collapsedExtraOrgSlots].sort((a, b) => a - b);
  logPaidProPlaceholderRepair({
    sourceModule: "repairKnownPartyPlaceholders",
    beforeCount,
    afterCount: countIdentityPlaceholders(out),
    unresolvedPlaceholders: unresolved,
    collapsedExtraOrgSlots: collapsedSlots,
  });

  return {
    text: out,
    repaired: (repairedSlots.size > 0 || collapsedExtraOrgSlots.size > 0) && out !== original,
    repairedSlots: [...repairedSlots].sort((a, b) => a - b),
    collapsedExtraOrgSlots: collapsedSlots,
    hasRemainingIdentityPlaceholder: textContainsUnresolvedIdentityPlaceholders(out),
  };
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
