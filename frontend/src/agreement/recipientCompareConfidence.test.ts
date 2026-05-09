import { describe, expect, it } from "vitest";
import { buildRecipientCompareConfidence } from "./recipientCompareConfidence";

describe("buildRecipientCompareConfidence", () => {
  it("returns high with calm copy when signals are clean", () => {
    const r = buildRecipientCompareConfidence({
      artifactsRemovedCount: 0,
      paymentTermsInlinePlacementFailed: false,
      recipientIntentGapCount: 0,
      usedNoisyReviseGuard: false,
      hasLargeBlockFallbackReason: false,
      segmentCount: 20,
      changedBlockCount: 2,
      insertCount: 2,
      deleteCount: 1,
    });
    expect(r.level).toBe("high");
    expect(r.headline).toContain("High");
    expect(r.body.toLowerCase()).toContain("matched");
    expect(r.body.toLowerCase()).not.toContain("anchor");
    expect(r.body.toLowerCase()).not.toContain("dedupe");
    expect(r.body.toLowerCase()).not.toContain("confidently");
  });

  it("returns medium when import cleanup or grouping signals fire", () => {
    const r = buildRecipientCompareConfidence({
      artifactsRemovedCount: 2,
      paymentTermsInlinePlacementFailed: false,
      recipientIntentGapCount: 0,
      usedNoisyReviseGuard: false,
      hasLargeBlockFallbackReason: false,
      segmentCount: 30,
      changedBlockCount: 4,
      insertCount: 5,
      deleteCount: 2,
    });
    expect(r.level).toBe("medium");
    expect(r.headline).toContain("Medium");
    expect(r.body).toMatch(/grouped for readability/i);
  });

  it("returns low when placement fails or many gaps with noise", () => {
    const r = buildRecipientCompareConfidence({
      artifactsRemovedCount: 0,
      paymentTermsInlinePlacementFailed: true,
      recipientIntentGapCount: 0,
      usedNoisyReviseGuard: false,
      hasLargeBlockFallbackReason: false,
      segmentCount: 10,
      changedBlockCount: 2,
      insertCount: 1,
      deleteCount: 0,
    });
    expect(r.level).toBe("low");
    expect(r.headline).toMatch(/needs review/i);
  });
});
