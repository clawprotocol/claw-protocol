/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  analyzePaidProSectionStructureCompleteness,
  applyPaidProSectionStructureCompletenessAuthority,
  collectPaidProSectionHierarchyMarkers,
  resetPaidProSectionStructureCompletenessLogsForTests,
} from "./paidProSectionStructureCompletenessAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

const WITNESS = "IN WITNESS WHEREOF, the Parties execute this Agreement.";

function buildTest336StyleFlattenedCorpus(): string {
  const operative = [
    "SERVICES AGREEMENT",
    "Between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
    "1. Services",
    "1.1 Scope of Services. Professional services.",
    "2. Payment. $48,000 monthly.",
    "8. Electronic Signatures. Counterparts permitted.",
    "11.6 Survival. Certain obligations survive termination.",
    "11.7 Governing Law and Venue. Oklahoma law governs.",
    "11.8 Counterparts and Electronic Signatures. E-sign permitted.",
  ].join(" ");
  const lawdogWitness = [
    WITNESS,
    "PARTY: Red Mesa Logistics LLC",
    "By: __________________________",
    "PARTY: Harbor Peak Automation LLC",
    "By: __________________________",
  ].join("\n");
  return `${operative}\n\n${lawdogWitness}`;
}

const TEST336_INTAKE = [
  "Create a services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
  "Harbor Peak Automation LLC will provide AI workflow consulting.",
  "12 months. Fixed fee of $48,000 paid monthly. Oklahoma law.",
].join(" ");

function test336Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: "AI workflow consulting.",
    payment_terms: "Fixed fee of $48,000 paid monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48000, cadence: "monthly", valid: true },
  };
}

