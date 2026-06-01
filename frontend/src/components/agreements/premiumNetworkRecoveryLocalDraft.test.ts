import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildPremiumNetworkRecoveryLocalProDraft } from "./premiumNetworkRecoveryLocalDraft";
import { assessPaidProMutualConsultingProfessionalStructure } from "./paidProMutualConsultingQualityFloor";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "qa/paidProHardening/fixtures");

const TEST209_INTAKE = readFileSync(
  join(FIXTURE_DIR, "freeProQaTemplateATest209.intake.txt"),
  "utf8",
).trim();

const DRAFT: ParsedDraftShape = {
  title: "Mutual Consulting Agreement",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  jurisdiction: "Delaware",
  purpose: "Mutual consulting and implementation services.",
  payment_terms: "$8,500 — 50% on start, 50% on completion.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: { amount: 8500, cadence: "milestone", valid: true },
  agreement_family: "services_agreement",
};

describe("premiumNetworkRecoveryLocalDraft", () => {
  it("test209 intake produces a usable mutual-consulting Pro draft with execution block", () => {
    const out = buildPremiumNetworkRecoveryLocalProDraft({
      draft: DRAFT,
      rawIntake: TEST209_INTAKE,
    });
    expect(out.ok).toBe(true);
    expect(out.body.length).toBeGreaterThanOrEqual(1500);
    const structure = assessPaidProMutualConsultingProfessionalStructure({
      text: out.body,
      rawIntake: TEST209_INTAKE,
      draft: DRAFT,
    });
    expect(structure.applies).toBe(true);
    expect(structure.ok).toBe(true);
    expect(countPaidProExecutionBlocks(out.body)).toBeGreaterThanOrEqual(1);
  });
});
