/**
 * Cosmetic cleanup for paid review: remove meta / instruction lines from agreement body text.
 * Does not call the backend; safe to run on blur or when entering the premium document surface.
 */

function collapseBlankRuns(text: string): string {
  return text.replace(/\n{4,}/g, "\n\n\n").replace(/[ \t]+\n/g, "\n").trimEnd();
}

/** Strip standalone instruction paragraphs and soften common “not generic consulting” meta. */
export function stripPremiumInstructionNoiseForDocument(text: string): string {
  let t = (text || "").replace(/\r\n/g, "\n");

  const killLine = /^\s*(?:[>*•\-–—]\s*)?(?:we need this rewritten[^.!?]*[.!?]?|this is not generic consulting[^.!?]*[.!?]?|this is not generic[^.!?]*[.!?]?|i need this rewritten[^.!?]*[.!?]?|please rewrite (?:this|the) agreement[^.!?]*[.!?]?|describe what you need rewritten[^.!?]*[.!?]?)\s*$/gim;
  t = t.replace(killLine, "");

  t = t.replace(
    /\bwe need this rewritten[^.]{0,200}\.\s*/gi,
    "The following provisions reflect the parties’ stated commercial intent. ",
  );
  t = t.replace(/\bthis is not generic consulting[^.]{0,120}\.\s*/gi, "");
  t = t.replace(/\bnote:\s*this is not generic[^.]{0,160}\.\s*/gi, "");

  return collapseBlankRuns(t);
}
