/**
 * Signature blocks in draft/review: one LawDog execution sentence; wet-signature stubs stripped for signer cards.
 */

import { applyPremiumExecutionNormalization } from "./premiumExecutionNormalization";

/** Remove duplicate witness blocks and manual signature grids before e-sign handoff. */
export function stripDuplicateSignatureBlocksForPreview(text: string): { text: string; removed: number } {
  const before = (text || "").trim();
  const norm = applyPremiumExecutionNormalization(before, { tier: "premium" });
  const removed = norm.repairs.length;
  return { text: norm.text, removed };
}

export function countWitnessBlocks(text: string): number {
  const m = text.match(/IN WITNESS WHEREOF/gi);
  return m ? m.length : 0;
}
