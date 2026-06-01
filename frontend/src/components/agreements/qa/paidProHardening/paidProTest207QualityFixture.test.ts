import { afterEach, describe, expect, it } from "vitest";
import {
  assessPaidProMutualConsultingProfessionalStructure,
  MUTUAL_CONSULTING_MIN_NUMBERED_SECTIONS,
} from "../../paidProMutualConsultingQualityFloor";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "../../paidProSourceOfTruth";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "./paidProHardeningFixtures";

const FIXTURE = "freeProQaTemplateATest207";

describe("paidProHardening test207 quality fixture", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("golden test207 corpus meets mutual consulting professional structure floor", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const accepted = getPaidProSourceOfTruthText();
    const structure = assessPaidProMutualConsultingProfessionalStructure({
      text: accepted,
      rawIntake: fixture.intakeText,
      draft: fixture.draft,
    });
    expect(structure.applies).toBe(true);
    expect(structure.ok).toBe(true);
    expect(structure.numberedSectionCount).toBeGreaterThanOrEqual(
      MUTUAL_CONSULTING_MIN_NUMBERED_SECTIONS,
    );
    expect(structure.topicsMissing).toEqual([]);
    expect(accepted).toMatch(/SCOPE OF SERVICES|CONFIDENTIALITY|LIMITATION OF LIABILITY/i);
    expect(accepted).toMatch(/IN WITNESS WHEREOF/i);
  });

  it("establishing SoT from test207 does not collapse to lightweight draft", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const safe = establishPaidProSourceOfTruth({
      text: fixture.rawCorpus,
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    expect(safe.text.length).toBeGreaterThan(2800);
    const structure = assessPaidProMutualConsultingProfessionalStructure({
      text: safe.text,
      rawIntake: fixture.intakeText,
      draft: fixture.draft,
    });
    expect(structure.collapsedLightweight).toBe(false);
    expect(structure.ok).toBe(true);
  });
});
