import { describe, expect, it } from "vitest";
import {
  needsComplexityIntercept,
  resolveSafeSimplifiedAgreementRouting,
  simplifyParsedDraftForInstantPath,
} from "./agreementComplexityGate";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const minimal = (family: ParsedDraftShape["agreement_family"]): ParsedDraftShape => ({
  title: "Test",
  jurisdiction: "DE",
  parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
  purpose: "Scope",
  payment_terms: "N/A",
  duration: "1 year",
  due_date: null,
  effective_date: "Today",
  payment: { amount: null, cadence: null, valid: true },
  agreement_family: family,
});

describe("needsComplexityIntercept", () => {
  it("is true for operating agreement family", () => {
    expect(needsComplexityIntercept("We need an LLC operating agreement for two members.", "operating_agreement")).toBe(
      true,
    );
  });

  it("detects SAFE from intake text", () => {
    expect(needsComplexityIntercept("Please draft a SAFE for our seed round.", "generic_business_agreement")).toBe(true);
  });

  it("is false for a simple services description", () => {
    expect(
      needsComplexityIntercept("Consultant will build a landing page for $5k.", "generic_business_agreement"),
    ).toBe(false);
  });

  it("is true for consulting + LLC entity (trust gate)", () => {
    expect(
      needsComplexityIntercept(
        "consulting agreement between Anthem Blanchard and Peaceful Journey LLC for advisory services.",
        "consulting_agreement",
      ),
    ).toBe(true);
  });

  it("is false for employment-style generic intake (instant family policy)", () => {
    expect(
      needsComplexityIntercept(
        "Employment agreement between Acme and Jane Doe, start date next month.",
        "generic_business_agreement",
      ),
    ).toBe(false);
  });
});

describe("simplifyParsedDraftForInstantPath", () => {
  it("strips operating-agreement shell fields and routes to a broad commercial template", () => {
    const oa = minimal("operating_agreement");
    const raw = "Operating agreement for two members with capital accounts.";
    const out = simplifyParsedDraftForInstantPath(
      {
        ...oa,
        llc_company_name: "Acme LLC",
        management_structure: "Manager-managed",
      },
      raw,
    );
    expect(out.agreement_family).toBe("services_agreement");
    expect(out.title).toBe("Business Services Agreement");
    expect(out.llc_company_name).toBeNull();
    expect(out.management_structure).toBeNull();
  });

  it("routes consulting + LLC simplified path to Consulting Agreement", () => {
    const oa = minimal("operating_agreement");
    const raw = "consulting agreement between Anthem Blanchard and Peaceful Journey LLC for advisory work.";
    const out = simplifyParsedDraftForInstantPath({ ...oa, agreement_family: "operating_agreement" }, raw);
    expect(out.agreement_family).toBe("consulting_agreement");
    expect(out.title).toBe("Consulting Agreement");
  });
});

describe("resolveSafeSimplifiedAgreementRouting", () => {
  it("prefers consulting over confidentiality wording in the same intake", () => {
    const raw =
      "Consulting agreement between Peaceful Journey LLC and Anthem Blanchard. Mutual confidentiality for client data.";
    const r = resolveSafeSimplifiedAgreementRouting(raw, minimal("consulting_agreement"));
    expect(r.agreement_family).toBe("consulting_agreement");
    expect(r.title).toBe("Consulting Agreement");
  });
});
