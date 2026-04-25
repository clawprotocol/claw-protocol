import type { LawdogLaunchBadgeId } from "./lawdogLeaderboardTypes";
import type { LawdogProofActivityV1 } from "./proofActivityStore";
import { proofActivityCounts } from "./proofActivityStore";
import { completionRateFraction } from "./proofScore";

export type LawdogBadgeView = {
  id: LawdogLaunchBadgeId;
  title: string;
  hint: string;
};

const DEFS: Record<LawdogLaunchBadgeId, Omit<LawdogBadgeView, "id">> = {
  first_record: {
    title: "First Record",
    hint: "You completed a real send — your first proof on the board.",
  },
  closer: {
    title: "Closer",
    hint: "Three agreements fully signed — proof that deals finish.",
  },
  proven: {
    title: "Proven",
    hint: "Solid volume with at least half of sends reaching full signature.",
  },
};

export function launchBadgeCatalog(): LawdogBadgeView[] {
  return (Object.keys(DEFS) as LawdogLaunchBadgeId[]).map((id) => ({ id, ...DEFS[id] }));
}

/**
 * Three earned badges only. Doginal is not a badge — see public row markers.
 */
export function deriveLaunchBadges(activity: LawdogProofActivityV1): LawdogLaunchBadgeId[] {
  const { sent, finalized } = proofActivityCounts(activity);
  const rate = completionRateFraction(sent, finalized);
  const out: LawdogLaunchBadgeId[] = [];
  if (sent >= 1) out.push("first_record");
  if (finalized >= 3) out.push("closer");
  if (sent >= 3 && rate >= 0.5) out.push("proven");
  return out;
}
