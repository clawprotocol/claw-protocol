import { describe, expect, it } from "vitest";
import { buildPremiumPostCheckoutStitchedBody } from "./premiumCheckoutStitchedBody";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PREMIUM_JURISDICTION_PLACEHOLDER } from "./premiumDraftTransform";

function base(over: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "Consulting",
    jurisdiction: "Delaware",
    parties: [
      { name: "Anthem Blanchard", role: "Client" },
      { name: "Sarah Collins", role: "Contractor" },
    ],
    purpose: "Build and ship the mobile app and API described in the statement of work.",
    payment_terms: "USD 4,000 deposit and USD 1,200 weekly.",
    duration: "12 weeks",
    due_date: null,
    effective_date: "Upon signature",
    payment: { amount: null, cadence: null, valid: true },
    agreement_family: "independent_contractor_agreement",
    additional_terms: "Milestone: prototype by week 4.",
    ...over,
  } as ParsedDraftShape;
}

describe("buildPremiumPostCheckoutStitchedBody", () => {
  it("preserves party names and uses Oklahoma over Delaware from intake", () => {
    const raw =
      "Software development between Anthem Blanchard and Sarah Collins. Governing law: Oklahoma. Payment $4000 + $1200/wk.";
    const t = buildPremiumPostCheckoutStitchedBody(
      base({ jurisdiction: "Delaware" }),
      raw,
    );
    const low = t.toLowerCase();
    expect(low).toContain("anthem");
    expect(low).toContain("sarah");
    expect(low).toMatch(/oklahoma/);
    expect(low).not.toMatch(/delaware/);
    expect(low).not.toContain("this lawdog pro");
    expect(low).not.toContain("thin");
    expect(low).not.toContain("preview");
    expect(t).toMatch(/SOFTWARE DEVELOPMENT AGREEMENT|FREELANCE SOFTWARE/);
  });

  it("does not mention Delaware when intake specifies Oklahoma and structured law is placeholder", () => {
    const raw = "Software project. Laws of Oklahoma. Parties: A and B.";
    const t = buildPremiumPostCheckoutStitchedBody(
      base({ jurisdiction: PREMIUM_JURISDICTION_PLACEHOLDER, parties: [{ name: "A", role: "x" }, { name: "B", role: "y" }] }),
      raw,
    );
    expect(t.toLowerCase()).toContain("oklahoma");
    expect(t.toLowerCase()).not.toContain("delaware");
  });
});
