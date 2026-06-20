import { afterEach, describe, expect, it } from "vitest";
import { applyDocumentQualityFloor } from "./documentQualityFloor";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { guardPaidProReviewRenderCorpus } from "./paidProReviewRenderCorpus";
import {
  analyzeSectionStructureIntegrity,
  applySectionStructureIntegrity,
  repairSectionStructureIntegrity,
  resetSectionStructureIntegrityLogsForTests,
} from "./sectionStructureAuthority";
import { TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE } from "./starterTest379FourPartyLogisticsRegression.test";
import { TEST380_TWO_PARTY_CONSULTING_INTAKE } from "./starterTest380TwoPartyConsultingRegression.test";
import { TEST381_SHORT_NAME_CONSULTING_INTAKE } from "./starterTest381QualityRegression.test";
import { TEST382_ROLE_ALIAS_PRO_INTAKE } from "./starterTest382ReadonlySignerCountRegression.test";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { normalizePaidProOrphanSubsections } from "./normalizePaidProOrphanSubsections";

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false };

function parseStarterDraft(intake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(
    {
      title: "",
      jurisdiction: "",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    },
    intake,
    true,
    defaultIntakePartyRoleLabels(),
  );
}

describe("sectionStructureIntegrity", () => {
  afterEach(() => {
    resetSectionStructureIntegrityLogsForTests();
  });

  it("Case A — Test383 orphan numbering restart after subsection prose is detected and repaired", () => {
    const input = [
      "1.5 Out-of-Scope Work and Changes.",
      "This Agreement covers the services and deliverables expressly described in this Section.",
      "1. Any material expansion of scope must be agreed in writing.",
      "2. Timeline changes require mutual approval.",
    ].join("\n\n");

    const analysis = analyzeSectionStructureIntegrity(input);
    expect(analysis.diagnostics.some((d) => d.code === "orphan_numbering_restart")).toBe(true);

    const repaired = repairSectionStructureIntegrity(input);
    expect(repaired.repaired).toBe(true);
    expect(repaired.text).toContain("Any material expansion of scope must be agreed in writing.");
    expect(repaired.text).not.toMatch(/^1\.\s+Any material expansion/m);
    expect(repaired.text).toContain("This Agreement covers the services");
  });

  it("Case B — mixed subsection styles under the same section are detected", () => {
    const input = ["2.4 Deliverables", "(a) First deliverable", "1. Second deliverable"].join("\n\n");
    const analysis = analyzeSectionStructureIntegrity(input);
    expect(analysis.diagnostics.some((d) => d.code === "mixed_subsection_scheme")).toBe(true);
  });

  it("Case C — duplicate top-level section identifiers are detected", () => {
    const input = ["4. Liability", "4. Confidentiality", "5. Termination"].join("\n\n");
    const analysis = analyzeSectionStructureIntegrity(input);
    expect(analysis.diagnostics.some((d) => d.code === "duplicate_section_identifier")).toBe(true);
  });

  it("Case D — skipped top-level section identifiers are detected", () => {
    const input = ["4. Liability", "6. Confidentiality"].join("\n\n");
    const analysis = analyzeSectionStructureIntegrity(input);
    expect(analysis.diagnostics.some((d) => d.code === "skipped_section_identifier")).toBe(true);
  });

  it("Case E — heading collapse is detected and heading separation is restored", () => {
    const input = "3. Fees and Payment 3.1 Monthly Fee";
    const analysis = analyzeSectionStructureIntegrity(input);
    expect(analysis.diagnostics.some((d) => d.code === "heading_body_collapse")).toBe(true);

    const repaired = repairSectionStructureIntegrity(input);
    expect(repaired.repaired).toBe(true);
    expect(repaired.text).toMatch(/^3\.\s+Fees and Payment/m);
    expect(repaired.text).toMatch(/^3\.1\s+Monthly Fee/m);
  });

  it("Case F — execution block is never treated as numbered hierarchy content", () => {
    const input = [
      "9. Miscellaneous",
      "9.1 Entire agreement.",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "CLIENT:",
      "Acme LLC",
      "By: __________________________",
    ].join("\n\n");

    const analysis = analyzeSectionStructureIntegrity(input);
    expect(analysis.diagnostics.some((d) => d.code === "execution_block_hierarchy_contamination")).toBe(
      false,
    );
    expect(analysis.diagnostics.filter((d) => d.lineIndex != null && d.lineIndex >= 2)).toHaveLength(0);
  });

  it("Case G — valid lettered list under decimal subsection is not a false positive", () => {
    const input = [
      "1.5 Scope Changes",
      "(a) Additional work",
      "(b) Timeline changes",
    ].join("\n\n");
    const analysis = analyzeSectionStructureIntegrity(input);
    expect(analysis.anomalyCount).toBe(0);
  });

  it("Case H — valid numeric list immediately under decimal subsection is not a false positive", () => {
    const input = [
      "1.5 Scope Changes",
      "1. Additional work",
      "2. Additional deliverables",
    ].join("\n\n");
    const analysis = analyzeSectionStructureIntegrity(input);
    expect(analysis.anomalyCount).toBe(0);
  });

  it("Case I — Test379/380/381/382 starter previews remain structurally sound", () => {
    const intakes = [
      TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE,
      TEST380_TWO_PARTY_CONSULTING_INTAKE,
      TEST381_SHORT_NAME_CONSULTING_INTAKE,
      TEST382_ROLE_ALIAS_PRO_INTAKE,
    ];

    for (const intake of intakes) {
      const draft = parseStarterDraft(intake);
      const preview = buildAgreementPreviewText(draft, { starterPreview: true, intakeText: intake });
      const floored = applyDocumentQualityFloor(preview);
      const analysis = analyzeSectionStructureIntegrity(floored.text);
      const orphanRestarts = analysis.diagnostics.filter((d) => d.code === "orphan_numbering_restart");
      const mixedSchemes = analysis.diagnostics.filter((d) => d.code === "mixed_subsection_scheme");
      expect(orphanRestarts, intake.slice(0, 40)).toHaveLength(0);
      expect(mixedSchemes, intake.slice(0, 40)).toHaveLength(0);
    }
  });

  it("display pipeline applies section structure integrity without content loss for Test383 pattern", () => {
    const corpus = [
      "1. Services",
      "1.5 Out-of-Scope Work and Changes.",
      "This Agreement covers the services and deliverables expressly described in this Section.",
      "1. Any material expansion of scope must be agreed in writing.",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "CLIENT:",
      "Acme LLC",
    ].join("\n\n");

    const guarded = guardPaidProReviewRenderCorpus(corpus);
    const prepared = preparePaidProReviewDisplayPlain(guarded.text);
    const integrity = applySectionStructureIntegrity(prepared.text, { source: "test383_pipeline" });

    expect(integrity.text).toContain("Any material expansion of scope must be agreed in writing.");
    expect(integrity.text).not.toMatch(/^1\.\s+Any material expansion/m);
    expect(integrity.diagnostics.some((d) => d.code === "orphan_numbering_restart")).toBe(false);
  });

  it("orphan subsection normalizer and section structure authority compose without conflict", () => {
    const input = [
      "7. Governing Law",
      "7.1 This Agreement shall be governed by Delaware law.",
      "1.5 Out-of-Scope Work and Changes.",
      "This Agreement covers the services and deliverables expressly described in this Section.",
      "1. Any material expansion of scope must be agreed in writing.",
    ].join("\n\n");

    const orphanNorm = normalizePaidProOrphanSubsections(input, { source: "compose_test" });
    const integrity = applySectionStructureIntegrity(orphanNorm.text, { source: "compose_test" });
    expect(integrity.text).toContain("governed by Delaware law");
    expect(integrity.text).not.toMatch(/^7\.1\s/m);
    expect(integrity.text).not.toMatch(/^1\.\s+Any material expansion/m);
  });
});
