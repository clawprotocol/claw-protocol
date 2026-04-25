/**
 * Deterministic scan for obvious unresolved drafting language in agreement text.
 * Stays in sync with backend _PLACEHOLDER_SUBSTRINGS patterns (high level).
 */
const PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bto be agreed\b/i, label: "Unresolved: “to be agreed” still appears" },
  { re: /\bto be defined\b/i, label: "Unresolved: “to be defined” still appears" },
  { re: /\bto be determined\b/i, label: "Unresolved: “to be determined” still appears" },
  { re: /\bTBD\b/i, label: "Unresolved: “TBD” still appears" },
  { re: /\bnot (?:yet )?specified\b/i, label: "Unresolved: “not specified” phrasing still appears" },
  { re: /\bnot (?:yet )?finalized\b/i, label: "Unresolved: “not finalized” phrasing still appears" },
  { re: /\brefine in review\b/i, label: "Unresolved: “refine in review” placeholder still appears" },
  { re: /\bname not provided\b/i, label: "Unresolved: “name not provided” still appears" },
  { re: /\bplaceholder party\b/i, label: "Placeholder party language still appears" },
  { re: /\[insert/i, label: "Bracket/insert-style placeholder still appears" },
];

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns up to `max` user-facing one-line flags; de-duplicated. */
export function scanDocumentPlaceholderLines(text: string, max = 5): string[] {
  const t = (text || "").trim();
  if (!t) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { re, label } of PATTERNS) {
    if (out.length >= max) break;
    if (re.test(t) && !seen.has(normalizeKey(label))) {
      seen.add(normalizeKey(label));
      out.push(label);
    }
  }
  return out;
}
