import { appendLawdogActivityFeed } from "./lawdogActivityFeed";
import { deriveLaunchBadges } from "./proofBadges";
import {
  noteProofAgreementFinalized,
  noteProofAgreementSent,
  readProofActivity,
  recordProofActivityDay,
} from "./proofActivityStore";
import { computeProofScore } from "./proofScore";
import { proofTierFromScore } from "./proofTier";

const TIER_KEY = "lawdog_proof_last_tier_key_v1";

function readLastTier(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TIER_KEY);
  } catch {
    return null;
  }
}

function writeLastTier(k: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TIER_KEY, k);
  } catch {
    /* ignore */
  }
}

function maybeAppendTierMilestone(activity = readProofActivity()): void {
  const tier = proofTierFromScore(computeProofScore(activity).score);
  const prev = readLastTier();
  if (prev === tier.tier_key) return;
  writeLastTier(tier.tier_key);
  if (prev != null) {
    appendLawdogActivityFeed(`Proof tier moved to ${tier.tier_label}`);
  }
}

function maybeAppendBadgeMilestones(prevBadgeCount: number, activity = readProofActivity()): void {
  const next = deriveLaunchBadges(activity);
  if (next.length > prevBadgeCount) {
    appendLawdogActivityFeed("Earned a new proof badge");
  }
}

/**
 * Call from completion surfaces when simple-flow send is confirmed for this agreement.
 */
export function trackProofSendMilestone(agreementId: string): void {
  const activityBefore = readProofActivity();
  const badgesBefore = deriveLaunchBadges(activityBefore).length;
  const added = noteProofAgreementSent(agreementId);
  if (!added) return;
  recordProofActivityDay("Sent agreement");
  appendLawdogActivityFeed("Completed an agreement send");
  const activity = readProofActivity();
  maybeAppendTierMilestone(activity);
  maybeAppendBadgeMilestones(badgesBefore, activity);
}

/**
 * Call when an agreement is fully signed / finalized from the creator’s perspective.
 */
export function trackProofFinalizeMilestone(agreementId: string): void {
  const activityBefore = readProofActivity();
  const badgesBefore = deriveLaunchBadges(activityBefore).length;
  const added = noteProofAgreementFinalized(agreementId);
  if (!added) return;
  recordProofActivityDay("Signed agreement");
  appendLawdogActivityFeed("Fully signed an agreement");
  const activity = readProofActivity();
  maybeAppendTierMilestone(activity);
  maybeAppendBadgeMilestones(badgesBefore, activity);
}

/** Test helper */
export function __resetProofTierCacheForTests(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(TIER_KEY);
}
