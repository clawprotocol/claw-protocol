import type { ChallengeProgressView } from "./opportunityTypes";
import type { LeaderboardEntry } from "./opportunityTypes";
import { DEFAULT_SHARE_MESSAGE_PREFIX } from "./clawOpportunityStore";

export type ShareCopyVariant = {
  id: string;
  label: string;
  build: (link: string) => string;
};

export const OPPORTUNITY_SHARE_VARIANTS: readonly ShareCopyVariant[] = [
  {
    id: "pro",
    label: "Calm & credible",
    build: (link) => `${DEFAULT_SHARE_MESSAGE_PREFIX}${link}`,
  },
  {
    id: "pack",
    label: "Pack pride",
    build: (link) =>
      `Earning my spot on the CLAW pack board — real agreements, real proof. Worth a look: ${link}`,
  },
  {
    id: "creator",
    label: "Builder energy",
    build: (link) =>
      `If you still live in PDF hell: CLAW is send + sign + a verify link you can show. I’m in — ${link}`,
  },
];

export function formatLeaderboardBrag(entry: LeaderboardEntry, link: string): string {
  const tier = entry.packTier;
  const flow = entry.agreementsInfluenced;
  return `CLAW momentum board · #${entry.rank} · ${tier} · ${entry.displayHandle} · ${flow} agreement${flow === 1 ? "" : "s"} influenced. If you’re building: ${link}`;
}

export function formatChallengeUpdateCopy(progress: ChallengeProgressView, link: string): string {
  const d = progress.definition;
  const pct = Math.min(100, Math.round((progress.current / progress.target) * 100));
  const status = progress.completed ? "Cleared — " : `${pct}% there — `;
  const blurb = d.description.slice(0, 90);
  const tail = d.description.length > 90 ? "…" : "";
  return `${status}CLAW mission “${d.name}”: ${blurb}${tail} ${link}`;
}
