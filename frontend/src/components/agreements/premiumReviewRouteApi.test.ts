import { describe, expect, it } from "vitest";
import { mapPremiumReviewRoute } from "./premiumReviewRouteApi";

describe("mapPremiumReviewRoute", () => {
  it("normalizes malformed payload to deterministic review route", () => {
    const out = mapPremiumReviewRoute({
      route: "???",
      confidence: "N/A",
      unresolved_items: "bad",
      reasons: null,
      send_readiness_score: 999,
      recommended_cta: "random",
      short_summary: "",
    });
    expect(out.route).toBe("review");
    expect(out.confidence).toBe("medium");
    expect(out.send_readiness_score).toBe(100);
    expect(out.recommended_cta).toBe("Send for review");
    expect(out.unresolved_items).toEqual([]);
  });

  it("preserves valid signature recommendation", () => {
    const out = mapPremiumReviewRoute({
      route: "signature",
      confidence: "high",
      unresolved_items: [],
      reasons: ["All material terms are present"],
      send_readiness_score: 92,
      recommended_cta: "Send for signature",
      short_summary: "Looks ready to sign.",
    });
    expect(out.route).toBe("signature");
    expect(out.recommended_cta).toBe("Send for signature");
    expect(out.short_summary).toContain("ready");
  });
});

