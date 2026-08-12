import { afterEach, describe, expect, it } from "vitest";
import {
  assessPaidProMutualConsultingProfessionalStructure,
  applyMutualConsultingProfessionalQualityFloor,
  countNumberedAgreementSections,
  MUTUAL_CONSULTING_MIN_NUMBERED_SECTIONS,
} from "./paidProMutualConsultingQualityFloor";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  resetUnauthorizedSemanticInsertsForTests,
  setUnauthorizedSemanticInsertsForTests,
} from "./unauthorizedSemanticInsertPolicy";

afterEach(() => {
  resetUnauthorizedSemanticInsertsForTests();
});

// Avoid ai|automation|workflow|implementation|setup tokens — those route to AI-workflow floor.
const NON_AI_INTAKE =
  "Create a mutual consulting services agreement between Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider). Fee $8,500. Delaware law.";

const THIN = [
  "MUTUAL CONSULTING AGREEMENT",
  "1. Scope of Services. Provider will deliver consulting support described in any Statement of Work.",
  "2. Fees. Client pays $8,500.",
  "3. Term. Continues until completed.",
  "IN WITNESS WHEREOF",
].join("\n");

const DRAFT = {
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  jurisdiction: "Delaware",
} as ParsedDraftShape;

describe("paidProMutualConsultingQualityFloor (P0)", () => {
  it("flags collapsed lightweight non-AI mutual consulting corpus", () => {
    const before = assessPaidProMutualConsultingProfessionalStructure({
      text: THIN,
      rawIntake: NON_AI_INTAKE,
      draft: DRAFT,
    });
    expect(before.applies).toBe(true);
    expect(before.ok).toBe(false);
    expect(countNumberedAgreementSections(THIN)).toBeLessThanOrEqual(9);
  });

  it("does not expand thin corpus by default (inventing floors off)", () => {
    const floored = applyMutualConsultingProfessionalQualityFloor(THIN, DRAFT, NON_AI_INTAKE);
    expect(floored.repairs).toEqual([]);
    expect(floored.text).toBe(THIN.trim());
    expect(floored.text).not.toMatch(/LIMITATION OF LIABILITY/i);
  });

  it("legacy expand path still works when test opt-in enabled", () => {
    setUnauthorizedSemanticInsertsForTests(true);
    const floored = applyMutualConsultingProfessionalQualityFloor(THIN, DRAFT, NON_AI_INTAKE);
    expect(floored.repairs.length).toBeGreaterThan(0);
    const after = assessPaidProMutualConsultingProfessionalStructure({
      text: floored.text,
      rawIntake: NON_AI_INTAKE,
      draft: DRAFT,
    });
    expect(after.ok).toBe(true);
    expect(after.numberedSectionCount).toBeGreaterThanOrEqual(MUTUAL_CONSULTING_MIN_NUMBERED_SECTIONS);
    expect(after.topicsMissing).toEqual([]);
  });
});
