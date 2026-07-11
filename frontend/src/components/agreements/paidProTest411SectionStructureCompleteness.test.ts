/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import {
  analyzePaidProSectionStructureCompleteness,
  applyPaidProSectionStructureCompletenessAuthority,
  assertPaidProSectionStructureCompletenessForFreeze,
  collectPaidProSectionHierarchyMarkers,
  resetPaidProSectionStructureCompletenessLogsForTests,
} from "./paidProSectionStructureCompletenessAuthority";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
import { applyPaidProCanonicalDocumentStructureAuthority } from "./paidProCanonicalDocumentStructureAuthority";
import { validateAndRepairPremiumAgreementStructure } from "./premiumAgreementStructure";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
  test407Draft,
} from "./paidProTest407Fixtures";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { previewPostCheckoutRecoverySotCommit } from "./paidProPostCheckoutRecoveryAuthority";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";

const WITNESS = "IN WITNESS WHEREOF, the Parties execute this Agreement.";

function test407DraftShape() {
  return test407Draft();
}

/** Production-style hierarchy break: 5.7 then 6.2 with missing parent 6 and intermediate 6.1. */
function buildTest411ProductionHierarchyBreakCorpus(): string {
  return [
    "MUTUAL CONSULTING SERVICES AGREEMENT",
    "",
    "This Mutual Consulting Services Agreement is entered into by and among the Parties.",
    "",
    "1. Collaboration Framework and Services",
    "",
    "1.1 Shared Purpose.",
    "The Parties will collaborate in good faith.",
    "",
    "5. REPRESENTATIONS AND WARRANTIES",
    "",
    "5.7 Equitable Relief.",
    "Each Party acknowledges that breach may cause irreparable harm. Representations, Warranties and Service Conditions 6.1 Mutual Authority and Non-Conflict. Each party represents that it has authority to enter this Agreement.",
    "",
    "6.2 Service Warranty",
    "Each Party warrants that services will be performed in a professional manner consistent with industry standards.",
    "",
    "6.3 No Guarantee of Business Results",
    "No Party guarantees specific business outcomes.",
    "",
    "10. Notices",
    "Notices must be in writing and delivered as described below.",
    "",
    "11. Miscellaneous",
    "",
    "11.4 Counterparts and Electronic Signatures.",
    "The Parties may execute using electronic signatures.",
    "",
    WITNESS,
  ].join("\n\n");
}

function buildTest411TruncatedRecoveryCorpus(): string {
  const pad = Array.from({ length: 12 }, (_, i) =>
    [
      `${20 + i}. SUPPLEMENTAL CLAUSE ${i + 1}`,
      `Supplemental operative detail ${i + 1}. Each Party will continue cooperating in good faith on delivery milestones, analytics reporting, logistics integration, and change orders consistent with the intake and applicable law.`,
    ].join("\n\n"),
  ).join("\n\n");

  return [
    "MUTUAL SERVICES AGREEMENT",
    "",
    "This Mutual Services Agreement is entered into by and among Red Mesa Logistics LLC, Blue Canyon Analytics LLC, Harbor Peak Automation LLC, and Iron Vale Systems Inc.",
    "",
    "1. SERVICES",
    "Each Party may provide professional services, implementation support, analytics work, logistics coordination, and related deliverables to the other Parties as described in the intake and any written statements of work the Parties execute.",
    "",
    "6.2 Mid Agreement Clause",
    "Body text for orphaned subsection with professional services obligations and cooperation requirements.",
    "",
    "6.4 Another Mid Clause",
    "More body text describing payment timing, invoicing cadence, and reconciliation procedures among the Parties.",
    "",
    "6.8 Late Clause",
    "Even more body text describing confidentiality, data handling, and security obligations among the Parties.",
    "",
    "10. NOTICES",
    "Notices must be in writing and delivered to the primary business email and address of each Party.",
    "",
    pad,
    "",
    WITNESS,
  ].join("\n\n");
}

