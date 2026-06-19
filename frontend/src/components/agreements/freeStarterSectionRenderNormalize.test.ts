import { describe, expect, it } from "vitest";
import { normalizeFreeStarterSectionRender } from "./freeStarterSectionRenderNormalize";
import {
  isSignerTitleLikeRole,
  starterCommercialRoleForIndex,
} from "./starterRoleLabelGuard";
import { inferStarterCommercialPartyRoles } from "./starterOpeningPartyPreserve";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

describe("starterRoleLabelGuard", () => {
  it("detects signer titles but not agreement roles", () => {
    expect(isSignerTitleLikeRole("CEO")).toBe(true);
    expect(isSignerTitleLikeRole("President")).toBe(true);
    expect(isSignerTitleLikeRole("Managing Partner")).toBe(true);
    expect(isSignerTitleLikeRole("Client")).toBe(false);
    expect(isSignerTitleLikeRole("Service Provider")).toBe(false);
    expect(isSignerTitleLikeRole("party")).toBe(false);
  });

  it("maps two-party commercial roles to Client and Service Provider", () => {
    expect(starterCommercialRoleForIndex(0, 2)).toBe("Client");
    expect(starterCommercialRoleForIndex(1, 2)).toBe("Service Provider");
    expect(starterCommercialRoleForIndex(2, 4)).toBe("Party 3");
  });
});

describe("normalizeFreeStarterSectionRender", () => {
  it("repairs glued headings, signer-title recital labels, and null term leakage", () => {
    const intake =
      "Scope: Strategic business consulting.\nBlue Canyon Analytics LLC will pay Harbor Peak Automation LLC $48,000 in monthly installments.\nTerm: twelve (12) months.";
    const glued = [
      "SERVICES AGREEMENT",
      "",
      'This Agreement is between Blue Canyon Analytics LLC ("CEO") and Harbor Peak Automation LLC ("President").',
      "",
      "1. Scope of Services / Purpose strategic business consulting and operational planning services.",
      "2. Payment Terms $48,000 in monthly installments.",
      "3. Services Term and Effective Date Term: until null",
    ].join("\n");
    const draft: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      purpose: "Strategic business consulting and operational planning services.",
      payment_terms: "$48,000 in monthly installments",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: 48000, cadence: "monthly", valid: true },
      parties: [
        { name: "Blue Canyon Analytics LLC", role: "CEO" },
        { name: "Harbor Peak Automation LLC", role: "President" },
      ],
      agreement_family: "services_agreement",
    };
    const upgraded = inferStarterCommercialPartyRoles(draft, intake);
    expect(upgraded.parties?.map((p) => p.role)).toEqual(["Client", "Service Provider"]);

    const out = normalizeFreeStarterSectionRender(glued, { intake, draft: upgraded });
    expect(out.fixedRoleLabels).toBeGreaterThan(0);
    expect(out.fixedHeadingBodyCollapse).toBeGreaterThan(0);
    expect(out.fixedNullLeakage).toBeGreaterThan(0);
    expect(out.text).toMatch(/\("Client"\)/);
    expect(out.text).not.toMatch(/\("CEO"\)|\("President"\)/);
    expect(out.text).toMatch(/\n\n1\.\s+Scope of Services \/ Purpose\n\n/);
    expect(out.text).toMatch(/\n\n2\.\s+Payment Terms\n\n/);
    expect(out.text).not.toMatch(/\buntil null\b/i);
    expect(out.text).toMatch(/twelve \(12\) months/i);
  });

  it("splits collapsed Term and Effective Date onto separate lines", () => {
    const collapsed =
      "3. Services Term and Effective Date\nTerm: 12 months Effective Date: upon full execution by both parties";
    const out = normalizeFreeStarterSectionRender(collapsed, {
      intake: "Term: twelve (12) months.",
    });
    expect(out.text).toMatch(/Term:\s*12 months\nEffective Date:\s*upon full execution by both parties/i);
    expect(out.text).not.toMatch(/Term:\s*12 months Effective Date:/i);
  });
});
