import { describe, expect, it } from "vitest";
import { buildStripeCheckoutMetadata } from "./buildStripeCheckoutMetadata";

describe("buildStripeCheckoutMetadata", () => {
  it("includes org_id, visitor_id, referral_code, plan_code pro", () => {
    const md = buildStripeCheckoutMetadata("org_abc", {
      referral_code: "GENESISDOG",
      visitor_id: "vis_test_001",
    });
    expect(md.org_id).toBe("org_abc");
    expect(md.claw_org_id).toBe("org_abc");
    expect(md.plan_code).toBe("pro");
    expect(md.referral_code).toBe("GENESISDOG");
    expect(md.visitor_id).toBe("vis_test_001");
  });
});
