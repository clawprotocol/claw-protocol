/**
 * Stable fingerprint for premium document text (polish memoization, timing).
 */
export function hashPremiumDocText(text: string): string {
  const s = (text || "").trim();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function premiumPolishCacheKey(args: {
  surface: string;
  docHash: string;
  intakeFingerprint?: string | null;
}): string {
  return `${args.surface}:${args.intakeFingerprint ?? "na"}:${args.docHash}`;
}
