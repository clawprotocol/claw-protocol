/**
 * Restore authoritative legal-entity suffixes (LLC/Inc/etc.) when model or polish shortened party names.
 */

import { resolveFullLegalPartiesFromIntake } from "./paidProPartyNamePreserve";
import { repairDuplicatedLegalEntitySuffixPhrase } from "./paidProLegalEntityNameHygiene";

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company)\.?$/i;

/** Already-present suffix after a short name. Omit bare `Co` so `Consulting` is not treated as a suffix. */
const ANY_ENTITY_SUFFIX_AHEAD =
  "\\s+(?:LLC|L\\.L\\.C\\.|Inc(?:orporated)?|Corp(?:oration)?|Ltd|Limited|LLP|PLLC|LP|L\\.P\\.|Company)\\.?\\b";

const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `Inc.` → `Inc\.?` so an already-suffixed name is not treated as missing the suffix. */
function suffixLookahead(suffixToken: string): string {
  return suffixToken
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${escapeRe(word.replace(/\.+$/, ""))}\\.?`)
    .join("\\s+");
}

function stripEntitySuffix(full: string): string {
  return full.replace(ENTITY_SUFFIX, "").trim();
}

function suffixKey(full: string, short: string): string {
  return full.slice(short.length).trim().toLowerCase().replace(/\.+$/, "");
}

function startsWithPartyName(rest: string, name: string): boolean {
  return new RegExp(`^${escapeRe(name)}\\b`, "i").test(rest);
}

function matchIsEmailOrUrl(head: string, index: number, matchLength: number): boolean {
  if (index > 0 && /[@/.]/.test(head.charAt(index - 1))) return true;
  const fromMatch = head.slice(index);
  if (/^[\w.-]*@/i.test(fromMatch)) return true;
  const after = head.slice(index + matchLength);
  if (/^\.[\w-]/.test(after)) return true;
  return false;
}

function matchIsLongerParty(
  rest: string,
  short: string,
  full: string,
  allFull: readonly string[],
): boolean {
  for (const other of allFull) {
    if (other === full) continue;
    const otherShort = stripEntitySuffix(other);
    if (other.length > short.length && startsWithPartyName(rest, other)) return true;
    if (otherShort.length > short.length && startsWithPartyName(rest, otherShort)) return true;
  }
  return false;
}

function shouldSkipShortMatch(
  head: string,
  index: number,
  matchLength: number,
  short: string,
  full: string,
  allFull: readonly string[],
): boolean {
  if (matchIsEmailOrUrl(head, index, matchLength)) return true;
  return matchIsLongerParty(head.slice(index), short, full, allFull);
}

function replaceOffset(
  head: string,
  pattern: RegExp,
  rebuild: (match: string, groups: string[], offset: number) => string,
): string {
  return head.replace(pattern, (match: string, ...rest: unknown[]) => {
    const offset = rest[rest.length - 2] as number;
    const groups = rest.slice(0, -2).map((part) => String(part ?? ""));
    return rebuild(match, groups, offset);
  });
}

export function logPaidProProtectedEntityRepair(payload: {
  repairs: number;
  parties: string[];
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!payload.repairs) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-protected-entity-repair]", payload);
}

/**
 * Upgrade truncated party names to full intake-authoritative legal entities in opening + operative text.
 * Example: Harbor Peak Automation ("Service Provider") → Harbor Peak Automation LLC ("Service Provider")
 */
function preferSuffixedPartyLegalNames(
  resolved: readonly string[],
  partyNames: readonly string[] | null | undefined,
): string[] {
  const args = (partyNames || [])
    .map((name) => String(name || "").replace(/\s+/g, " ").trim())
    .filter((name) => name.length >= 4 && ENTITY_SUFFIX.test(name));
  if (!args.length) return [...resolved];
  const upgraded = resolved.map((name) => {
    const trimmed = String(name || "").replace(/\s+/g, " ").trim();
    const hit = args.find(
      (full) =>
        full === trimmed ||
        stripEntitySuffix(full) === trimmed ||
        full.toLowerCase().startsWith(`${trimmed.toLowerCase()} `),
    );
    return hit || trimmed;
  });
  for (const full of args) {
    if (!upgraded.some((name) => name === full || stripEntitySuffix(name) === stripEntitySuffix(full))) {
      upgraded.push(full);
    }
  }
  return upgraded;
}

export function repairProtectedLegalEntitySuffixes(
  text: string,
  partyNames: readonly string[] | null | undefined,
  intakeRaw?: string | null,
): { text: string; repairs: number } {
  const fullNames = preferSuffixedPartyLegalNames(
    resolveFullLegalPartiesFromIntake(partyNames, intakeRaw),
    partyNames,
  )
    .map((name) => repairDuplicatedLegalEntitySuffixPhrase(String(name || "").replace(/\s+/g, " ").trim()))
    .filter((name, index, all) => name.length >= 4 && all.indexOf(name) === index);
  if (!text?.trim() || fullNames.length < 2) return { text, repairs: 0 };

  const orderedFullNames = [...fullNames].sort((a, b) => b.length - a.length);
  const strippedByShort = new Map<string, Set<string>>();
  for (const full of orderedFullNames) {
    const short = stripEntitySuffix(full);
    if (!short || short === full) continue;
    const key = short.toLowerCase();
    const bucket = strippedByShort.get(key) ?? new Set<string>();
    bucket.add(suffixKey(full, short));
    strippedByShort.set(key, bucket);
  }

  const witnessIdx = text.search(WITNESS_RE);
  const headEnd = witnessIdx >= 0 ? witnessIdx : text.length;
  let head = text.slice(0, headEnd);
  const tail = text.slice(headEnd);
  let repairs = 0;

  const restoreMatch = (
    match: string,
    offset: number,
    short: string,
    trimmedFull: string,
    rebuilt: string,
  ): string => {
    if (shouldSkipShortMatch(head, offset, match.length, short, trimmedFull, orderedFullNames)) {
      return match;
    }
    repairs += 1;
    return rebuilt;
  };

  for (const full of orderedFullNames) {
    const trimmedFull = full.replace(/\s+/g, " ").trim();
    if (!ENTITY_SUFFIX.test(trimmedFull)) continue;
    const short = stripEntitySuffix(trimmedFull);
    if (!short || short.length < 4 || short === trimmedFull) continue;
    // Harbor LLC vs Harbor Inc: bare "Harbor" is not uniquely either party.
    if ((strippedByShort.get(short.toLowerCase())?.size ?? 0) > 1) continue;

    const suffixToken = trimmedFull.slice(short.length).trim();
    const suffixAlt = suffixLookahead(suffixToken);
    if (!suffixAlt) continue;
    const shortRe = escapeRe(short);
    const notAlreadySuffixed = `(?!${ANY_ENTITY_SUFFIX_AHEAD})`;

    const definedNameRe = new RegExp(`\\b${shortRe}${notAlreadySuffixed}(\\s*)([("“])`, "g");
    head = replaceOffset(head, definedNameRe, (match, groups, offset) =>
      restoreMatch(match, offset, short, trimmedFull, `${trimmedFull}${groups[0] ?? ""}${groups[1] ?? ""}`),
    );

    const collapsedPossessive = new RegExp(`\\b${shortRe}${notAlreadySuffixed}\\s+'s\\b`, "gi");
    head = replaceOffset(head, collapsedPossessive, (match, _groups, offset) =>
      restoreMatch(match, offset, short, trimmedFull, `${trimmedFull}'s`),
    );

    const collapsedPeriod = new RegExp(`\\b${shortRe}${notAlreadySuffixed}\\s+\\.`, "gi");
    head = replaceOffset(head, collapsedPeriod, (match, _groups, offset) =>
      restoreMatch(match, offset, short, trimmedFull, `${trimmedFull}.`),
    );

    // Single-token stems (`Cedar`, `Alpha`) are too ambiguous for a global replace.
    if (short.split(/\s+/).filter(Boolean).length < 2) continue;
    const missingSuffix = new RegExp(`\\b${shortRe}\\b${notAlreadySuffixed}`, "gi");
    head = replaceOffset(head, missingSuffix, (match, _groups, offset) =>
      restoreMatch(match, offset, short, trimmedFull, trimmedFull),
    );
  }

  const collapsed = head.replace(
    /\b((?:LLC|L\.L\.C\.|Inc|Incorporated|Corp|Corporation|Ltd|Limited|LP|L\.P\.|LLP|PLLC))\.?\s+\1\.?/gi,
    (_, token: string) => (/^inc$/i.test(token) ? "Inc." : token),
  );
  if (collapsed !== head) {
    head = collapsed;
    repairs += 1;
  }

  const out = head + tail;
  if (repairs > 0) {
    logPaidProProtectedEntityRepair({ repairs, parties: fullNames });
  }
  return { text: out, repairs };
}
