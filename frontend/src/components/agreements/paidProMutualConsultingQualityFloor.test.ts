import { describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  assessPaidProMutualConsultingProfessionalStructure,
  applyMutualConsultingProfessionalQualityFloor,
  countNumberedAgreementSections,
  MUTUAL_CONSULTING_MIN_NUMBERED_SECTIONS,
} from "./paidProMutualConsultingQualityFloor";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(
  import.meta.dirname,
  "qa/paidProHardening/fixtures",
);

const INTAKE = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest207.intake.txt"), "utf8");
const THIN = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest207Thin.txt"), "utf8");
const DRAFT = {
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  jurisdiction: "Delaware",
} as ParsedDraftShape;

describe("paidProMutualConsultingQualityFloor (test207)", () => {
  it("flags collapsed lightweight Template A corpus (≤9 numbered sections)", () => {
    const before = assessPaidProMutualConsultingProfessionalStructure({
      text: THIN,
      rawIntake: INTAKE,
      draft: DRAFT,
    });
    expect(before.applies).toBe(true);
    expect(before.ok).toBe(false);
    expect(before.topicsMissing.length).toBeGreaterThanOrEqual(2);
    expect(countNumberedAgreementSections(THIN)).toBeLessThanOrEqual(11);
  });

  it("expands thin mutual consulting corpus to professional multi-section structure", () => {
    const floored = applyMutualConsultingProfessionalQualityFloor(THIN, DRAFT, INTAKE);
    expect(floored.repairs.length).toBeGreaterThan(0);
    const after = assessPaidProMutualConsultingProfessionalStructure({
      text: floored.text,
      rawIntake: INTAKE,
      draft: DRAFT,
    });
    expect(after.ok).toBe(true);
    expect(after.numberedSectionCount).toBeGreaterThanOrEqual(MUTUAL_CONSULTING_MIN_NUMBERED_SECTIONS);
    expect(after.topicsMissing).toEqual([]);
  });

  it("acceptance safe-display + prepare path yields full Pro structure for test207 intake", () => {
    const prepared = preparePaidProServerDocumentForAcceptance(THIN, DRAFT, INTAKE);
    const safe = applyAcceptedProCorpusSafeDisplay(prepared.text, {
      draft: DRAFT,
      intakeText: INTAKE,
    });
    const structure = assessPaidProMutualConsultingProfessionalStructure({
      text: safe.text,
      rawIntake: INTAKE,
      draft: DRAFT,
    });
    expect(structure.ok).toBe(true);
    expect(safe.text.length).toBeGreaterThan(THIN.length + 400);
  });
});
