/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import {
  buildPaidProFreezeCandidate,
  preparePaidProFreezeCandidateText,
  previewRecoverPaidProFreezeCandidate,
} from "./paidProFreezeCandidate";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { latchAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  buildTest429MalformedFourPartyServerCorpus,
  BLUE_CANYON,
  DELTA_INTEGRATION,
  NORTH_STAR,
  SUMMIT_RIDGE,
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
  test429Draft,
} from "./paidProTest429FourPartyNorthStarFixtures";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  detectPaidProSectionHeadingTitleAnomalies,
  formatPaidProSectionHeadingTitleAnomalyDetails,
} from "./paidProSectionHeadingTitleAuthority";
import {
  applyPaidProSectionStructureCompletenessAuthority,
  resetPaidProSectionStructureCompletenessLogsForTests,
} from "./paidProSectionStructureCompletenessAuthority";
import { assertPaidProDocumentBoundaryAuthorityForFreeze } from "./paidProDocumentBoundaryAuthority";
import { establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { validateProMinimumSubstance } from "./paidProConciseServicesQuality";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";

const ALL_PARTIES = [NORTH_STAR, SUMMIT_RIDGE, DELTA_INTEGRATION, BLUE_CANYON];
const MIN_SUBSTANTIVE_LEN = 15_000;

function test431FourPartyDraft(): ParsedDraftShape {
  return {
    ...test429Draft(),
    purpose: "Manufacturing workflow modernization and ERP analytics.",
    parties: [
      { name: NORTH_STAR, role: "Client" } as never,
      { name: SUMMIT_RIDGE, role: "Lead Consultant" } as never,
      { name: DELTA_INTEGRATION, role: "Technology Integrator" } as never,
      { name: BLUE_CANYON, role: "Data Analytics Provider" } as never,
    ],
  };
}

describe("TEST431 — four-party heading anomaly repair and substantive freeze", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    resetPaidProSectionStructureCompletenessLogsForTests();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  it("logs actionable heading anomaly details for split revenue allocation fragments", () => {
    const server = buildTest429MalformedFourPartyServerCorpus();
    const prep = preparePaidProFreezeCandidateText({
      text: server,
      draft: test429Draft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test431_prep",
    });
    const boundary = assertPaidProDocumentBoundaryAuthorityForFreeze(prep.text, {
      draft: test429Draft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      surface: "test431_boundary",
      parties: prep.reviewParties,
      draftPartyCount: 2,
      handoffPartySlots: 4,
    });
    const beforeRepair = detectPaidProSectionHeadingTitleAnomalies(boundary);
    expect(beforeRepair.length).toBeGreaterThan(0);
    const details = formatPaidProSectionHeadingTitleAnomalyDetails(boundary, beforeRepair);
    expect(details.some((d) => d.line.includes("Revenue") || d.line.includes("Service Providers"))).toBe(
      true,
    );
    expect(details.length).toBeGreaterThan(0);
    expect(details[0]?.line.length).toBeGreaterThan(2);

    const repaired = applyPaidProSectionStructureCompletenessAuthority(boundary, {
      source: "test431_structure",
      phase: "pre_freeze",
      blockOnFatal: false,
      log: false,
    });
    expect(repaired.rejected).toBe(false);
    expect(detectPaidProSectionHeadingTitleAnomalies(repaired.text).length).toBe(0);
  });

  it("freezes substantive wire server_full_draft without prepare skip regression", () => {
    const server = padOperativeCorpusBeforeWitness(
      buildTest429MalformedFourPartyServerCorpus(),
      23_000,
    );
    expect(server.length).toBeGreaterThan(MIN_SUBSTANTIVE_LEN - 2000);

    latchAcceptedServerFullDraftAuthority(server, "server_full_draft");

    const freeze = buildPaidProFreezeCandidate({
      text: server,
      draft: test429Draft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test431_wire_freeze",
    });

    expect(freeze.ok, freeze.rejectReason ?? "freeze failed").toBe(true);
    expect(freeze.rejectReason).not.toBe("section_heading_title_anomaly");
    expect(freeze.text.length).toBeGreaterThan(MIN_SUBSTANTIVE_LEN - 3000);
    expect(countOperativeIfToNoticeStanzas(freeze.text)).toBe(4);
    expect(countPaidProExecutionBlocks(freeze.text)).toBe(1);
    for (const party of ALL_PARTIES) {
      expect(freeze.text).toContain(party);
    }
  });

  it("validatePaidProOutput accepts substantive server_full_draft without recovery shrink", () => {
    const server = padOperativeCorpusBeforeWitness(
      buildTest429MalformedFourPartyServerCorpus(),
      20_000,
    );
    latchAcceptedServerFullDraftAuthority(server, "server_full_draft");

    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test429Draft(),
      TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      { surface: "test431_validate_prepare" },
    );

    const freeze = buildPaidProFreezeCandidate({
      text: prepared.text,
      draft: test429Draft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test431_validate_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze failed").toBe(true);

    const validation = validatePaidProOutput({
      text: prepared.text,
      rawIntake: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test429Draft(),
      premiumPipelineSource: "server_full_draft",
    });

    expect(validation.reasons).not.toContain("deterministic_recovery_freeze_candidate_ok");
    expect(validation.reasons).not.toContain("substantive_server_draft_recovery_blocked");
    expect(validation.reasons).not.toContain("section_heading_title_anomaly");

    const recovery = previewRecoverPaidProFreezeCandidate({
      draft: test429Draft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      surface: "test431_recovery_guard",
    });
    expect(recovery.ok).toBe(true);
    expect(recovery.text.length).toBeLessThan(prepared.text.length - 3000);
    expect(freeze.text.length).toBeGreaterThan(MIN_SUBSTANTIVE_LEN - 3000);
  });

  it("establishPaidProSourceOfTruth does not throw minimum-substance with empty missingSections", () => {
    const server = padOperativeCorpusBeforeWitness(
      buildTest429MalformedFourPartyServerCorpus(),
      20_000,
    );
    const draftWithWorkflowFacts = test431FourPartyDraft();
    latchAcceptedServerFullDraftAuthority(server, "server_full_draft");

    expect(() =>
      establishPaidProSourceOfTruth({
        text: server,
        source: "server_full_draft",
        draft: draftWithWorkflowFacts,
        intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      }),
    ).not.toThrow(/\[pro-minimum-substance-blocked\]/);

    for (const party of ALL_PARTIES) {
      expect(server).toContain(party);
    }
  });

  it("does not mask substantive server with minimum-substance missingSections=unknown", () => {
    const server = padOperativeCorpusBeforeWitness(
      buildTest429MalformedFourPartyServerCorpus(),
      20_000,
    );
    const draftWithWorkflowFacts = test431FourPartyDraft();
    expect(server.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);

    latchAcceptedServerFullDraftAuthority(server, "server_full_draft");

    const prep = preparePaidProFreezeCandidateText({
      text: server,
      draft: draftWithWorkflowFacts,
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test431_ms_prep",
    });
    const minimumSubstanceOnPrep = validateProMinimumSubstance({
      text: prep.text,
      rawIntake: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: draftWithWorkflowFacts,
      source: "server_full_draft",
    });

    const validation = validatePaidProOutput({
      text: server,
      rawIntake: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: draftWithWorkflowFacts,
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.reasons).not.toContain("minimum_substance_failed");
    expect(validation.reasons).not.toContain("section_heading_title_anomaly");

    if (
      minimumSubstanceOnPrep.applies &&
      !minimumSubstanceOnPrep.ok &&
      minimumSubstanceOnPrep.missingSections.length === 0
    ) {
      expect(server.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    }

    const sot = establishPaidProSourceOfTruth({
      text: server,
      source: "server_full_draft",
      draft: draftWithWorkflowFacts,
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
    });
    expect(sot.source).toBe("server_full_draft");
    expect(sot.text.length).toBeGreaterThan(MIN_SUBSTANTIVE_LEN);
  });
});
