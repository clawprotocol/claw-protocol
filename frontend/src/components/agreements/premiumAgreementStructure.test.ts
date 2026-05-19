import { describe, expect, it } from "vitest";
import { detectAgreementFamily, isAiSoftwareInfrastructureRolloutPrompt } from "./agreementFamilyRouter";
import { applyPaidProRenderPolish, clearPaidProRenderPolishCacheForTests } from "./paidProRenderPolish";
import { IRONCLAD_JOINT_ROLLOUT_INTAKE } from "./premiumPaidCorpusFivePartyQa.test";

const IRONCLAD_PARTIES = [
  "Ironclad Systems Group LLC",
  "Harborline Data Solutions Inc.",
  "Northwind Automation Partners LLC",
  "Silver Mesa Analytics LP",
  "VertexGrid Technologies LLC",
] as const;
import { validateAndRepairPremiumAgreementStructure } from "./premiumAgreementStructure";

describe("isAiSoftwareInfrastructureRolloutPrompt", () => {
  it("detects Ironclad joint AI rollout intake", () => {
    expect(isAiSoftwareInfrastructureRolloutPrompt(IRONCLAD_JOINT_ROLLOUT_INTAKE)).toBe(true);
    expect(detectAgreementFamily(IRONCLAD_JOINT_ROLLOUT_INTAKE)).toBe("services_agreement");
  });
});

describe("validateAndRepairPremiumAgreementStructure", () => {
  it("repairs duplicate operational contacts phrase", () => {
    const broken =
      "3.1 Project Coordination. The Parties shall coordinate deployment through designated operational contacts through designated operational contacts.";
    const r = validateAndRepairPremiumAgreementStructure(broken);
    expect(r.text).not.toMatch(/designated operational contacts through designated operational contacts/i);
  });

  it("removes dispute sentence from coordination section", () => {
    const broken = [
      "3. GOVERNANCE",
      "3.1 Project Coordination. Parties shall meet monthly.",
      "Any dispute shall be resolved by binding arbitration in Texas.",
      "4. TERM",
      "Initial term is twenty-four months.",
    ].join("\n");
    const r = validateAndRepairPremiumAgreementStructure(broken);
    expect(r.text).not.toMatch(/Any dispute shall be resolved/i);
    expect(r.text).toMatch(/twenty-four months/i);
  });

  it("removes orphan effective-date sentence outside Term", () => {
    const broken = [
      "3. FEES",
      "Fees are milestone-based.",
      "The initial term of this Agreement begins on the date of the last signature below (the “Effective Date”).",
      "4. TERM AND RENEWAL",
      "The term is twenty-four (24) months.",
    ].join("\n");
    const r = validateAndRepairPremiumAgreementStructure(broken);
    expect(r.text).not.toMatch(/begins on the date of the last signature/i);
    expect(r.text).toMatch(/twenty-four \(24\) months/i);
  });

  it("fills empty numbered subsection with generic clause", () => {
    const broken = ["5. PAYMENT", "5.3 Invoicing and Payment Timing.", "5.4 Late Fees.", "Late fees apply."].join("\n");
    const r = validateAndRepairPremiumAgreementStructure(broken);
    const after53 = r.text.split("5.3")[1]?.split("5.4")[0] ?? "";
    expect(after53.trim().length).toBeGreaterThan(30);
  });
});

describe("Ironclad five-party Pro polish path", () => {
  const defectiveCorpus = [
    "MULTI-PARTY TECHNOLOGY SERVICES AGREEMENT",
    "",
    `This Agreement is entered into among ${IRONCLAD_PARTIES.join(", ")}.`,
    "",
    "3. GOVERNANCE AND COORDINATION",
    "3.1 Project Coordination. The Parties shall coordinate deployment sequencing through designated operational contacts through designated operational contacts.",
    "Any dispute shall be resolved by binding arbitration under Texas law.",
    "",
    "The initial term of this Agreement begins on the date of the last signature below (the “Effective Date”).",
    "",
    "4. TERM AND RENEWAL",
    "4.1 Term. The initial term is twenty-four (24) months with annual renewal.",
    "IMPLEMENTATION MILESTONES",
    "| Phase | Owner |",
    "| --- | --- |",
    "",
    "5. FEES",
    "5.3 Invoicing and Payment Timing.",
    "5.4 Total Fees. Total contract value is $187,500.",
    "",
    "12. DISPUTE RESOLUTION",
    "12.1 Disputes shall be resolved by mediation, then binding arbitration in Texas.",
    "",
    "IN WITNESS WHEREOF:",
    ...IRONCLAD_PARTIES.map((p) => `${p}\nBy: _________________________`),
  ].join("\n");

  it("contains all five parties and repairs structural defects after polish", () => {
    clearPaidProRenderPolishCacheForTests();
    const polished = applyPaidProRenderPolish(defectiveCorpus, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "ironclad_qa_test",
    }).text;
    for (const p of IRONCLAD_PARTIES) {
      expect(polished).toContain(p);
    }
    expect(polished).not.toMatch(/designated operational contacts through designated operational contacts/i);
    expect(polished).not.toMatch(/IMPLEMENTATION MILESTONES[\s\S]*?4\.1 Term/i);
    const coord = polished.match(/3\.1[\s\S]*?(?=4\.|12\.)/i)?.[0] ?? "";
    expect(coord).not.toMatch(/Any dispute shall be resolved/i);
    const structure = validateAndRepairPremiumAgreementStructure(polished);
    expect(structure.text).not.toMatch(/designated operational contacts through designated operational contacts/i);
  });

  it("memoizes polish for identical doc fingerprint + surface", () => {
    clearPaidProRenderPolishCacheForTests();
    const a = applyPaidProRenderPolish(defectiveCorpus, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "memo_test",
    });
    const b = applyPaidProRenderPolish(defectiveCorpus, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "memo_test",
    });
    expect(b.text).toBe(a.text);
  });
});
