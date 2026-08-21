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

  it("routes contractor agreement for developer before generic business", () => {
    expect(
      detectAgreementFamily(
        "Need a contractor agreement for a developer. Work product ownership and month-to-month term.",
      ),
    ).toBe("independent_contractor_agreement");
  });

  it("routes hire-to-do-work as services, not generic business", () => {
    expect(detectAgreementFamily("Hire Alex to build our shopify theme, $3k, two weeks")).toBe(
      "services_agreement",
    );
    expect(detectAgreementFamily("I hired Mike to paint my office. We shook on it.")).toBe(
      "services_agreement",
    );
  });

  it("still routes explicit employment agreement as generic so Employment title can stand", () => {
    expect(
      detectAgreementFamily(
        "Create an employment agreement for John Smith in Acme LLC for $20 an hour.",
      ),
    ).toBe("generic_business_agreement");
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
