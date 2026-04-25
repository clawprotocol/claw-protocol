import { describe, expect, it } from "vitest";
import type { LawdogProofActivityV1 } from "./proofActivityStore";
import {
  completionQualityBonusPoints,
  completionRateFraction,
  computeProofScore,
} from "./proofScore";

function act(partial: Partial<LawdogProofActivityV1>): LawdogProofActivityV1 {
  return {
    sent_agreement_ids: partial.sent_agreement_ids ?? [],
    finalized_agreement_ids: partial.finalized_agreement_ids ?? [],
    updated_at_ms: 0,
  };
}

describe("completionRateFraction & bonus bands", () => {
  it("computes rate and bonus tiers", () => {
    expect(completionRateFraction(4, 0)).toBe(0);
    expect(completionQualityBonusPoints(0)).toBe(0);
    expect(completionQualityBonusPoints(0.24)).toBe(0);
    expect(completionQualityBonusPoints(0.25)).toBe(5);
    expect(completionQualityBonusPoints(0.49)).toBe(5);
    expect(completionQualityBonusPoints(0.5)).toBe(15);
    expect(completionQualityBonusPoints(0.74)).toBe(15);
    expect(completionQualityBonusPoints(0.75)).toBe(30);
    expect(completionQualityBonusPoints(1)).toBe(30);
  });
});

describe("computeProofScore", () => {
  it("uses 10/25 weights plus completion bonus", () => {
    const s = computeProofScore(act({ sent_agreement_ids: ["a"], finalized_agreement_ids: [] }));
    expect(s.from_sent).toBe(10);
    expect(s.from_finalized).toBe(0);
    expect(s.from_completion_bonus).toBe(0);
    expect(s.score).toBe(10);
  });

  it("adds completion bonus for mixed completion", () => {
    const s = computeProofScore(act({ sent_agreement_ids: ["a", "b", "c"], finalized_agreement_ids: ["x", "y"] }));
    expect(s.from_sent).toBe(30);
    expect(s.from_finalized).toBe(50);
    expect(s.completion_rate_pct).toBe(67);
    expect(s.from_completion_bonus).toBe(15);
    expect(s.score).toBe(95);
  });

  it("max completion bonus when all signed", () => {
    const s = computeProofScore(
      act({ sent_agreement_ids: ["a", "b"], finalized_agreement_ids: ["a", "b"] })
    );
    expect(s.from_completion_bonus).toBe(30);
    expect(s.score).toBe(20 + 50 + 30);
  });
});