describe("TEST585 — section parent and intermediate authority at freeze", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    resetPaidProSectionStructureCompletenessLogsForTests();
  });

  it("A — explicit parent with later-numbered children: 11.6–11.8 attach to §11 without 11.1 ancestor", () => {
    const body = [
      "SERVICES AGREEMENT",
      "",
      "1. Services. Scope.",
      "",
      "11. DATA SECURITY",
      "",
      "11.6 Incident Response. Each party will respond promptly.",
      "11.7 Notification. Written notice required.",
      "11.8 Remediation. Cure within thirty days.",
      "",
      WITNESS,
    ].join("\n");
    const analysis = analyzePaidProSectionStructureCompleteness(body);
    expect(analysis.missingParentSections).toEqual([]);
    expect(analysis.missingIntermediateSections).not.toContain("11.1");
    expect(analysis.sequenceGaps.some((g) => g.parentMajor === 11 && g.missingSiblings.includes("11.1"))).toBe(
      true,
    );
    const repaired = applyPaidProSectionStructureCompletenessAuthority(body, { source: "test585_a" });
    expect(repaired.rejected).toBe(false);
  });

  it("B — explicit parent with contiguous children is valid", () => {
    const body = [
      "AGREEMENT",
      "",
      "11. DATA SECURITY",
      "",
      "11.1 Safeguards. Technical controls required.",
      "11.2 Incident Response. Notify within 24 hours.",
      "",
      WITNESS,
    ].join("\n");
    const analysis = analyzePaidProSectionStructureCompleteness(body);
    expect(analysis.missingParentSections).toEqual([]);
    expect(analysis.missingIntermediateSections).toEqual([]);
    expect(analysis.sequenceGaps).toEqual([]);
    expect(applyPaidProSectionStructureCompletenessAuthority(body, { source: "test585_b" }).rejected).toBe(
      false,
    );
  });

  it("C — flattened parent recovered when missing §11 but consecutive 11.6–11.8 children exist", () => {
    const body = [
      "SERVICES AGREEMENT",
      "",
      "1. Services. Scope.",
      "11.6 Survival. Certain obligations survive termination.",
      "11.7 Governing Law and Venue. Oklahoma law governs.",
      "11.8 Counterparts and Electronic Signatures. E-sign permitted.",
      "",
      WITNESS,
    ].join("\n");
    const analysis = analyzePaidProSectionStructureCompleteness(body);
    expect(analysis.missingParentSections).toContain(11);
    expect(analysis.missingIntermediateSections).not.toContain("11.1");
    expect(analysis.truncatedFamilies).not.toContain(11);
    const repaired = applyPaidProSectionStructureCompletenessAuthority(body, { source: "test585_c" });
    expect(repaired.repairs.some((r) => r.startsWith("insert_missing_parent:11"))).toBe(true);
    expect(repaired.rejected).toBe(false);
    expect(repaired.text).toMatch(/^11\.\s+/m);
  });

  it("D — genuine orphan child without parent evidence remains blocked", () => {
    const body = [
      "AGREEMENT",
      "",
      "1. Scope. Services only.",
      "11.6 Incident Response. No parent section exists.",
      "",
      WITNESS,
    ].join("\n");
    const repaired = applyPaidProSectionStructureCompletenessAuthority(body, { source: "test585_d" });
    expect(repaired.rejected).toBe(true);
    expect(repaired.diagnostics.truncatedFamilies).toContain(11);
  });

  it("E — 11.1 is not reported as ancestor of 11.6 when §11 exists", () => {
    const body = [
      "AGREEMENT",
      "",
      "11. MISCELLANEOUS",
      "",
      "11.6 Survival. Obligations survive.",
      "",
      WITNESS,
    ].join("\n");
    const analysis = analyzePaidProSectionStructureCompleteness(body);
    expect(analysis.missingIntermediateSections).not.toContain("11.1");
    expect(analysis.sequenceGaps.some((g) => g.missingSiblings.includes("11.1"))).toBe(true);
  });

  it("F — decimal child hierarchy: 11.6 parent of 11.6.1", () => {
    const body = [
      "AGREEMENT",
      "",
      "11. GENERAL",
      "",
      "11.6 Data Security. Controls required.",
      "11.6.1 Encryption. AES-256 at rest.",
      "",
      WITNESS,
    ].join("\n");
    const markers = collectPaidProSectionHierarchyMarkers(body);
    expect(markers.some((m) => m.line.startsWith("11.6.1"))).toBe(true);
    const analysis = analyzePaidProSectionStructureCompleteness(body);
    expect(analysis.missingIntermediateSections).not.toContain("11.6");
    expect(analysis.missingParentSections).toEqual([]);
  });

  it("G — bare numeric marker 11. without title is not a meaningful parent", () => {
    const body = ["AGREEMENT", "", "11.", "11.6 Survival. Text.", "", WITNESS].join("\n");
    const analysis = analyzePaidProSectionStructureCompleteness(body);
    expect(analysis.missingParentSections).toContain(11);
  });

  it("I — missing sibling sequence is sequence gap, not missing ancestor", () => {
    const body = [
      "AGREEMENT",
      "",
      "11. GENERAL",
      "",
      "11.1 First.",
      "11.3 Third.",
      "",
      WITNESS,
    ].join("\n");
    const analysis = analyzePaidProSectionStructureCompleteness(body);
    expect(analysis.missingIntermediateSections).not.toContain("11.2");
    expect(
      analysis.sequenceGaps.some((g) => g.parentMajor === 11 && g.missingSiblings.includes("11.2")),
    ).toBe(true);
  });

  it("J — orphan repair idempotence: second pass does not duplicate parent", () => {
    const body = [
      "AGREEMENT",
      "",
      "11.6 Survival. Text.",
      "11.7 Governing Law. Oklahoma.",
      "",
      WITNESS,
    ].join("\n");
    const first = applyPaidProSectionStructureCompletenessAuthority(body, { source: "test585_j1" });
    const second = applyPaidProSectionStructureCompletenessAuthority(first.text, { source: "test585_j2" });
    expect(second.repairs.filter((r) => r.startsWith("insert_missing_parent:"))).toHaveLength(0);
    expect((first.text.match(/^11\.\s+/gm) ?? []).length).toBe(1);
    expect((second.text.match(/^11\.\s+/gm) ?? []).length).toBe(1);
  });

  it("L — TEST336-style flattened corpus establishes SoT after parent §11 repair", () => {
    const raw = buildTest336StyleFlattenedCorpus();
    const prep = preparePaidProServerDocumentForAcceptance(raw, test336Draft(), TEST336_INTAKE, {
      surface: "test585_l",
    });
    const structure = applyPaidProSectionStructureCompletenessAuthority(prep.text, {
      source: "test585_l_structure",
      phase: "pre_freeze",
    });
    expect(structure.rejected).toBe(false);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft" });
    expect(() =>
      establishPaidProSourceOfTruth({
        text: prep.text,
        draft: test336Draft(),
        intakeText: TEST336_INTAKE,
        source: "server_full_draft",
      }),
    ).not.toThrow();
  });
});
