/**
 * Post-compare presentation filter for Business Review chips (signer-facing).
 * Drops parser-scale fragments and duplicate semantics — not a compare-engine change.
 */

import { friendlyChipToSemanticId, type BusinessReviewSemanticId } from "./recipientBusinessReviewCardsModel";

const FRAGMENT_NOISE = /\bconsolidated\s+feedback\b/i;

function looksLikeLowSignalChipLabel(chip: string): boolean {
  const t = chip.trim();
  if (!t) return true;
  if (FRAGMENT_NOISE.test(t)) return true;
  if (t.length < 12 && /^\([a-z]\)/i.test(t)) return true;
  if (/^\([a-z]\)\s+[a-z].{0,40}$/i.test(t) && t.length < 48) return true;
  return false;
}

/**
 * One chip per semantic bucket (first occurrence wins), low-signal labels removed.
 */
export function filterChipsForBusinessReviewPresentation(chips: readonly string[]): string[] {
  const seenSemantic = new Set<BusinessReviewSemanticId>();
  const out: string[] = [];
  for (const raw of chips) {
    const c = raw.trim();
    if (!c) continue;
    if (looksLikeLowSignalChipLabel(c)) continue;
    const sem = friendlyChipToSemanticId(c);
    if (sem !== "generic" && seenSemantic.has(sem)) continue;
    if (sem !== "generic") seenSemantic.add(sem);
    out.push(c);
  }
  return out;
}
