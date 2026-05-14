/**
 * Deterministic repairs for numbered party lists and signature underline blocks.
 * Uses ordinal position (1st line → parties[0]) rather than unreliable [ORG_n] slot numbers
 * when the model emits shifted or partial placeholders inside entity fragments.
 */

import {
  textContainsUnresolvedIdentityPlaceholders,
} from "./partyPlaceholderDisplay";

const NUMBERED_PARTY_LINE_RE = /^(\s*)(\d+)(\s*[\.)]\s*)(.*)$/;

export type NumberedPartyLineParts = {
  indent: string;
  num: number;
  delim: string;
  body: string;
};

export function parseNumberedPartyListLine(line: string): NumberedPartyLineParts | null {
  const m = line.match(NUMBERED_PARTY_LINE_RE);
  if (!m) return null;
  const num = parseInt(m[2], 10);
  if (!Number.isFinite(num) || num < 1 || num > 200) return null;
  return { indent: m[1], num, delim: m[3], body: (m[4] || "").trim() };
}

function normalizePartyCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `body` is clearly the same party as `canonical` (casing / punctuation drift). */
function bodyFuzzyMatchesAuthoritativeParty(body: string, canonical: string): boolean {
  const b = normalizePartyCompare(body);
  const c = normalizePartyCompare(canonical);
  if (!b.length || !c.length) return false;
  if (b === c) return true;
  if (b.length >= 10 && c.length >= 10 && (c.includes(b) || b.includes(c))) return true;
  return false;
}

/** Two non-adjacent authoritative parties each appear as leading fragments in `body` (Frankenstein line). */
function bodyLooksLikeMergedPartyFragments(body: string, authoritativeParties: readonly string[]): boolean {
  const low = body.toLowerCase();
  const hits: number[] = [];
  for (let i = 0; i < authoritativeParties.length; i++) {
    const t = authoritativeParties[i].trim();
    if (t.length < 10) continue;
    const frag = t.slice(0, 12).toLowerCase();
    if (frag.length >= 8 && low.includes(frag)) hits.push(i);
  }
  if (hits.length < 2) return false;
  const mn = Math.min(...hits);
  const mx = Math.max(...hits);
  return mx - mn >= 2;
}

/**
 * Repairs contiguous numbered lines `1.` … `N.` where N === party count: each line body becomes
 * authoritativeParties[k] for line k. Also repairs individual numbered lines 1..N when the body
 * still has identity placeholders, fuzzy-matches its ordinal party, or looks merged.
 */
export function hydratePartyListLinesByOrdinal(
  text: string,
  authoritativeParties: readonly string[],
): string {
  if (!text.trim() || authoritativeParties.length === 0) return text;
  const N = authoritativeParties.length;
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; ) {
    const first = parseNumberedPartyListLine(lines[i]);
    if (!first || first.num !== 1) {
      i++;
      continue;
    }
    let j = i;
    let expect = 1;
    while (j < lines.length) {
      const cur = parseNumberedPartyListLine(lines[j]);
      if (!cur || cur.num !== expect) break;
      expect++;
      j++;
      if (expect > N + 1) break;
    }
    const blockLen = expect - 1;
    if (blockLen === N) {
      let anyPlaceholder = false;
      let allFuzzyOk = true;
      for (let k = 0; k < N; k++) {
        const p = parseNumberedPartyListLine(lines[i + k])!;
        if (textContainsUnresolvedIdentityPlaceholders(p.body)) anyPlaceholder = true;
        if (!bodyFuzzyMatchesAuthoritativeParty(p.body, authoritativeParties[k])) allFuzzyOk = false;
      }
      let anyFrank = false;
      for (let k = 0; k < N; k++) {
        const p = parseNumberedPartyListLine(lines[i + k])!;
        if (bodyLooksLikeMergedPartyFragments(p.body, authoritativeParties)) anyFrank = true;
      }
      if (anyPlaceholder || anyFrank || allFuzzyOk) {
        for (let k = 0; k < N; k++) {
          const p = parseNumberedPartyListLine(lines[i + k])!;
          lines[i + k] = `${p.indent}${k + 1}${p.delim}${authoritativeParties[k]}`;
        }
      }
      i = j;
      continue;
    }
    i++;
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const p = parseNumberedPartyListLine(lines[idx]);
    if (!p || p.num < 1 || p.num > N) continue;
    const auth = authoritativeParties[p.num - 1];
    if (
      textContainsUnresolvedIdentityPlaceholders(p.body) ||
      bodyLooksLikeMergedPartyFragments(p.body, authoritativeParties) ||
      bodyFuzzyMatchesAuthoritativeParty(p.body, auth)
    ) {
      lines[idx] = `${p.indent}${p.num}${p.delim}${auth}`;
    }
  }

  return lines.join("\n");
}

