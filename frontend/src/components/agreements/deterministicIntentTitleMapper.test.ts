import { describe, expect, it } from "vitest";
import { applyDeterministicIntentToPremiumFullDraftContext, resolveDeterministicIntentTitleAndSeed } from "./deterministicIntentTitleMapper";
import { buildPremiumFullDraftContext } from "./premiumFullDraftApi";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: true };

function minimalDraft(over: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "AGREEMENT",
    jurisdiction: "CA",
    parties: [
      { name: "A", role: "party" },
      { name: "B", role: "party" },
    ],
    purpose: "TBD",
    payment_terms: "TBD",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
    agreement_family: "services_agreement",
    ...over,
  };
}

describe("deterministicIntentTitleMapper", () => {
  it("maps logo / brand / logo design", () => {
    const r = resolveDeterministicIntentTitleAndSeed("We need a brand mark and logo design for $2k");
    expect(r?.id).toBe("logo_brand");
    expect(r?.title).toBe("Logo Design Agreement");
    expect(r?.clausePackSeed).toMatch(/IP ownership/);
  });

  it("maps graphic design (after logo would have matched 'logo' first)", () => {
    const r = resolveDeterministicIntentTitleAndSeed("Hire a vendor for graphic design of packaging");
    expect(r?.id).toBe("graphic_design");
    expect(r?.title).toBe("Design Services Agreement");
  });

  it("maps website and web build", () => {
    expect(resolveDeterministicIntentTitleAndSeed("Need a new website and web build for Q2")?.title).toBe("Web Development Agreement");
    expect(resolveDeterministicIntentTitleAndSeed("Web design refresh for our site")?.id).toBe("web_presence");
  });

  it("maps creator / influencer / brand deal", () => {
    const r = resolveDeterministicIntentTitleAndSeed("TikTok influencer brand deal, 3 reels, whitelisting");
    expect(r?.id).toBe("creator_influencer");
    expect(r?.title).toBe("Influencer Marketing Agreement");
    expect(r?.clausePackSeed).toMatch(/deliverable/i);
  });

  it("maps SaaS subscription", () => {
    expect(resolveDeterministicIntentTitleAndSeed("B2B SaaS subscription with API access")?.id).toBe("saas_subscription");
  });

  it("maps settlement / mutual release", () => {
    expect(resolveDeterministicIntentTitleAndSeed("Mutual release settlement for the dispute")?.title).toMatch(
      /Settlement/i,
    );
  });

  it("maps mutual NDA", () => {
    expect(resolveDeterministicIntentTitleAndSeed("Mutual NDA before we share product roadmap")?.id).toBe("mutual_nda");
  });

  it("maps loan / lent / borrow", () => {
    expect(resolveDeterministicIntentTitleAndSeed("I lent a friend $5,000 with monthly payback")?.title).toBe("Loan Agreement");
  });

  it("maps founder / vesting / equity via shared founder intent", () => {
    const r = resolveDeterministicIntentTitleAndSeed("60/40 split and 4 year vesting between two founders on equity");
    expect(r?.id).toBe("founder_equity");
    expect(r?.title).toBe("Founder Vesting Agreement");
  });

  it("apply overwrites context title and adds seed + id", () => {
    const base = buildPremiumFullDraftContext(minimalDraft());
    const out = applyDeterministicIntentToPremiumFullDraftContext("Simple logo for our café", base);
    expect(out.title).toBe("Logo Design Agreement");
    expect(out.deterministic_intent_id).toBe("logo_brand");
    expect(out.clause_pack_seed).toMatch(/deliverable/i);
  });
});
