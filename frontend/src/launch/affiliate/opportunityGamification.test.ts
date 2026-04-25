import { describe, expect, it } from "vitest";
import type { OpportunitySnapshot } from "./clawOpportunityStore";
import { buildOpportunityGamificationView } from "./opportunityGamification";

const baseSnap = (): OpportunitySnapshot => ({
  referralId: "claw_testuser",
  link: "https://example.com/?ref=claw_testuser",
  network: {
    peopleJoined: 0,
    agreementsCreated: 0,
    keysUsed: 0,
    revenueGeneratedUsd: 0,
    payoutAccruedUsd: 0,
    activity: [],
  },
  earnings: { earnedUsd: 0, pendingUsd: 0, paidUsd: 0 },
  packLabel: "Pup",
  packTagline: "You're in the pack.",
});

describe("opportunityGamification", () => {
  it("leaderboard includes current user and preview peers", () => {
    const v = buildOpportunityGamificationView(baseSnap());
    expect(v.source).toBe("local_preview");
    expect(v.leaderboard.length).toBeGreaterThanOrEqual(2);
    const you = v.leaderboard.find((e) => e.isCurrentUser);
    expect(you?.referralId).toBe("claw_testuser");
    expect(v.leaderboard.some((e) => e.rowKind === "preview_peer")).toBe(true);
  });

  it("maps challenge definitions from config", () => {
    const v = buildOpportunityGamificationView(baseSnap());
    expect(v.challenges.length).toBeGreaterThanOrEqual(4);
    expect(v.challenges.map((c) => c.definition.id).join(",")).toContain("first_agreement");
  });
});
