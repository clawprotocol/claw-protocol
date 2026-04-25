/**
 * Opt-in LawDog proof leaderboard / status (client-local for launch).
 * Public surfaces must use {@link LawdogPublicLeaderboardEntry} only — no agreement payloads.
 */

export type LeaderboardVisibility = "private" | "alias_public" | "full_public";

export type LawdogLeaderboardPrefsV1 = {
  visibility: LeaderboardVisibility;
  /**
   * Display handle for public surfaces when opted in. Required for non-private; sanitized on write.
   * For `alias_public`, show this alias only. For `full_public`, same field carries the public handle.
   */
  public_display_handle: string;
  /** User dismissed the post-completion opt-in prompt (stay private). */
  completion_opt_in_dismissed: boolean;
  /**
   * Operator-verified Doginal holder (honor attestation) — not a launch badge; see public row markers.
   */
  doginal_verified_badge: boolean;
  updated_at_ms: number;
};

/** Exactly three earned launch badges — proof milestones only. */
export type LawdogLaunchBadgeId = "first_record" | "closer" | "proven";

/** Safe DTO for any public leaderboard / feed row (future API compatible). */
export type LawdogPublicLeaderboardEntry = {
  display_handle: string;
  proof_score: number;
  tier_key: LawdogProofTierKey;
  tier_label: string;
  badge_ids: LawdogLaunchBadgeId[];
  /** Approximate band — not exact rank until server exists. */
  rank_band_label: string;
  /** Came in via a Doginal campaign link (`traffic_source` prefix) — not holder verification. */
  doginal_community_marker: boolean;
  /** User attested operator-verified Doginal; not on-chain proof. */
  doginal_verified_marker: boolean;
};

export type LawdogProofTierKey = "aqua" | "blue" | "purple" | "yellow" | "rose";

export type LawdogActivityFeedEntry = {
  id: string;
  at_ms: number;
  /** Generic, non-sensitive copy for UI. */
  headline: string;
  /** If user is public, this event type could sync in a future server feed. */
  eligible_for_public_snapshot: boolean;
};
