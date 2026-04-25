import { describe, expect, it } from "vitest";
import { buildUpgradeContextReasons, checkoutLossAversionFromIntentSignals } from "./upgradeContextReasons";

describe("buildUpgradeContextReasons", () => {
  it("includes multi-party and profit when signals present", () => {
    const r = buildUpgradeContextReasons({
      sourceText: "Alice and Bob and Carol split profit distributions quarterly under Delaware law.",
      agreementFamily: "operating_agreement",
      guidedFlowId: "",
      draftForParties: { parties: [{}, {}, {}] },
      partiesLine: "Alice and Bob and Carol",
    });
    expect(r.join(" ")).toMatch(/parties|Multiple|responsibilities/i);
    expect(r.join(" ")).toMatch(/profit|money|distributions/i);
  });

  it("checkout footnote contrasts Basic send link with Plus collaboration and proof", () => {
    const line = checkoutLossAversionFromIntentSignals(["exit", "liability"]);
    expect(line).toMatch(/simple send link/i);
    expect(line).toMatch(/collaborate on revisions/i);
    expect(line).toMatch(/proof history/i);
    expect(checkoutLossAversionFromIntentSignals([])).toBe(line);
  });

  it("returns sensible defaults when text is thin", () => {
    const r = buildUpgradeContextReasons({
      sourceText: "Agreement",
      agreementFamily: undefined,
      guidedFlowId: "",
      draftForParties: null,
      partiesLine: "",
    });
    expect(r.length).toBeGreaterThanOrEqual(2);
  });
});
