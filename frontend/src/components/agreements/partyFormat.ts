/**
 * Live-preview party line formatting: entity + optional US state, dedupe, title case.
 * Client heuristics only — not authoritative.
 */

/** Abbrev → canonical display name for parenthetical state. */
const STATE_ABBREV_TO_NAME: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const STATE_NAME_LOWER_TO_CANON: Record<string, string> = Object.fromEntries(
  Object.values(STATE_ABBREV_TO_NAME).map((n) => [n.toLowerCase(), n]),
);

/** English state names for intake normalization (strip “in Oklahoma”, etc.). */
export const US_STATE_NAMES_ENGLISH: readonly string[] = Object.freeze(Object.values(STATE_ABBREV_TO_NAME));

function normalizeStateInner(inner: string): string | null {
  const t = inner.trim();
  if (!t) return null;
  const upper = t.replace(/\./g, "").toUpperCase();
  if (upper.length === 2 && STATE_ABBREV_TO_NAME[upper]) return STATE_ABBREV_TO_NAME[upper];
  const low = t.toLowerCase();
  if (STATE_NAME_LOWER_TO_CANON[low]) return STATE_NAME_LOWER_TO_CANON[low];
  return null;
}

/** Collapse repeated entity suffix tokens (e.g. "LLC LLC" → "LLC"). */
export function dedupeEntitySuffixes(entity: string): string {
  let s = entity.replace(/\s+/g, " ").trim();
  const suffix = /\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|Limited|LLP|PLLC|PC|P\.C\.)\b/gi;
  const seen = new Set<string>();
  s = s.replace(suffix, (m) => {
    const key = m.toLowerCase().replace(/\./g, "");
    if (seen.has(key)) return "";
    seen.add(key);
    return m;
  });
  s = s.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
  // Second pass: adjacent duplicate LLC-style
  s = s.replace(/\b(LLC|L\.L\.C\.)\s+\1\b/gi, "$1");
  return s.trim();
}

/** Remove state word from entity when the same state appears in parentheses. */
function stripDuplicateStateFromEntity(entity: string, stateCanon: string): string {
  let e = entity.replace(/\s+/g, " ").trim();
  const words = stateCanon.split(/\s+/);
  for (const w of words) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    e = e.replace(re, " ");
  }
  return e.replace(/\s+/g, " ").replace(/^,|,$|,\s*,/g, "").trim();
}

const SUFFIX_LOWER_TO_DISPLAY: Record<string, string> = {
  llc: "LLC",
  "l.l.c": "L.L.C.",
  "l.l.c.": "L.L.C.",
  inc: "Inc.",
  "inc.": "Inc.",
  corp: "Corp.",
  "corp.": "Corp.",
  ltd: "Ltd.",
  "ltd.": "Ltd.",
  limited: "Limited",
  llp: "LLP",
  pllc: "PLLC",
  pc: "PC",
  "p.c.": "P.C.",
  incorporated: "Incorporated",
  corporation: "Corporation",
};

function titleCaseWord(core: string): string {
  const lower = core.toLowerCase();
  if (SUFFIX_LOWER_TO_DISPLAY[lower]) return SUFFIX_LOWER_TO_DISPLAY[lower];
  if (/^dr\.?$/i.test(core)) return "Dr.";
  if (core.length === 0) return core;
  if (core.includes("-")) {
    return core
      .split("-")
      .map((p) => (p.length ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p))
      .join("-");
  }
  return core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
}

/** Title-case entity words; keep commas / closing parens on tokens. */
function formatEntityTitleCase(entity: string): string {
  return entity
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      if (/^dr\.?$/i.test(tok)) return "Dr.";
      const trailMatch = tok.match(/[,.;:]+$/);
      const trail = trailMatch ? trailMatch[0] : "";
      const coreWithLead = trail ? tok.slice(0, -trail.length) : tok;
      const leadMatch = coreWithLead.match(/^[\('"]+/);
      const lead = leadMatch ? leadMatch[0] : "";
      const core = lead ? coreWithLead.slice(lead.length) : coreWithLead;
      if (!core) return tok;
      if (/^and$/i.test(core)) return `${lead}and${trail}`;
      return `${lead}${titleCaseWord(core)}${trail}`;
    })
    .join(" ");
}

/**
 * Format a single party fragment for preview: optional trailing (State), dedupe LLC/state, title case.
 * Example: "peaceful Journey LLC LLC (ok)" → "Peaceful Journey LLC (Oklahoma)"
 */
export function formatPartySegmentForPreview(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return s;

  let stateCanon: string | null = null;
  const parenEnd = s.match(/\(\s*([^)]+?)\s*\)\s*$/);
  if (parenEnd && parenEnd.index !== undefined) {
    const inner = parenEnd[1];
    stateCanon = normalizeStateInner(inner);
    if (stateCanon) {
      s = s.slice(0, parenEnd.index).trim();
    }
  }

  s = dedupeEntitySuffixes(s);
  if (stateCanon) {
    s = stripDuplicateStateFromEntity(s, stateCanon);
    s = dedupeEntitySuffixes(s);
  }

  s = formatEntityTitleCase(s);

  if (stateCanon) {
    return `${s} (${stateCanon})`;
  }
  return s;
}

/** Format a line that may contain " and " between two parties (e.g. parties: …). */
export function formatPartiesJoinedLine(line: string): string {
  const t = line.replace(/\s+/g, " ").trim();
  if (!t) return t;
  return t
    .split(/\s+and\s+/i)
    .map((p) => formatPartySegmentForPreview(p.trim()))
    .filter(Boolean)
    .join(" and ");
}
