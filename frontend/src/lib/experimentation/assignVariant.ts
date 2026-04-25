/**
 * Deterministic variant index for stable A/B assignment.
 */
export function assignVariantIndex(experimentKey: string, subjectId: string, variantCount: number): number {
  if (variantCount <= 1) return 0;
  const h = hashToUint32(`${experimentKey}:${subjectId}`);
  return h % variantCount;
}

function hashToUint32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
