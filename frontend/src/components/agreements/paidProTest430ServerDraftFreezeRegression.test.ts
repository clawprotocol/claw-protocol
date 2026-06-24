/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import {
  buildPaidProFreezeCandidate,
  previewRecoverPaidProFreezeCandidate,
} from "./paidProFreezeCandidate";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
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

const ALL_PARTIES = [NORTH_STAR, SUMMIT_RIDGE, DELTA_INTEGRATION, BLUE_CANYON];
const MIN_SUBSTANTIVE_SERVER_LEN = 15_000;

describe("TEST430 — server_full_draft freeze identity and recovery guard", () => {
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

  it("accepts substantive prepared server_full_draft instead of short deterministic recovery", () => {
    const server = padOperativeCorpusBeforeWitness(
      buildTest429MalformedFourPartyServerCorpus(),
      19_000,
    );
    expect(server.length).toBeGreaterThan(18_000);

    latchAcceptedServerFullDraftAuthority(server, "server_full_draft");

    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test429Draft(),
      TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      { surface: "test430_prepare" },
    );

    const prepCandidate = preparePaidProServerDocumentForAcceptance(
      server,
      test429Draft(),
      TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      { surface: "test430_prepare_only" },
    );

    const freeze = buildPaidProFreezeCandidate({
      text: prepared.text,
      draft: test429Draft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test430_freeze",
    });

    expect(freeze.ok, freeze.rejectReason ?? "freeze failed").toBe(true);
    expect(freeze.rejectReason).not.toBe("section_heading_title_anomaly");

    const validationInputHash = paidProPipelineAcceptedCorpusHash(freeze.text);
    expect(validationInputHash).toBeTruthy();
    expect(freeze.text.length).toBeGreaterThan(prepCandidate.text.length * 0.85);
    expect(freeze.text.length).toBeGreaterThan(MIN_SUBSTANTIVE_SERVER_LEN - 2000);

    const validation = validatePaidProOutput({
      text: prepared.text,
      rawIntake: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      draft: test429Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.reasons, JSON.stringify(validation.reasons)).not.toContain(
      "deterministic_recovery_freeze_candidate_ok",
    );
    expect(validation.reasons).not.toContain("substantive_server_draft_recovery_blocked");

    const recovery = previewRecoverPaidProFreezeCandidate({
      draft: test429Draft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      surface: "test430_recovery_preview",
    });
    expect(recovery.ok).toBe(true);
    expect(recovery.text.length).toBeLessThan(prepared.text.length - 3000);
    expect(recovery.text.length).toBeLessThan(MIN_SUBSTANTIVE_SERVER_LEN);

    for (const party of ALL_PARTIES) {
      expect(freeze.text).toContain(party);
    }
    expect(countOperativeIfToNoticeStanzas(freeze.text)).toBe(4);
    expect(countPaidProExecutionBlocks(freeze.text)).toBe(1);
  });
});
