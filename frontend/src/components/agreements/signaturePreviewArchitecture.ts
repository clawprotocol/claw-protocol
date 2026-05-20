/**
 * Signature blocks in draft/review: one e-sign notice; wet-signature stubs stripped when VS01 will inject fields.
 */

const WITNESS_RE = /IN WITNESS WHEREOF/i;
const WET_SIG_BLOCK_RE =
  /(?:^|\n)([A-Z][^\n]{4,80})\nBy:\s*(?:_{3,}|\[SIGNATURE\]|\[NAME\])[\s\S]*?(?=\n\n(?:IN WITNESS|This agreement may be executed|\d+\.\s+[A-Z]|$))/gim;

/** Remove duplicate witness blocks and redundant wet-signature grids before e-sign handoff. */
export function stripDuplicateSignatureBlocksForPreview(text: string): { text: string; removed: number } {
  let t = (text || "").replace(/\r\n/g, "\n");
  let removed = 0;

  const firstWitness = t.search(WITNESS_RE);
  if (firstWitness >= 0) {
    const second = t.indexOf("IN WITNESS WHEREOF", firstWitness + 20);
    if (second >= 0) {
      t = t.slice(0, second).trimEnd();
      removed += 1;
    }
  }

  const before = t;
  t = t.replace(WET_SIG_BLOCK_RE, "\n");
  if (t !== before) removed += 1;
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return { text: t, removed };
}

export function countWitnessBlocks(text: string): number {
  const m = text.match(/IN WITNESS WHEREOF/gi);
  return m ? m.length : 0;
}
