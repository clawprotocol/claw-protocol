/**
 * Enterprise readability — reduce recursive caveats and template hedging.
 */

const RECURSIVE_CAVEAT_RE =
  /\b(?:provided\s+that|notwithstanding\s+the\s+foregoing)[^.!?]*(?:provided\s+that|notwithstanding)[^.!?]*[.!?]/gi;

const OVER_HEDGE_REPLACEMENTS: readonly { re: RegExp; replacement: string }[] = [
  {
    re: /\bfor\s+the\s+avoidance\s+of\s+doubt,\s+for\s+the\s+avoidance\s+of\s+doubt\b/gi,
    replacement: "For the avoidance of doubt",
  },
  {
    re: /\bit\s+is\s+expressly\s+understood\s+and\s+agreed\s+that\s+the\s+parties\s+acknowledge\b/gi,
    replacement: "The Parties acknowledge",
  },
  {
    re: /\bwithout\s+limiting\s+the\s+generality\s+of\s+the\s+foregoing,\s+and\s+subject\s+to\s+the\s+foregoing\b/gi,
    replacement: "Without limiting the foregoing",
  },
];

/**
 * Trim stacked caveats; simplify redundant hedge openers.
 */
export function applyEnterpriseReadabilityPass(text: string): { text: string; hedgesReduced: number } {
  let hedgesReduced = 0;
  let out = text;

  out = out.replace(RECURSIVE_CAVEAT_RE, (m) => {
    hedgesReduced += 1;
    const first = m.split(/(?<=[.!?])\s+/)[0];
    return first.endsWith(".") ? first : `${first}.`;
  });

  for (const { re, replacement } of OVER_HEDGE_REPLACEMENTS) {
    if (re.test(out)) {
      hedgesReduced += 1;
      out = out.replace(re, replacement);
    }
  }

  return { text: out, hedgesReduced };
}
