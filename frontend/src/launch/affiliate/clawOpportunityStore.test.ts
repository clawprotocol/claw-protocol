import { afterEach, describe, expect, it } from "vitest";
import {
  packForStats,
  sanitizeReferralToken,
} from "./clawOpportunityStore";

describe("clawOpportunityStore", () => {
  afterEach(() => {
    if (typeof localStorage !== "undefined") localStorage.clear();
    if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  });

  it("sanitizeReferralToken rejects unsafe tokens", () => {
    expect(sanitizeReferralToken("abc-123_ok")).toBe("abc-123_ok");
    expect(sanitizeReferralToken("bad token")).toBeNull();
    expect(sanitizeReferralToken("")).toBeNull();
  });

  it("packForStats tiers (Pup → Alpha)", () => {
    const z = { peopleJoined: 0, agreementsCreated: 0, keysUsed: 0, revenueGeneratedUsd: 0, payoutAccruedUsd: 0, activity: [] };
    expect(packForStats(z).label).toBe("Pup");
    expect(packForStats({ ...z, peopleJoined: 1 }).label).toBe("Builder");
    expect(packForStats({ ...z, peopleJoined: 2, agreementsCreated: 1 }).label).toBe("Connector");
    expect(packForStats({ ...z, peopleJoined: 20, agreementsCreated: 2 }).label).toBe("Alpha");
  });
});
