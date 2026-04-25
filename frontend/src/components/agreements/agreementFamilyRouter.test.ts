import { describe, expect, it } from "vitest";
import { detectAgreementFamily, needsServiceBilateralSmartDefaults } from "./agreementFamilyRouter";

describe("detectAgreementFamily", () => {
  it("routes LLC operating agreement QA phrasing", () => {
    const raw =
      "Put together a standard operating agreement for LLC. The name of the LLC is ABC LLC. The LLC is formed in Oklahoma.";
    expect(detectAgreementFamily(raw)).toBe("operating_agreement");
  });

  it("routes NDA", () => {
    expect(detectAgreementFamily("We need a mutual NDA between two startups.")).toBe("nda");
  });

  it("routes consulting", () => {
    expect(detectAgreementFamily("Consulting agreement with monthly retainer.")).toBe("consulting_agreement");
  });

  it("routes independent contractor", () => {
    expect(detectAgreementFamily("Independent contractor agreement for design work.")).toBe(
      "independent_contractor_agreement",
    );
  });

  it("defaults generic business", () => {
    expect(detectAgreementFamily("Simple agreement between two companies to share leads.")).toBe(
      "generic_business_agreement",
    );
  });
});

describe("needsServiceBilateralSmartDefaults", () => {
  it("is true for service-style families only", () => {
    expect(needsServiceBilateralSmartDefaults("consulting_agreement")).toBe(true);
    expect(needsServiceBilateralSmartDefaults("services_agreement")).toBe(true);
    expect(needsServiceBilateralSmartDefaults("independent_contractor_agreement")).toBe(true);
    expect(needsServiceBilateralSmartDefaults("operating_agreement")).toBe(false);
    expect(needsServiceBilateralSmartDefaults("nda")).toBe(false);
    expect(needsServiceBilateralSmartDefaults("generic_business_agreement")).toBe(false);
  });
});
