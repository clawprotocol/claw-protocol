/**
 * Pluggable shapes for Opportunity gamification — swap `source: "local_preview"` for live API later.
 */

export type PackTier = "Pup" | "Builder" | "Connector" | "Alpha";

export type LeaderboardRowKind = "current_user" | "preview_peer" | "live_peer";

export type LeaderboardEntry = {
  rank: number;
  referralId: string;
  displayHandle: string;
  /** Progression tier (Starter…Legend) from live API, or legacy PackTier in preview. */
  packTier: PackTier | string;
  agreementsInfluenced: number;
  /** Legacy preview field — for live rows prefer `momentumScore`. */
  keysGenerated: number;
  /** In stub mode always omit dollar amounts in UI; keep null. */
  earningsUsd: number | null;
  showEarningsColumn: boolean;
  isCurrentUser: boolean;
  rowKind: LeaderboardRowKind;
  /** Live API: weighted Momentum score (not raw signups). */
  momentumScore?: number;
  rankMovement?: "up" | "down" | "same" | "new";
  avatarUrl?: string | null;
  avatarAssetRef?: string | null;
  badgeIds?: string[];
  streakDays?: number;
  /** Live API: longest streak (optional badge of honor). */
  bestStreakDays?: number;
  tagline?: string | null;
};

export type ChallengeMetric =
  | "agreements_total"
  | "agreements_rolling_7d"
  | "keys_total"
  | "share_proof";

export type ChallengeDefinition = {
  id: string;
  name: string;
  description: string;
  target: number;
  rewardCopyStub: string;
  metric: ChallengeMetric;
  /** Human hint for time box (UI); window end computed separately */
  windowLabel: string;
};

export type ChallengeProgressView = {
  definition: ChallengeDefinition;
  current: number;
  target: number;
  completed: boolean;
  endsAtMs: number;
  timeRemainingLabel: string;
};

export type NextPackMilestone = {
  nextTier: PackTier;
  detail: string;
};

export type OpportunityGamificationView = {
  source: "local_preview" | "live";
  leaderboard: LeaderboardEntry[];
  challenges: ChallengeProgressView[];
  nextPackMilestone: NextPackMilestone | null;
};
