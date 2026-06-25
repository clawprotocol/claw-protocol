/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { buildPaidProStructuralRecoveryBody } from "./paidProStructuralRecovery";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  buildPaidProFreezeCandidate,
} from "./paidProFreezeCandidate";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { latchAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import { guardPaidProAcceptedServerFullDraftCommit } from "./paidProAcceptedServerFullDraftCommitGuard";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  applyPaidProSectionHeadingTitleAuthority,
  detectPaidProSectionHeadingTitleAnomalies,
  formatPaidProSectionHeadingTitleAnomalyDetails,
} from "./paidProSectionHeadingTitleAuthority";
import {
  applyPaidProSectionStructureCompletenessAuthority,
  evaluatePaidProSectionStructureFreezeGate,
} from "./paidProSectionStructureCompletenessAuthority";
import {
  buildTest433LiveFourPartyServerCorpus,
  TEST433_MIN_ACCEPTED_LEN,
  TEST433_TARGET_SERVER_LEN,
  test433FourPartyDraft,
} from "./paidProTest433FourPartyLiveFreezeFixtures";
import {
  BLUE_CANYON,
  DELTA_INTEGRATION,
  NORTH_STAR,
  SUMMIT_RIDGE,
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
} from "./paidProTest429FourPartyNorthStarFixtures";
import { buildPaidProAcceptancePipelineTracePayload } from "./paidProAcceptancePipelineTrace";

const ALL_PARTIES = [NORTH_STAR, SUMMIT_RIDGE, DELTA_INTEGRATION, BLUE_CANYON];

describe("TEST433 — four-party live freeze heading anomaly + recovery guard", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  it("raw server corpus exposes heading anomalies with actionable trace fields", () => {
    const raw = buildTest433LiveFourPartyServerCorpus();
    expect(raw.length).toBeGreaterThan(TEST433_TARGET_SERVER_LEN - 500);
    const anomalies = detectPaidProSectionHeadingTitleAnomalies(raw);
    expect(anomalies.length).toBeGreaterThan(0);
    const details = formatPaidProSectionHeadingTitleAnomalyDetails(raw, anomalies);
    expect(details[0]?.line.length).toBeGreaterThan(2);
    expect(details.some((d) => d.canonicalTitleMatchDecision !== "none")).toBe(true);
    const trace = buildPaidProAcceptancePipelineTracePayload({
      stage: "raw_server_full_draft_received",
      source: "server_full_draft",
      text: raw,
      rawIntake: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test433FourPartyDraft(),
    });
    expect(trace.headingAnomalyCount).toBeGreaterThan(0);
    expect(trace.headingAnomalyDetails[0]?.sectionNumber).toBeTruthy();
  });

  it("structure authority repairs anomalies — substantive server freeze passes", () => {
    const raw = buildTest433LiveFourPartyServerCorpus();
    latchAcceptedServerFullDraftAuthority(raw, "server_full_draft");

    const headingOnly = applyPaidProSectionHeadingTitleAuthority(raw);
    const gateHeadingOnly = evaluatePaidProSectionStructureFreezeGate(
      headingOnly.text,
      "test433_heading_only",
    );
    if (!gateHeadingOnly.ok) {
      expect(gateHeadingOnly.rejectReason).toBe("section_heading_title_anomaly");
    }

    const structure = applyPaidProSectionStructureCompletenessAuthority(headingOnly.text, {
      source: "test433_structure",
      phase: "pre_freeze",
      blockOnFatal: false,
    });
    expect(structure.rejected).toBe(false);
    expect(detectPaidProSectionHeadingTitleAnomalies(structure.text).length).toBe(0);

    const prepared = preparePaidProServerDocumentForAcceptance(
      raw,
      test433FourPartyDraft(),
      TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      { surface: "test433_prepare" },
    );
    const freeze = buildPaidProFreezeCandidate({
      text: prepared.text,
      draft: test433FourPartyDraft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test433_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
    expect(freeze.rejectReason).not.toBe("section_heading_title_anomaly");
    expect(freeze.text.length).toBeGreaterThan(TEST433_MIN_ACCEPTED_LEN);
    expect(countOperativeIfToNoticeStanzas(freeze.text)).toBe(4);
    expect(countPaidProExecutionBlocks(freeze.text)).toBe(1);
    for (const party of ALL_PARTIES) {
      expect(freeze.text).toContain(party);
    }
    expect(freeze.text).not.toMatch(/Agreement\.12\./);
    expect(freeze.text).not.toMatch(/venue\.12\.2/);
    expect(freeze.text).not.toMatch(/with its principal place of business at Background:/i);
  });

  it("structural recovery stays tiny and cannot masquerade as server_full_draft", () => {
    const raw = buildTest433LiveFourPartyServerCorpus();
    latchAcceptedServerFullDraftAuthority(raw, "server_full_draft");

    const structural = buildPaidProStructuralRecoveryBody({
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test433FourPartyDraft(),
    });
    expect(structural.ok).toBe(true);
    expect(structural.body.length).toBeLessThan(TEST433_MIN_ACCEPTED_LEN);

    const structuralFreeze = buildPaidProFreezeCandidate({
      text: structural.body,
      source: "structural_recovery",
      draft: test433FourPartyDraft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      surface: "test433_structural_only",
    });
    expect(structuralFreeze.ok).toBe(true);
    expect(structuralFreeze.text.length).toBeLessThan(8000);

    const mislabeledGuard = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: structuralFreeze.text,
      candidateSource: "server_full_draft",
      renderSource: "server_full_draft",
      generationOutcome: "ok",
      reason: "test433_mislabeled",
    });
    expect(mislabeledGuard.rejected).toBe(true);
    expect(mislabeledGuard.reason).toBe("mislabeled_server_full_draft_below_substantive_min");
  });
});
