/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { preparePaidProFrozenDisplayPlain, preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  countOperativeIfToNoticeStanzas,
  extractOperativeIfToNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { parseLabeledPartyBlocks } from "./labeledPartyBlockParse";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { latchAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import {
  buildTest429MalformedFourPartyServerCorpus,
  BLUE_CANYON,
  DELTA_INTEGRATION,
  NORTH_STAR,
  SUMMIT_RIDGE,
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
  TEST429_MIN_SERVER_LEN,
  test429Draft,
} from "./paidProTest429FourPartyNorthStarFixtures";

const ALL_PARTIES = [NORTH_STAR, SUMMIT_RIDGE, DELTA_INTEGRATION, BLUE_CANYON];

function countMiscellaneousSections(text: string): number {
  return (text.match(/^\s*\d+\.\s+Miscellaneous\s*$/gim) ?? []).length;
}

function countSignaturesFollowMarkers(text: string): number {
  return (text.match(/^\s*\[?\s*SIGNATURES\s+FOLLOW\s*\]?\s*$/gim) ?? []).length;
}

function openingRecitalSlice(text: string): string {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const sec1Match = text.match(/^1\.\s+(?!\d)/m);
  const sec1Idx = sec1Match?.index ?? -1;
  const end =
    sec1Idx >= 0
      ? sec1Idx
      : witnessIdx >= 0
        ? witnessIdx
        : Math.min(text.length, 4000);
  return text.slice(0, end);
}
function countOpeningRecitalPhrases(text: string): number {
  const head = openingRecitalSlice(text);
  return (head.match(/\bentered\s+into\s+as\s+of\s+the\s+Effective\s+Date\b/gi) ?? []).length;
}

describe("TEST429 — four-party North Star foundational recital, notice, tail, and heading repair", () => {
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

  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProPipelineTestIsolation();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("parses Party N (Role): intake blocks with explicit role labels", () => {
    const blocks = parseLabeledPartyBlocks(TEST429_FOUR_PARTY_NORTH_STAR_INTAKE);
    expect(blocks.length).toBe(4);
    expect(blocks.map((b) => b.legalEntity)).toEqual(ALL_PARTIES);
    expect(blocks[0]?.roleLabel).toBe("Client");
    expect(blocks[1]?.roleLabel).toBe("Lead Consultant");
    expect(blocks[2]?.roleLabel).toBe("Technology Integrator");
    expect(blocks[3]?.roleLabel).toBe("Data Analytics Provider");
  });

  it("malformed server corpus exhibits duplicate recital, tail, notices, and heading fragments", () => {
    const server = buildTest429MalformedFourPartyServerCorpus();
    expect(server.length).toBeGreaterThan(TEST429_MIN_SERVER_LEN - 500);
    expect(countOpeningRecitalPhrases(server)).toBeGreaterThanOrEqual(2);
    expect(countMiscellaneousSections(server)).toBeGreaterThanOrEqual(2);
    expect(countSignaturesFollowMarkers(server)).toBeGreaterThanOrEqual(2);
    expect(countOperativeIfToNoticeStanzas(server)).toBe(2);
    expect(server).toMatch(/^\s*1\.2\s+Lead\s*$/m);
    expect(server).toMatch(/^\s*4\.4\s+Revenue\s*$/m);
    expect(server).toMatch(new RegExp(`${NORTH_STAR}\\s+${NORTH_STAR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });

  it("validatePaidProOutput runs on acceptance-prepared server_full_draft without freeze-path rejections", () => {
    const server = buildTest429MalformedFourPartyServerCorpus();
    latchAcceptedServerFullDraftAuthority(server, "server_full_draft");

    const validation = validatePaidProOutput({
      text: server,
      rawIntake: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test429Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.reasons).not.toContain("duplicate_miscellaneous_section");
    expect(validation.reasons).not.toContain("duplicate_opening_recital");
    expect(validation.reasons).not.toContain("section_heading_title_anomaly");
    expect(validation.reasons).not.toContain("freeze_candidate_rejected");
    expect(validation.reasons).not.toContain("substantive_server_draft_recovery_blocked");
  });

  it("freeze produces clean canonical SoT with four-party recital, notices, and execution parity", () => {
    const server = buildTest429MalformedFourPartyServerCorpus();
    latchAcceptedServerFullDraftAuthority(server, "server_full_draft");

    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test429Draft(),
      TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      { surface: "test429_prepare" },
    );
    expect(prepared.text.length).toBeGreaterThan(TEST429_MIN_SERVER_LEN - 500);

    const freeze = resolvePaidProFreezeCommitText({
      text: prepared.text,
      draft: test429Draft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test429_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze failed").toBe(true);

    latchAcceptedServerFullDraftAuthority(freeze.text, "server_full_draft", {
      freezeEstablished: true,
    });
    establishPaidProSourceOfTruth({
      text: freeze.text,
      source: "server_full_draft",
      draft: test429Draft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
    });
    const sot = getPaidProSourceOfTruthText();
    const record = getPaidProSourceOfTruth();
    expect(record?.source).toBe("server_full_draft");

    for (const party of ALL_PARTIES) {
      expect(sot).toContain(party);
    }
    expect(sot).toMatch(/\("Client"\)/i);
    expect(sot).toMatch(/\("Lead Consultant"\)/i);
    expect(sot).toMatch(/\("Technology Integrator"\)/i);
    expect(sot).toMatch(/\("Data Analytics Provider"\)/i);
    expect(openingRecitalSlice(sot)).not.toMatch(
      new RegExp(`${NORTH_STAR}\\s+${NORTH_STAR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    expect(sot).toMatch(/CONSULTING AND IMPLEMENTATION AGREEMENT/i);
    expect(sot).toMatch(/\bamong\b/i);
    const opening = openingRecitalSlice(sot);
    if (opening.length >= 80) {
      expect(opening).toMatch(/\bamong\b/i);
      expect((opening.match(/CONSULTING AND IMPLEMENTATION AGREEMENT/gi) ?? []).length).toBe(1);
    }
    expect(countMiscellaneousSections(sot)).toBe(1);
    expect(countSignaturesFollowMarkers(sot)).toBeLessThanOrEqual(1);
    expect(countOperativeIfToNoticeStanzas(sot)).toBe(4);
    expect(ALL_PARTIES.every((party) => sot.includes(party))).toBe(true);
    expect(countPaidProExecutionBlocks(sot)).toBe(1);
    expect(sot).toMatch(/Lead Consultant Responsibilities/i);
    expect(sot).toMatch(/Revenue Allocation Among Service Providers/i);
    expect(sot).toMatch(/Internal Allocation Responsibility/i);
    expect(sot).toMatch(/Coordination Through Lead Consultant/i);
    expect(sot).toMatch(/Termination for Material Breach by Service Provider Team/i);
    expect(sot).not.toMatch(/^\s*\d+\.\d+\s+Lead\s*$/m);
    expect(sot).not.toMatch(/^\s*\d+\.\d+\s+Revenue\s*$/m);

    const noticesIdx = sot.search(/\bNotices\b/i);
    const witnessIdx = sot.search(/\bIN WITNESS WHEREOF\b/i);
    const noticesRegion = sot.slice(noticesIdx, witnessIdx);
    const stanzas = extractOperativeIfToNoticeStanzas(noticesRegion);
    for (const party of ALL_PARTIES) {
      expect(stanzas).toContain(party);
    }

    const review = resolvePaidProReviewRenderPlain({
      draft: test429Draft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
    });
    const parity = auditPaidProReviewRenderSotParity({
      reviewPlain: review,
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test429Draft(),
    });
    expect(parity.invariantOk || parity.signerFieldOnlyDelta).toBe(true);
    const displaySot = preparePaidProFrozenDisplayPlain(sot, {
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draftPartyNames: test429Draft().parties?.map((p) => String((p as { name?: string }).name ?? "").trim()),
    }).text;
    const displayReview = preparePaidProReviewDisplayPlain(review).text;
    expect(hashPaidProCorpus(displaySot)).toBe(hashPaidProCorpus(displayReview));
  });
});