function formatBetweenClause(parties: readonly string[]): string {
  if (parties.length === 0) return "";
  if (parties.length === 1) return `Between ${parties[0]}`;
  if (parties.length === 2) return `Between ${parties[0]} and ${parties[1]}`;
  const head = parties.slice(0, -1).join(", ");
  return `Between ${head}, and ${parties[parties.length - 1]}`;
}

/** When a Between-line still has placeholders or generic slot-fallback labels, replace with canonical Oxford list. */
export function hydrateBetweenPartiesLineIfCorrupt(
  text: string,
  authoritativeParties: readonly string[],
): string {
  if (!text.trim() || authoritativeParties.length < 2) return text;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!/^between\s+/i.test(t)) continue;
    if (
      !textContainsUnresolvedIdentityPlaceholders(t) &&
      !/\bParty\s+[A-Z]\b/.test(t) &&
      !bodyLooksLikeMergedPartyFragments(t, authoritativeParties)
    ) {
      continue;
    }
    const indent = raw.match(/^\s*/)?.[0] ?? "";
    const endsWithSentencePunct = /[.!?]\s*$/.test(t);
    lines[i] = `${indent}${formatBetweenClause(authoritativeParties)}${endsWithSentencePunct ? "." : ""}`;
  }
  return lines.join("\n");
}

const UNDERLINE_SIG_RE = /^_{3,}\s*$/;

function shouldTreatAsSignaturePartyHeading(line: string, authoritativeParties: readonly string[]): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^by\s*:/i.test(t)) return false;
  if (/^(date|title|name)\s*:/i.test(t)) return false;
  if (textContainsUnresolvedIdentityPlaceholders(t)) return true;
  if (/\bParty\s+[A-Z]\b/.test(t)) return true;
  if (bodyLooksLikeMergedPartyFragments(t, authoritativeParties)) return true;
  return authoritativeParties.some((p) => bodyFuzzyMatchesAuthoritativeParty(t, p));
}

/**
 * Under each `___` rule line, the next non-empty line before "By:" is treated as the Nth signer
 * heading (0-based N) and replaced with authoritativeParties[N] when repair is needed.
 */
export function hydrateSignatureUnderlinePartyHeadings(
  text: string,
  authoritativeParties: readonly string[],
): string {
  if (!text.trim() || authoritativeParties.length === 0) return text;
  const lines = text.split("\n");
  let ordinal = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!UNDERLINE_SIG_RE.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j >= lines.length) continue;
    const candidate = lines[j];
    const ct = candidate.trim();
    if (/^by\s*:/i.test(ct)) continue;
    if (ordinal >= authoritativeParties.length) break;
    if (shouldTreatAsSignaturePartyHeading(candidate, authoritativeParties)) {
      const indent = candidate.match(/^\s*/)?.[0] ?? "";
      lines[j] = `${indent}${authoritativeParties[ordinal]}`;
      ordinal++;
    }
  }
  return lines.join("\n");
}

/**
 * Full premium display repair: ordinal lists + signature headings + Between-line, intended to run
 * before/after token substitution in {@link hydrateIdentityPlaceholdersInAgreementPreviewPlain}.
 */
export function hydratePartyListAndSignatureOrdinals(
  text: string,
  authoritativeParties: readonly string[],
): string {
  let out = text;
  out = hydratePartyListLinesByOrdinal(out, authoritativeParties);
  out = hydrateSignatureUnderlinePartyHeadings(out, authoritativeParties);
  out = hydrateBetweenPartiesLineIfCorrupt(out, authoritativeParties);
  return out;
}
