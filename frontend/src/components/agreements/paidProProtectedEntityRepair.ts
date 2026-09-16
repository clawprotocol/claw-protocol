/**
 * Restore authoritative legal-entity suffixes (LLC/Inc/etc.) when model or polish shortened party names.
 */

import { resolveFullLegalPartiesFromIntake } from "./paidProPartyNamePreserve";
import { repairDuplicatedLegalEntitySuffixPhrase } from "./paidProLegalEntityNameHygiene";

const ENTITY_SUFFIX =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|Co\.?|Company)\.?$/i;

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

  const witnessIdx = text.search(WITNESS_RE);
  const headEnd = witnessIdx >= 0 ? witnessIdx : text.length;
  let head = text.slice(0, headEnd);
  const tail = text.slice(headEnd);
  let repairs = 0;

  for (const full of fullNames) {
    const trimmedFull = full.replace(/\s+/g, " ").trim();
    if (!ENTITY_SUFFIX.test(trimmedFull)) continue;
    const short = stripEntitySuffix(trimmedFull);
    if (!short || short.length < 4 || short === trimmedFull) continue;

    const suffixToken = trimmedFull.slice(short.length).trim();
    const suffixAlt = suffixLookahead(suffixToken);
    if (!suffixAlt) continue;
    const shortRe = escapeRe(short);

    // Restore `short ("Role")` only when that short form is not already suffixed.
    const definedNameRe = new RegExp(`\\b${shortRe}(?!\\s+${suffixAlt})(\\s*)([("“])`, "g");
    if (definedNameRe.test(head)) {
      definedNameRe.lastIndex = 0;
      const next = head.replace(definedNameRe, `${trimmedFull}$1$2`);
      if (next !== head) {
        head = next;
        repairs += 1;
      }
    }

    const collapsedPossessive = new RegExp(`\\b${shortRe}\\s+'s\\b`, "gi");
    if (collapsedPossessive.test(head)) {
      collapsedPossessive.lastIndex = 0;
      head = head.replace(collapsedPossessive, `${trimmedFull}'s`);
      repairs += 1;
    }
    const collapsedPeriod = new RegExp(`\\b${shortRe}\\s+\\.`, "gi");
    if (collapsedPeriod.test(head)) {
      collapsedPeriod.lastIndex = 0;
      head = head.replace(collapsedPeriod, `${trimmedFull}.`);
      repairs += 1;
    }

    const missingSuffix = new RegExp(`\\b${shortRe}\\b(?!\\s+${suffixAlt})`, "gi");
    const next = head.replace(missingSuffix, () => {
      repairs += 1;
      return trimmedFull;
    });
    if (next !== head) head = next;
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
