import { describe, expect, it } from "vitest";
import { filterChipsForBusinessReviewPresentation } from "./recipientFriendlyChipsPresentation";

describe("filterChipsForBusinessReviewPresentation", () => {
  it("drops consolidated feedback and tiny list fragments", () => {
    const out = filterChipsForBusinessReviewPresentation([
      "Payment terms updated",
      "consolidated feedback",
      "(b) mobile optimization",
      "Scope clarified",
    ]);
    expect(out).toContain("Payment terms updated");
    expect(out).toContain("Scope clarified");
    expect(out.some((c) => /consolidated feedback/i.test(c))).toBe(false);
    expect(out.some((c) => /^\(b\)/i.test(c))).toBe(false);
  });

  it("dedupes duplicate semantics", () => {
    const out = filterChipsForBusinessReviewPresentation(["Net 30 timing", "Invoice timing"]);
    expect(out.length).toBe(1);
  });
});
