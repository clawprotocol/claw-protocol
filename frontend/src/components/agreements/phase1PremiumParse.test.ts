import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { mergeAgreementFamily, mapAgreementFamilyHint } from "./agreementFamilyRouter";
import { mergeMaterialAsksIntoAdditionalTerms, USER_MATERIAL_TERMS_HEADER, normalizeTextForMaterialDedup } from "./materialAsksMerge";
import { selectAgreementPreviewRoute } from "./agreementPreviewRoute";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { applyPremiumParseExtract } from "./intakePremiumParseApply";

const baseDraft = (over: Partial<ParsedDraftShape> = {}): ParsedDraftShape => ({
  title: "T",
  jurisdiction: "DE",
  parties: [
    { name: "A", role: "party" },
    { name: "B", role: "party" },
  ],
  purpose: "p",
  payment_terms: "pay",
  duration: "1y",
  due_date: null,
  effective_date: null,
  payment: { amount: null, cadence: null, valid: true },
  ...over,
});

describe("mergeAgreementFamily", () => {
  it("operating beats hint", () => {
    expect(mergeAgreementFamily("operating_agreement", "generic", "x")).toBe("operating_agreement");
  });
  it("nda beats hint", () => {
    expect(mergeAgreementFamily("nda", "services", "x")).toBe("nda");
  });
  it("generic accepts valid hint", () => {
    expect(mergeAgreementFamily("generic_business_agreement", "nda", "x")).toBe("nda");
  });
  it("mapAgreementFamilyHint services", () => {
    expect(mapAgreementFamilyHint("services")).toBe("services_agreement");
  });
});

describe("mergeMaterialAsksIntoAdditionalTerms", () => {
  it("appends missing asks", () => {
    const d = baseDraft({ additional_terms: "" });
    const n = mergeMaterialAsksIntoAdditionalTerms({
      ...d,
      material_asks: ["Own all ad account data", "Weekly readouts on spend"],
    });
    expect(n.additional_terms).toContain(USER_MATERIAL_TERMS_HEADER);
    expect(n.additional_terms).toMatch(/Own all ad account data/);
    expect(n.additional_terms).toMatch(/Weekly readouts on spend/);
  });
  it("skips ask already in purpose", () => {
    const d = baseDraft({ purpose: "The parties require weekly readouts on spend for compliance." });
    const n = mergeMaterialAsksIntoAdditionalTerms({ ...d, material_asks: ["weekly readouts on spend"] });
    expect(n.additional_terms || "").not.toContain(USER_MATERIAL_TERMS_HEADER);
  });
  it("idempotent on rerun", () => {
    const first = mergeMaterialAsksIntoAdditionalTerms({
      ...baseDraft(),
      material_asks: ["Keep pixel access logged"],
    });
    const second = mergeMaterialAsksIntoAdditionalTerms({
      ...first,
      material_asks: ["Keep pixel access logged"],
    });
    expect((second.additional_terms || "").split(USER_MATERIAL_TERMS_HEADER).length - 1).toBe(1);
    const c1 = normalizeTextForMaterialDedup(first.additional_terms || "");
    const c2 = normalizeTextForMaterialDedup(second.additional_terms || "");
    expect(c1).toBe(c2);
  });
});

describe("selectAgreementPreviewRoute", () => {
  it("OA => operating", () => {
    expect(
      selectAgreementPreviewRoute(baseDraft({ agreement_family: "operating_agreement" }), { premiumDeliverablePreview: true }),
    ).toBe("operating");
  });
  it("dense premium => premium_dynamic", () => {
    const longPurpose = `${"The agency provides paid media. ".repeat(30)} including ad account access and ${"customer data, ".repeat(20)} pixels, and a 10% fee on sales. `;
    const d = baseDraft({
      purpose: longPurpose,
      payment_terms: "Invoices monthly; $5,000 retainer and 10% of collected revenue; chargeback rules.",
    });
    expect(selectAgreementPreviewRoute(d, { premiumDeliverablePreview: true, starterPreview: false })).toBe("premium_dynamic");
  });
  it("otherwise => premium_default", () => {
    expect(
      selectAgreementPreviewRoute(baseDraft(), { premiumDeliverablePreview: true, starterPreview: false }),
    ).toBe("premium_default");
  });
});

describe("applyPremiumParseExtract", () => {
  it("no extract returns base", () => {
    const b = baseDraft();
    expect(applyPremiumParseExtract(b, "hello", null)).toEqual(b);
  });
  it("merges family and material from extract", () => {
    const b = baseDraft({ agreement_family: "generic_business_agreement" });
    const o = applyPremiumParseExtract(b, "some intake about services", {
      agreement_family_hint: "nda",
      material_asks: ["No competing sponsors for 60 days"],
    });
    expect(o.agreement_family).toBe("nda");
    expect(o.additional_terms).toMatch(/No competing sponsors/);
  });
});

describe("buildAgreementPreviewText routing", () => {
  it("does not throw when options minimal", () => {
    const t = buildAgreementPreviewText(baseDraft(), { starterPreview: true });
    expect(t.length).toBeGreaterThan(20);
  });
});
