/**
 * Paid Pro: missing party address / formation state / incorporation metadata is non-fatal.
 * Neutralize bracket stubs before acceptance and source-of-truth establishment.
 */

const HARMLESS_ENTITY_METADATA_INNER_RE =
  /^(?:state(?:\s+of\s+incorporation)?|address|city|zip(?:\s*code)?|postal(?:\s*code)?|principal\s+place\s+of\s+business)$/i;

/** Bracket inner label (without brackets). */
export function isHarmlessEntityMetadataPlaceholderLabel(inner: string): boolean {
  const n = String(inner || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return false;
  return HARMLESS_ENTITY_METADATA_INNER_RE.test(n);
}

export function isHarmlessEntityMetadataBracketToken(token: string): boolean {
  const t = String(token || "").trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return false;
  return isHarmlessEntityMetadataPlaceholderLabel(t.slice(1, -1));
}

const INCORPORATION_PRINCIPAL_PLACE_RE =
  /\s*,?\s*a\s+\[[^\]]+\]\s+corporation\s+with\s+principal\s+place\s+of\s+business\s+at\s+\[[^\]]+\](?:\s*,\s*\[[^\]]+\])?/gi;

const ORGANIZED_UNDER_LAWS_RE = /\s+organized\s+under\s+the\s+laws\s+of\s+\[[^\]]+\]/gi;

const STATE_CORPORATION_RE = /\s*,\s*a\s+\[[^\]]+\]\s+corporation\b/gi;

const LOCATED_AT_RE = /\s+located\s+at\s+\[[^\]]+\](?:\s*,\s*\[[^\]]+\])?/gi;

const WITH_PRINCIPAL_PLACE_RE =
  /\s+with\s+principal\s+place\s+of\s+business\s+at\s+\[[^\]]+\](?:\s*,\s*\[[^\]]+\])?/gi;

const STANDALONE_HARMLESS_BRACKET_RE =
  /\[(?:State|STATE|state|Address|ADDRESS|address|state of incorporation|State of Incorporation|STATE OF INCORPORATION|principal place of business|Principal Place of Business)\]/g;

function tidyNeutralizedEntityMetadataText(text: string): string {
  return text
    .replace(/\(\s*\)/g, "")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/ {2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/[ \t]+\n/g, "\n");
}

/**
 * Remove harmless entity-metadata bracket stubs. Prefer phrase removal over invented facts.
 */
export function neutralizeHarmlessEntityMetadataPlaceholders(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let out = String(text || "");
  if (!out.trim()) return { text: out, repairs };

  const strip = (re: RegExp, key: string) => {
    const before = out;
    out = out.replace(re, () => {
      repairs.push(key);
      return "";
    });
    if (out !== before && !repairs.includes(key)) repairs.push(key);
  };

  strip(INCORPORATION_PRINCIPAL_PLACE_RE, "neutral:incorporation_principal_place_clause");
  strip(WITH_PRINCIPAL_PLACE_RE, "neutral:principal_place_clause");
  strip(ORGANIZED_UNDER_LAWS_RE, "neutral:organized_under_laws");
  strip(STATE_CORPORATION_RE, "neutral:state_corporation");
  strip(LOCATED_AT_RE, "neutral:located_at");

  out = out.replace(STANDALONE_HARMLESS_BRACKET_RE, (match) => {
    repairs.push(`neutral:${match.slice(1, -1).toLowerCase().replace(/\s+/g, "_")}`);
    return "";
  });

  out = tidyNeutralizedEntityMetadataText(out);
  return { text: out, repairs: [...new Set(repairs)] };
}
