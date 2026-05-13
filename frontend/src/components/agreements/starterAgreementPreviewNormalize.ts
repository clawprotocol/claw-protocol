/**
 * Display-only helpers for the free/basic (starter) agreement preview path.
 * Premium / full-draft access uses the unmodified structured preview builder.
 */

/** Shown when governing-law inference is weak or malformed — calm copy, not legal advice. */
export const STARTER_GOVERNING_LAW_DISPLAY_FALLBACK = "To be agreed by the parties unless otherwise agreed";

const US_STATE_LOWER = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
  "district of columbia",
]);

const US_STATE_ABBREV = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

const JUNK_JURISDICTION_PHRASE = /\b(their|your|our|this|that|lobby|hallway|conference\s+room|building\s+\d|suite\s+\d+)\b/i;

const LOOKS_LIKE_PROSE_INSTRUCTION =
  /\b(please|must|should|shall|agree|parties|whereas|pursuant|notwithstanding|hereby|witnesseth)\b/i;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** True when `raw` is plausibly a real US state / DC label for a starter shell. */
export function isPlausibleUSJurisdictionLabel(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (t.length === 2 && US_STATE_ABBREV.has(t.toUpperCase())) return true;
  const lower = t.toLowerCase().replace(/\s+/g, " ");
  if (US_STATE_LOWER.has(lower)) return true;
  const m = lower.match(/^state\s+of\s+(.+)$/);
  if (m && US_STATE_LOWER.has(m[1].trim())) return true;
  return false;
}

/**
 * True when the inferred jurisdiction string should not be echoed verbatim into the governing-law line.
 */
export function isJurisdictionDisplayLowConfidence(raw: string | null | undefined): boolean {
  const t = (raw || "").trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  if (lower === "tbd" || lower === "n/a" || lower === "na" || lower === "unknown" || lower === "y") return true;
  if (t.length > 42) return true;
  if (wordCount(t) > 5) return true;
  if (JUNK_JURISDICTION_PHRASE.test(t)) return true;
  if (LOOKS_LIKE_PROSE_INSTRUCTION.test(t)) return true;
  if ((t.match(/[.!?]/g) || []).length >= 2) return true;
  if ((t.match(/\d/g) || []).length >= 5) return true;
  if (!isPlausibleUSJurisdictionLabel(t)) return true;
  return false;
}

export function sanitizeJurisdictionForStarterGoverningLaw(raw: string | null | undefined): string {
  const t = (raw || "").trim();
  if (!t || isJurisdictionDisplayLowConfidence(t)) return STARTER_GOVERNING_LAW_DISPLAY_FALLBACK;
  return t.length > 40 ? `${t.slice(0, 37)}…` : t;
}

/**
 * Collapses intake noise into a short readable summary for Section 1 (starter path only).
 */
export function compressProseForStarterScope(raw: string | null | undefined, maxChars = 300): string {
  let s = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  if (s.length <= maxChars) return s;
  const slice = s.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "), slice.lastIndexOf(" — "));
  const head = lastStop > 100 ? slice.slice(0, lastStop + 1).trim() : slice.replace(/\s+\S*$/, "").trim();
  return head.endsWith("…") ? head : `${head}…`;
}

export function compressStarterAdditionalTerms(raw: string | null | undefined, maxChars = 220): string {
  const s = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars - 1).trim()}…`;
}

export function compressTerminationSummaryForStarter(raw: string | null | undefined, maxChars = 260): string {
  return compressProseForStarterScope(raw, maxChars);
}