describe("TEST411 — Canonical Section Structure Completeness Authority", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    resetPaidProSectionStructureCompletenessLogsForTests();
  });

  it("A — detects production-style missing parent 6 and sequence gap 6.1 before 6.2", () => {
    const broken = buildTest411ProductionHierarchyBreakCorpus();
    const analysis = analyzePaidProSectionStructureCompleteness(broken);
    expect(analysis.missingParentSections).toContain(6);
    expect(analysis.missingIntermediateSections).not.toContain("6.1");
    expect(analysis.sequenceGaps.some((g) => g.parentMajor === 6 && g.missingSiblings.includes("6.1"))).toBe(
      true,
    );
    expect(analysis.brokenFamilies).toContain(6);
    expect(analysis.repairable).toBe(true);

    const markers = collectPaidProSectionHierarchyMarkers(broken);
    expect(markers.some((m) => m.line.startsWith("6.2"))).toBe(true);
    expect(markers.some((m) => m.kind === "top" && m.major === 6)).toBe(false);
  });

  it("B — repairs missing parent section before freeze when inferable title exists", () => {
    const broken = buildTest411ProductionHierarchyBreakCorpus();
    const repaired = applyPaidProSectionStructureCompletenessAuthority(broken, {
      source: "test411_repair",
      phase: "pre_freeze",
    });
    expect(repaired.repairs.some((r) => r.startsWith("insert_missing_parent:6"))).toBe(true);
    expect(repaired.repairs.some((r) => r.startsWith("insert_missing_intermediate:6.1"))).toBe(false);
    expect(repaired.rejected).toBe(false);
  });

  it("C — premium structure repair flags unresolved parent gaps and sequence gaps separately", () => {
    const broken = buildTest411ProductionHierarchyBreakCorpus();
    const structure = validateAndRepairPremiumAgreementStructure(broken, { surface: "test411" });
    expect(structure.ok).toBe(false);
    expect(structure.issues.some((i) => i.code === "missing_parent_sections")).toBe(true);
    expect(structure.issues.some((i) => i.code === "section_sequence_gaps")).toBe(true);
    expect(structure.issues.some((i) => i.code === "missing_intermediate_sections")).toBe(false);
  });

  it("D — truncated degraded recovery corpus is rejected for adoption", () => {
    const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
      draft: test407DraftShape(),
      rawIntake: TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    expect(fallback.ok).toBe(true);

    const truncated = fallback.body.replace(
      /^6\. LIMITATION OF LIABILITY\n\nExcept for breaches/m,
      [
        "6.2 Mid Agreement Clause",
        "Body text for orphaned subsection with professional services obligations and cooperation requirements.",
        "",
        "6.4 Another Mid Clause",
        "More body text describing payment timing, invoicing cadence, and reconciliation procedures among the Parties.",
        "",
        "6.8 Late Clause",
        "Even more body text describing confidentiality, data handling, and security obligations among the Parties.",
      ].join("\n"),
    );

    const analysis = analyzePaidProSectionStructureCompleteness(truncated);
    expect(analysis.truncatedFamilies).toContain(6);
    expect(analysis.fatal).toBe(true);

    const preview = previewPostCheckoutRecoverySotCommit({
      body: truncated,
      draft: test407DraftShape(),
      intakeText: TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible).toBe(false);
    expect(preview.blockReason).toMatch(/section_structure/);
  });

  it("E — hierarchy break with glued collapse is repaired by unified freeze candidate", () => {
    const broken = buildTest411ProductionHierarchyBreakCorpus();
    markPaidProPipelineValidationPassed({ text: broken, source: "server_full_draft" });

    const prepared = preparePaidProServerDocumentForAcceptance(
      broken,
      test407DraftShape(),
      TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
      { surface: "test411_freeze_pipeline" },
    );
    const canonical = applyPaidProCanonicalDocumentStructureAuthority(prepared.text, {
      source: "test411_canonical",
      phase: "pre_freeze",
    });
    expect(canonical.repairs.some((r) => r.includes("section_completeness"))).toBe(true);

    const freezeCandidate = buildPaidProFreezeCandidate({
      text: canonical.text,
      draft: test407DraftShape(),
      intakeText: TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
      source: "server_full_draft",
      surface: "test411_unified_freeze_candidate",
    });
    expect(freezeCandidate.ok).toBe(true);
  });

  it("F — deterministic fallback corpus remains structurally complete through acceptance", () => {
    const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
      draft: test407DraftShape(),
      rawIntake: TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    expect(fallback.ok).toBe(true);

    const accepted = applyAcceptedProCorpusSafeDisplay(fallback.body, {
      draft: test407DraftShape(),
      intakeText: TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
      surface: "test411_deterministic_fallback",
    });
    const analysis = analyzePaidProSectionStructureCompleteness(accepted.text);
    expect(analysis.missingParentSections).toEqual([]);
    expect(analysis.missingIntermediateSections).toEqual([]);
  });

  it("G — fatally incomplete corpus cannot become frozen SoT", () => {
    const truncated = buildTest411TruncatedRecoveryCorpus();
    expect(() =>
      assertPaidProSectionStructureCompletenessForFreeze(truncated, "test411_fatal"),
    ).toThrow(/paid-pro-sot-freeze-blocked|paid-pro-section-structure-completeness-blocked/);

    expect(() =>
      establishPaidProSourceOfTruth({
        text: truncated,
        source: "server_full_draft",
        draft: test407DraftShape(),
        intakeText: TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
      }),
    ).toThrow(/section_structure|professional-pro-clause-coverage-blocked/);
  });
});
