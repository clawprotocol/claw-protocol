import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { applyDeterministicCommercialIntakeFallback } from "./intakeDeterministicFallback";

const QA = `Create a SaaS reseller and white-label services agreement between Redwood Peak Ventures LLC, Atlas Harbor Technologies Inc., Meridian Workforce Group LLC, Prairie Signal Holdings LP, and NovaGrid Systems LLC. Scope includes white-label deployment of workflow automation software, API integrations, onboarding support, analytics dashboards, and ongoing maintenance. Total fee $124,750 paid across 5 milestone payments tied to deployment phases. Term 18 months with automatic month-to-month renewal unless terminated with 30 days notice. Governing law Delaware. Include confidentiality, data security obligations, intellectual property ownership, limitation of liability, indemnification, uptime/service level expectations, non-solicitation, termination for cause and convenience, dispute resolution, force majeure, audit rights, and electronic signatures.`;

const emptyish = (): ParsedDraftShape => ({
  title: "Payment Plan Agreement",
  jurisdiction: "TBD",
  parties: [
    { name: "A", role: "party" },
    { name: "B", role: "party" },
  ],
  purpose: "",
  payment_terms: "",
  duration: "",
  due_date: null,
  effective_date: null,
  payment: { amount: null, cadence: null, valid: true },
  agreement_family: "services_agreement",
});

describe("applyDeterministicCommercialIntakeFallback", () => {
  it("overrides payment-plan misroute title and fills scope/payment/term/law for LawDog QA SaaS prompt", () => {
    const out = applyDeterministicCommercialIntakeFallback(QA, emptyish());
    expect(out.title).toBe("SaaS Reseller and White-Label Services Agreement");
    expect(out.purpose.toLowerCase()).toContain("workflow automation");
    expect(out.payment_terms).toMatch(/124,?750/);
    expect(out.payment_terms.toLowerCase()).toContain("milestone");
    expect(out.duration?.toLowerCase() ?? "").toContain("18 months");
    expect(out.duration?.toLowerCase() ?? "").toContain("renewal");
    expect(out.duration?.toLowerCase() ?? "").toContain("30 days");
    expect(out.jurisdiction.toLowerCase()).toContain("delaware");
  });

  it("replaces thin parser stubs after basic_parse_timeout-style partial parse (non-empty generic fields)", () => {
    const thinParsed: ParsedDraftShape = {
      title: "Independent Contractor Agreement",
      jurisdiction: "To be selected in review.",
      parties: [
        { name: "Redwood Peak Ventures LLC", role: "party" },
        { name: "Atlas Harbor Technologies Inc.", role: "party" },
      ],
      purpose: "Software development / technical services",
      payment_terms: "$124,750",
      duration: "18 months",
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: true },
      agreement_family: "independent_contractor_agreement",
    };
    const out = applyDeterministicCommercialIntakeFallback(QA, thinParsed);
    expect(out.title).toBe("SaaS Reseller and White-Label Services Agreement");
    expect(out.purpose.toLowerCase()).toContain("white-label");
    expect(out.purpose.toLowerCase()).toContain("workflow automation");
    expect(out.payment_terms).toMatch(/124,?750/);
    expect(out.payment_terms.toLowerCase()).toContain("milestone");
    expect(out.duration?.toLowerCase() ?? "").toContain("month-to-month");
    expect(out.duration?.toLowerCase() ?? "").toContain("30 days");
    expect(out.jurisdiction.toLowerCase()).toContain("delaware");
  });
});
