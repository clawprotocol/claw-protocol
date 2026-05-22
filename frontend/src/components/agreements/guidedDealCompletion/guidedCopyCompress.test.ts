import { describe, expect, it } from "vitest";
import { compressGuidedWhy, compressLawDogWill } from "./guidedCopyCompress";

describe("guidedCopyCompress", () => {
  it("shortens why to one brief sentence", () => {
    const why = compressGuidedWhy(
      "Recommended because your intake mentioned a recurring monthly payment but the draft does not spell out timing",
    );
    expect(why).toBeTruthy();
    expect((why || "").split(/\s+/).length).toBeLessThanOrEqual(15);
  });

  it("strips section references from lawDog will", () => {
    const will = compressLawDogWill(
      "payment_timing",
      "Adds fee and payment language to Section 2 — Fees and Payment (and Schedule A if needed) reflecting $6k.",
    );
    expect(will).not.toMatch(/Section \d/i);
    expect(will.length).toBeLessThan(60);
  });
});
