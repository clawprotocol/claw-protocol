import { LAWDOG_COLORS } from "../design/tokens";
import type { LawdogProofTierKey } from "./lawdogLeaderboardTypes";

/** Pastel tiers — score bands tuned to the Proof Score formula (launch). */
const BANDS: { min: number; tier: LawdogProofTierKey; label: string }[] = [
  { min: 0, tier: "aqua", label: "New" },
  { min: 25, tier: "blue", label: "Active" },
  { min: 75, tier: "purple", label: "Proven" },
  { min: 175, tier: "yellow", label: "Elite" },
  { min: 350, tier: "rose", label: "Legendary" },
];

export type ProofTierResolved = {
  tier_key: LawdogProofTierKey;
  tier_label: string;
  next_tier_at: number | null;
};

export function proofTierFromScore(score: number): ProofTierResolved {
  const s = Math.max(0, score);
  let current = BANDS[0];
  for (const b of BANDS) {
    if (s >= b.min) current = b;
  }
  const idx = BANDS.findIndex((b) => b.tier === current.tier);
  const next = idx >= 0 && idx < BANDS.length - 1 ? BANDS[idx + 1] : null;
  return {
    tier_key: current.tier,
    tier_label: current.label,
    next_tier_at: next ? next.min : null,
  };
}

/** Hex accents — same pastels as {@link LAWDOG_COLORS} affiliate identity layer. */
export const PROOF_TIER_ACCENTS: Record<LawdogProofTierKey, string> = {
  aqua: LAWDOG_COLORS.pastel_aqua,
  blue: LAWDOG_COLORS.pastel_blue,
  purple: LAWDOG_COLORS.pastel_purple,
  yellow: LAWDOG_COLORS.pastel_yellow,
  rose: LAWDOG_COLORS.pastel_rose,
};

/** Coarse proof band until live ranks exist — language matches “proof,” not hype. */
export function proofRankBandLabel(score: number): string {
  if (score >= 350) return "Top proof band";
  if (score >= 175) return "Strong proof band";
  if (score >= 75) return "Growing proof band";
  if (score >= 25) return "Building proof band";
  return "Starting proof band";
}
