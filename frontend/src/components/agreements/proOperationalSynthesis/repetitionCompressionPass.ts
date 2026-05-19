/**
 * Diversify repeated legal filler phrases while preserving meaning.
 */

const FILLER_VARIANTS: readonly { pattern: RegExp; variants: readonly string[] }[] = [
  {
    pattern: /\bcommercially\s+reasonable\s+efforts\b/gi,
    variants: ["commercially reasonable efforts", "reasonable commercial efforts", "efforts consistent with industry practice"],
  },
  {
    pattern: /\bsubject\s+to\s+applicable\s+law\b/gi,
    variants: ["subject to applicable law", "as required by applicable law", "to the extent required by law"],
  },
  {
    pattern: /\bas\s+necessary\b/gi,
    variants: ["as necessary", "as reasonably required", "where reasonably needed"],
  },
  {
    pattern: /\bincluding\s+but\s+not\s+limited\s+to\b/gi,
    variants: ["including but not limited to", "including, without limitation,", "including (without limitation)"],
  },
  {
    pattern: /\bto\s+the\s+extent\s+permitted\s+by\s+law\b/gi,
    variants: [
      "to the extent permitted by law",
      "where permitted by applicable law",
      "as law permits",
    ],
  },
];

/**
 * Rotate repeated filler phrases — at most one substitution per phrase class per document.
 */
export function applyRepetitionCompressionPass(text: string): { text: string; diversified: number } {
  let diversified = 0;
  let out = text;

  for (const { pattern, variants } of FILLER_VARIANTS) {
    const matches = [...out.matchAll(pattern)];
    if (matches.length < 2) continue;
    let altIdx = 1;
    let seenFirst = false;
    out = out.replace(pattern, (m) => {
      if (!seenFirst) {
        seenFirst = true;
        return m;
      }
      const v = variants[altIdx % variants.length];
      altIdx += 1;
      diversified += 1;
      const preserveCase =
        m[0] === m[0].toUpperCase() ? v.charAt(0).toUpperCase() + v.slice(1) : v;
      return preserveCase;
    });
  }

  return { text: out, diversified };
}
