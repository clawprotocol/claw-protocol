import { describe, expect, it } from "vitest";
import { proofRankBandLabel, proofTierFromScore } from "./proofTier";

describe("proofTierFromScore", () => {
  it("uses launch bands", () => {
    expect(proofTierFromScore(0).tier_key).toBe("aqua");
    expect(proofTierFromScore(24).tier_key).toBe("aqua");
    expect(proofTierFromScore(25).tier_key).toBe("blue");
    expect(proofTierFromScore(74).tier_key).toBe("blue");
    expect(proofTierFromScore(75).tier_key).toBe("purple");
    expect(proofTierFromScore(174).tier_key).toBe("purple");
    expect(proofTierFromScore(175).tier_key).toBe("yellow");
    expect(proofTierFromScore(349).tier_key).toBe("yellow");
    expect(proofTierFromScore(350).tier_key).toBe("rose");
  });
});

describe("proofRankBandLabel", () => {
  it("uses proof-oriented band copy", () => {
    expect(proofRankBandLabel(0)).toContain("Starting");
    expect(proofRankBandLabel(400)).toContain("Top proof");
  });
});
