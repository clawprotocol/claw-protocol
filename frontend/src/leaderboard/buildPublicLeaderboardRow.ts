import type { LawdogPublicLeaderboardEntry } from "./lawdogLeaderboardTypes";
import { getLawdogTrafficSource } from "../tracking/lawdogSession";
import { readLawdogLeaderboardPrefs } from "./lawdogLeaderboardPrefs";
import { deriveLaunchBadges } from "./proofBadges";
import { readProofActivity } from "./proofActivityStore";
import { computeProofScore } from "./proofScore";
import { proofRankBandLabel, proofTierFromScore } from "./proofTier";

/**
 * Builds the safe public row for this device/user. Returns null when private.
 * FUTURE: replace with API rows; keep this shape for the client preview.
 */
export function buildLocalPublicLeaderboardRow(): LawdogPublicLeaderboardEntry | null {
  const prefs = readLawdogLeaderboardPrefs();
  if (prefs.visibility === "private") return null;
  const activity = readProofActivity();
  const { score } = computeProofScore(activity);
  const tier = proofTierFromScore(score);
  const badges = deriveLaunchBadges(activity);
  const traffic = getLawdogTrafficSource();
  const full = prefs.visibility === "full_public";
  return {
    display_handle: prefs.public_display_handle.trim() || "Anonymous",
    proof_score: score,
    tier_key: tier.tier_key,
    tier_label: tier.tier_label,
    badge_ids: badges,
    rank_band_label: proofRankBandLabel(score),
    doginal_community_marker: full && traffic.startsWith("doginal_"),
    doginal_verified_marker: full && prefs.doginal_verified_badge,
  };
}
