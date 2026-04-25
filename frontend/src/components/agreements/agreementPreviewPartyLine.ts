/**
 * Heuristics so agreement preview preambles never echo raw intake prompts as “party names”.
 */

import { isHighConfidencePartyNameForAutoPopulation } from "./partyNameConfidence";

const PROMPT_LIKE =
  /\bcreate\s+(a|an)\b|\bcontracting\s+agreement\b|\bagreement\s+between\b|\bdescribe\s+your\b|\bfreelancer\b.*\bagreement\b/i;

/** Single party cell looks like pasted prompt / instructions, not an entity name. */
export function partyNameLooksLikeRawPrompt(name: string): boolean {
  const t = (name || "").trim();
  if (!t) return true;
  if (t.length > 160) return true;
  if (PROMPT_LIKE.test(t)) return true;
  if (/\bbetween\s+.+\s+and\s+/i.test(t) && t.length > 40) return true;
  return false;
}

/**
 * Try to pull "X and Y" entity names from a blob like "Create … between ABC LLC and Voyage LLC …".
 */
export function tryExtractPartyPairFromPromptBlob(blob: string): { a: string; b: string } | null {
  const t = blob.replace(/\s+/g, " ").trim();
  const m = t.match(/\bbetween\s+(.+?)\s+and\s+(.+?)(?:\.|,|\s+for\s+|\s+dated|\s+to\s+|\s+under\s+|$)/i);
  if (!m) return null;
  const a = m[1].replace(/\s+the\s+$/i, "").trim();
  const b = m[2].replace(/\s+the\s+$/i, "").trim();
  if (!a || !b || a.length > 120 || b.length > 120) return null;
  if (PROMPT_LIKE.test(a) || PROMPT_LIKE.test(b)) return null;
  if (!isHighConfidencePartyNameForAutoPopulation(a) || !isHighConfidencePartyNameForAutoPopulation(b)) {
    return null;
  }
  return { a, b };
}
