import { describe, expect, it } from "vitest";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import { explicitIntentCanonicalTitle } from "./canonicalAgreementTitle";
import { hasExplicitEntityFormationIntent } from "./starterEntityFormationIntent";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { selectAgreementPreviewRoute } from "./agreementPreviewRoute";

export const TRIPARTITE_SOFTWARE_DEV_INTAKE = `Create a TRIPARTITE SOFTWARE DEVELOPMENT AND REVENUE SHARING AGREEMENT among Red Mesa Logistics LLC, Harbor Peak Automation LLC, and Blue Canyon Analytics LLC.

Purpose: development and maintenance of a custom freight optimization platform, including analytics dashboard work.

Term: twenty-four (24) months.

Payment: $120,000 startup payment plus $3,000 per month maintenance.

Revenue sharing: Red Mesa Logistics LLC 50%, Harbor Peak Automation LLC 30%, Blue Canyon Analytics LLC 20%.

Confidentiality applies. Oklahoma law governs. Electronic execution via LawDog.`;

const LLC_FORMATION_CONTROL_INTAKE =
  "Operating agreement for Sunrise Ventures LLC with three members: Alice 40%, Bob 35%, and Carol 25%. Manager-managed. Governed by New York law.";

function emptyDraft() {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
  };
}

describe("tripartite software development starter regression", () => {
  it("does not classify tripartite software development intake as entity formation", () => {
    expect(hasExplicitEntityFormationIntent(TRIPARTITE_SOFTWARE_DEV_INTAKE)).toBe(false);
    expect(detectAgreementFamily(TRIPARTITE_SOFTWARE_DEV_INTAKE)).not.toBe("operating_agreement");
  });

  it("classifies tripartite software development as commercial services, not LLC formation", () => {
    const family = detectAgreementFamily(TRIPARTITE_SOFTWARE_DEV_INTAKE);
    expect(["services_agreement", "generic_business_agreement", "consulting_agreement"]).toContain(family);
    expect(explicitIntentCanonicalTitle(TRIPARTITE_SOFTWARE_DEV_INTAKE)).toMatch(
      /software development|revenue sharing|tripartite/i,
    );
  });

  it("renders starter preview with three parties and commercial terms, not LLC formation shell", () => {
    const draft = runIntakeDefaultsAndRoles(
      emptyDraft(),
      TRIPARTITE_SOFTWARE_DEV_INTAKE,
      true,
      defaultIntakePartyRoleLabels(),
    );
    expect(draft.agreement_family).not.toBe("operating_agreement");
    expect(selectAgreementPreviewRoute(draft, { starterPreview: true })).not.toBe("operating");

    const preview = buildAgreementPreviewTextCore(draft, {
      starterPreview: true,
      intakeText: TRIPARTITE_SOFTWARE_DEV_INTAKE,
    });

    expect(preview).toMatch(/Red Mesa Logistics LLC/i);
    expect(preview).toMatch(/Harbor Peak Automation LLC/i);
    expect(preview).toMatch(/Blue Canyon Analytics LLC/i);
    expect(preview).toMatch(/24\s+months|twenty-four\s*\(24\)\s+months/i);
    expect(preview).toMatch(/\$120,000/);
    expect(preview).toMatch(/\$3,000/);
    expect(preview).toMatch(/50\s*%/);
    expect(preview).toMatch(/30\s*%/);
    expect(preview).toMatch(/20\s*%/);
    expect(preview).toMatch(/Oklahoma/i);

    expect(preview).not.toMatch(/STATE OF FORMATION/i);
    expect(preview).not.toMatch(/MANAGEMENT\s+\[Not yet specified\]/i);
    expect(preview).not.toMatch(/MEMBERS\s*\/\s*OWNERSHIP/i);
    expect(preview).not.toMatch(/CAPITAL CONTRIBUTIONS/i);
    expect(preview).not.toMatch(/DISSOLUTION\s+\[Not yet specified\]/i);
    expect(preview).not.toMatch(/ENTITY\s+Company:/i);
    expect(preview).not.toMatch(/simplified LLC starter preview/i);
  });

  it("still routes true LLC formation prompts to operating agreement starter", () => {
    expect(hasExplicitEntityFormationIntent(LLC_FORMATION_CONTROL_INTAKE)).toBe(true);
    expect(detectAgreementFamily(LLC_FORMATION_CONTROL_INTAKE)).toBe("operating_agreement");
    const draft = runIntakeDefaultsAndRoles(
      emptyDraft(),
      LLC_FORMATION_CONTROL_INTAKE,
      true,
      defaultIntakePartyRoleLabels(),
    );
    expect(draft.agreement_family).toBe("operating_agreement");
    const preview = buildAgreementPreviewTextCore(draft, {
      starterPreview: true,
      intakeText: LLC_FORMATION_CONTROL_INTAKE,
    });
    expect(preview).toMatch(/MANAGEMENT/i);
    expect(preview).toMatch(/MEMBERS\s*\/\s*OWNERSHIP/i);
    expect(preview).toMatch(/simplified LLC starter preview/i);
  });
});
