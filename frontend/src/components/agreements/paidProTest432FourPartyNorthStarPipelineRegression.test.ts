/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { validateProMinimumSubstance } from "./paidProConciseServicesQuality";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { establishPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "./paidProSourceOfTruth";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  BLUE_CANYON,
  DELTA_INTEGRATION,
  NORTH_STAR,
  SUMMIT_RIDGE,
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
} from "./paidProTest429FourPartyNorthStarFixtures";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { detectPaidProSectionHeadingTitleAnomalies } from "./paidProSectionHeadingTitleAuthority";
import {
  buildPaidProAcceptancePipelineTracePayload,
  tracePaidProAcceptancePipelineStage,
} from "./paidProAcceptancePipelineTrace";
import {
  buildTest432FourPartyShrunkDocumentWithoutEsignClauses,
  buildTest432FourPartyShrunkDocumentText,
  buildTest432FourPartyWireServerCorpus,
  test432FourPartyStructuredDraft,
} from "./paidProTest432FourPartyNorthStarPipelineFixtures";

const ALL_PARTIES = [NORTH_STAR, SUMMIT_RIDGE, DELTA_INTEGRATION, BLUE_CANYON];
const MIN_SUBSTANTIVE_LEN = 18_000;

describe("TEST432 — four-party North Star live pipeline shrink regression", () => {
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

  it("fixture wire is substantive with split headings; shrunk doc stays above 85% wire", () => {
    const wire = buildTest432FourPartyWireServerCorpus();
    const doc = buildTest432FourPartyShrunkDocumentText();
    expect(wire.length).toBeGreaterThan(MIN_SUBSTANTIVE_LEN);
    expect(detectPaidProSectionHeadingTitleAnomalies(wire).length).toBeGreaterThan(0);
    expect(doc.length).toBeGreaterThan(Math.floor(wire.length * 0.85));
    expect(doc.length).toBeLessThan(wire.length);
  });

  it("minimum substance accepts witness execution block when operative esign clauses were stripped", () => {
    const shrunk = buildTest432FourPartyShrunkDocumentWithoutEsignClauses();
    expect(countPaidProExecutionBlocks(shrunk)).toBe(1);
    expect(/\belectronic signatures?|counterparts?\b/i.test(shrunk)).toBe(false);
    const ms = validateProMinimumSubstance({
      text: shrunk,
      rawIntake: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test432FourPartyStructuredDraft(),
      source: "server_full_draft",
    });
    expect(ms.requiredFactsMissing).not.toContain("electronic_signatures");
    expect(ms.missingSections).not.toContain("electronic_signatures");
  });

  it("establishPaidProSourceOfTruth from freeze commit accepts substantive wire without recovery", () => {
    const wire = buildTest432FourPartyWireServerCorpus();
    const freeze = resolvePaidProFreezeCommitText({
      text: wire,
      source: "server_full_draft",
      draft: test432FourPartyStructuredDraft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      surface: "test432_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
    establishPaidProSourceOfTruth({
      text: freeze.text,
      source: "server_full_draft",
      draft: test432FourPartyStructuredDraft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
    });
    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(MIN_SUBSTANTIVE_LEN);
    expect(detectPaidProSectionHeadingTitleAnomalies(sot).length).toBe(0);
    expect(countOperativeIfToNoticeStanzas(sot)).toBe(4);
    expect(countPaidProExecutionBlocks(sot)).toBe(1);
    for (const party of ALL_PARTIES) {
      expect(sot).toContain(party);
    }
    const trace = buildPaidProAcceptancePipelineTracePayload({
      stage: "after_establishPaidProSourceOfTruth",
      source: "server_full_draft",
      text: sot,
      rawIntake: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test432FourPartyStructuredDraft(),
    });
    expect(trace.headingAnomalyCount).toBe(0);
    expect(trace.executionBlockCount).toBe(1);
    expect(trace.noticeStanzaCount).toBe(4);
  });

  it("trace helper emits compact stage payload in test mode", () => {
    const wire = buildTest432FourPartyWireServerCorpus();
    const payload = tracePaidProAcceptancePipelineStage({
      stage: "raw_server_full_draft_received",
      source: "server_full_draft",
      text: wire,
      rawIntake: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test432FourPartyStructuredDraft(),
    });
    expect(payload.stage).toBe("raw_server_full_draft_received");
    expect(payload.len).toBe(wire.length);
    expect(payload.hash.length).toBeGreaterThan(2);
    expect(payload.headingAnomalyCount).toBeGreaterThan(0);
    expect(payload.partyCount).toBeGreaterThanOrEqual(2);
  });
});
