/**
 * Cosmetic cleanup for paid review: remove meta / instruction lines from agreement body text.
 * Does not call the backend; safe to run on blur or when entering the premium document surface.
 */

function collapseBlankRuns(text: string): string {
  return text.replace(/\n{4,}/g, "\n\n\n").replace(/[ \t]+\n/g, "\n").trimEnd();
}

/**
 * Numbered section patterns that look like leaked user prompt prose, not agreement headings.
 * Match: "11. I run", "12. hey so", "13. Don't", etc.
 */
const LEAKED_PROMPT_SECTION_PATTERNS = [
  /^\d+\.\s+(?:I\s+run|hey\s+so|Don'?t|my\s+dog|I\s+need|please|we\s+need|also\s+my|ignore\s+that|I\s+guess)\b[^\n]*$/gim,
  /^\d+\.\s+(?:Create|Draft|Make|Write)\s+(?:a|an|the)\s+(?:agreement|contract|document|deal)\b[^\n]*/gim,
];

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

  const killLine = /^\s*(?:[>*•\-–—]\s*)?(?:we need this rewritten[^.!?]*[.!?]?|this is not generic consulting[^.!?]*[.!?]?|this is not generic[^.!?]*[.!?]?|i need this rewritten[^.!?]*[.!?]?|please rewrite (?:this|the) agreement[^.!?]*[.!?]?|describe what you need rewritten[^.!?]*[.!?]?)\s*$/gim;
  t = t.replace(killLine, "");

  t = t.replace(
    /\bwe need this rewritten[^.]{0,200}\.\s*/gi,
    "The following provisions reflect the parties' stated commercial intent. ",
  );
  t = t.replace(/\bthis is not generic consulting[^.]{0,120}\.\s*/gi, "");
  t = t.replace(/\bnote:\s*this is not generic[^.]{0,160}\.\s*/gi, "");

  // Strip leaked prompt prose that appears as numbered sections
  t = stripLeakedPromptAsSections(t);

  return collapseBlankRuns(t);
}
