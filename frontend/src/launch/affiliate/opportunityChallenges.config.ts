import type { ChallengeDefinition } from "./opportunityTypes";

/** Declarative missions — swap for API-driven list later without JSX edits */
export const OPPORTUNITY_CHALLENGE_DEFINITIONS: readonly ChallengeDefinition[] = [
  {
    id: "first_agreement",
    name: "First agreement run",
    description:
      "Get one agreement actually started via your referral — the smallest proof that your link does work.",
    target: 1,
    rewardCopyStub: "Streak credit when missions pay out on net revenue (stub).",
    metric: "agreements_total",
    windowLabel: "Open-ended",
  },
  {
    id: "three_agreements_week",
    name: "Triple-send week",
    description:
      "Three influenced agreements inside seven days — learn what repeatability feels like before you scale noise.",
    target: 3,
    rewardCopyStub: "Board highlight when wired (stub — looks only).",
    metric: "agreements_rolling_7d",
    windowLabel: "Rolling 7 days",
  },
  {
    id: "first_paid_send",
    name: "First paid moment",
    description:
      "Someone pays through your ecosystem — the cleanest signal that strangers trusted your recommendation.",
    target: 1,
    rewardCopyStub: "Flow badge tier (stub — base revshare unchanged).",
    metric: "keys_total",
    windowLabel: "All time",
  },
  {
    id: "share_proof_wild",
    name: "Proof in public",
    description:
      "Copy a verify link once — credibility is portable when the artifact is real.",
    target: 1,
    rewardCopyStub: "Proof-share signal for experiments (stub).",
    metric: "share_proof",
    windowLabel: "Anytime",
  },
];
