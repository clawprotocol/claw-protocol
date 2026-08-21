/**
 * Cosmetic cleanup for paid review: remove meta / instruction lines from agreement body text.
 * Does not call the backend; safe to run on blur or when entering the premium document surface.
 */

function collapseBlankRuns(text: string): string {
  return text.replace(/\n{4,}/g, "\n\n\n").replace(/[ \t]+\n/g, "\n").trimEnd();
}

/**
 * Meta / header lines that leak from intake carry-forward blocks.
 * Live leak example: "Commercial detail carried forward from user notes (edit freely before send):"
 */
const LEAKED_META_LINE_PATTERNS = [
  /^\s*Commercial\s+detail\s+carried\s+forward\s+from\s+user\s+notes\s*\([^)]*\)\s*:\s*$/gim,
  /^\s*Commercial\s+detail\s+carried\s+forward[^\n]*$/gim,
];

/**
 * Numbered section patterns that look like leaked user prompt prose, not agreement headings.
 * Match: "11. I run", "12. hey so", "13. Don't", etc.
 *
 * Also detects out-of-sequence high-numbered sections (11+) that contain informal prose
 * fragments clearly from user input rather than structured agreement sections.
 *
 * Live leak examples (Harbor retest 2026-08-21):
 * - "11. Mesa Realty Group LLC / said they'll send us…" (slash between entity and verb)
 * - "12. Don't / count / our house accounts…" (slashes between tokens)
 * Patterns must tolerate `/`, `\n`, or whitespace between tokens.
 */
const LEAKED_PROMPT_SECTION_PATTERNS = [
  /^\d+\.\s+(?:I\s+run|hey\s+so|Don'?t|my\s+dog|I\s+need|please|we\s+need|also\s+my|ignore\s+that|I\s+guess)\b[^\n]*$/gim,
  /^\d+\.\s+(?:Create|Draft|Make|Write)\s+(?:a|an|the)\s+(?:agreement|contract|document|deal)\b[^\n]*/gim,
  // Company name + verb with possible slash/newline break: "11. Mesa Realty Group LLC / said"
  /^(?:1[1-9]|[2-9]\d)\.\s+[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*\s+(?:LLC|Inc|Corp|Ltd)\.?[\s\/\n]+(?:said|told|mentioned|wants?|will|can|agreed)[^\n]*/gim,
  /^(?:1[1-9]|[2-9]\d)\.\s+(?:Don'?t|If\s+the|They\s+(?:want|can|said)|We\s+(?:need|want)|My\s+|Our\s+|\d+\s+(?:month|year|day|week))[^\n]*/gim,
  // Catch multi-line leaked sections with slashes: "12. Don't / count / our house accounts"
  /^(?:1[1-9]|[2-9]\d)\.\s+Don'?t[\s\/]+count[\s\/]+our\s+house\s+accounts[^\n]*/gim,
  // Catch deal term leaks: "13. 12 month deal, exclusive…"
  /^(?:1[1-9]|[2-9]\d)\.\s+\d+\s+(?:month|year|day|week)\s+deal[^\n]*/gim,
];

/** Strip meta lines (e.g. carry-forward headers) that leak from intake processing. */
function stripLeakedMetaLines(text: string): string {
  let t = text;
  for (const pattern of LEAKED_META_LINE_PATTERNS) {
    t = t.replace(pattern, "");
  }
  return t;
}

/** Strip numbered "section" lines that are clearly leaked user prompt, not real sections. */
function stripLeakedPromptAsSections(text: string): string {
  let t = text;
  for (const pattern of LEAKED_PROMPT_SECTION_PATTERNS) {
    t = t.replace(pattern, "");
  }
  return t;
}

/** Strip standalone instruction paragraphs and soften common "not generic consulting" meta. */
export function stripPremiumInstructionNoiseForDocument(text: string): string {
  let t = (text || "").replace(/\r\n/g, "\n");

  // Normalize slash-separated tokens back to spaces for pattern matching.
  // Live leak: "11. Mesa Realty Group LLC / said" → "11. Mesa Realty Group LLC said"
  // But preserve legitimate uses like "and/or" by only collapsing " / ".
  t = t.replace(/\s+\/\s+/g, " ");

  const killLine = /^\s*(?:[>*•\-–—]\s*)?(?:we need this rewritten[^.!?]*[.!?]?|this is not generic consulting[^.!?]*[.!?]?|this is not generic[^.!?]*[.!?]?|i need this rewritten[^.!?]*[.!?]?|please rewrite (?:this|the) agreement[^.!?]*[.!?]?|describe what you need rewritten[^.!?]*[.!?]?)\s*$/gim;
  t = t.replace(killLine, "");

  t = t.replace(
    /\bwe need this rewritten[^.]{0,200}\.\s*/gi,
    "The following provisions reflect the parties' stated commercial intent. ",
  );
  t = t.replace(/\bthis is not generic consulting[^.]{0,120}\.\s*/gi, "");
  t = t.replace(/\bnote:\s*this is not generic[^.]{0,160}\.\s*/gi, "");

  // Strip leaked meta lines (carry-forward headers)
  t = stripLeakedMetaLines(t);

  // Strip leaked prompt prose that appears as numbered sections
  t = stripLeakedPromptAsSections(t);

  return collapseBlankRuns(t);
}
