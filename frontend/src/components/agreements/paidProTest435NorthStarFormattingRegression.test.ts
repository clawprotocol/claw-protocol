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
} from "./paidProSourceOfTruth";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  countOperativeIfToNoticeStanzas,
  extractOperativeIfToNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { latchAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import {
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
  NORTH_STAR,
} from "./paidProTest429FourPartyNorthStarFixtures";
import {
  buildTest435NorthStarMalformedServerCorpus,
  TEST435_NORTH_STAR_MIN_SOT_LEN,
  TEST435_NORTH_STAR_PARTIES,
  test435NorthStarDraft,
} from "./paidProTest435NorthStarFormattingFixtures";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function duplicatedIfToPattern(party: string): RegExp {
  return new RegExp(`If to ${escapeRe(party)}\\s+${escapeRe(party)}\\s*:`, "i");
}

function duplicatedEntityLinePattern(party: string): RegExp {
  return new RegExp(`^\\s*${escapeRe(party)}\\s+${escapeRe(party)}\\s*:?\\s*$`, "im");
}

describe("TEST435 — four-party North Star notice duplication and heading fragmentation", () => {
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

  it("malformed wire exhibits duplicated notice headers and split subsection headings", () => {
    const server = buildTest435NorthStarMalformedServerCorpus();
    expect(server.length).toBeGreaterThan(TEST435_NORTH_STAR_MIN_SOT_LEN - 1000);
    for (const party of TEST435_NORTH_STAR_PARTIES) {
      expect(server).toMatch(duplicatedIfToPattern(party));
      expect(server).toMatch(duplicatedEntityLinePattern(party));
    }
    expect(server).toMatch(/^\s*1\.2\s+Lead\s*$/m);
    expect(server).toMatch(/^\s*3\.4\s+Revenue\s*$/m);
    expect(server).toMatch(/^\s*3\.5\s+Timing of Internal\s*$/m);
    expect(server).toMatch(/^\s*Consultant Responsibilities\s*$/m);
    expect(server).toMatch(/^\s*Allocation Among Service Providers\s*$/m);
    expect(server).toMatch(/^\s*Allocation Payments\s*$/m);
  });

  it("freeze produces clean SoT — no duplicated notices or orphan heading fragments", () => {
    const server = buildTest435NorthStarMalformedServerCorpus();
    latchAcceptedServerFullDraftAuthority(server, "server_full_draft");

    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test435NorthStarDraft(),
      TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      { surface: "test435_north_star_prepare" },
    );

    const freeze = resolvePaidProFreezeCommitText({
      text: prepared.text,
      draft: test435NorthStarDraft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test435_north_star_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze failed").toBe(true);

    latchAcceptedServerFullDraftAuthority(freeze.text, "server_full_draft", {
      freezeEstablished: true,
    });
    establishPaidProSourceOfTruth({
      text: freeze.text,
      source: "server_full_draft",
      draft: test435NorthStarDraft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
    });

    const sot = getPaidProSourceOfTruthText();
    const record = getPaidProSourceOfTruth();
    expect(record?.source).toBe("server_full_draft");
    expect(sot.length).toBeGreaterThan(TEST435_NORTH_STAR_MIN_SOT_LEN);

    for (const party of TEST435_NORTH_STAR_PARTIES) {
      expect(sot).toContain(party);
      expect(sot).not.toMatch(duplicatedIfToPattern(party));
      expect(sot).not.toMatch(duplicatedEntityLinePattern(party));
    }

    expect(sot).toMatch(/Lead Consultant Responsibilities/i);
    expect(sot).toMatch(/Revenue Allocation Among Service Providers/i);
    expect(sot).toMatch(/Timing of Internal Allocation Payments/i);
    expect(sot).not.toMatch(/^\s*Lead\s*$\n\s*Consultant Responsibilities\s*$/m);
    expect(sot).not.toMatch(/^\s*Revenue\s*$\n\s*Allocation\b/m);
    expect(sot).not.toMatch(/^\s*Timing of Internal\s*$\n\s*Allocation Payments\s*$/m);
    expect(openingRecitalSlice(sot)).not.toMatch(
      new RegExp(`${escapeRe(NORTH_STAR)}\\s+${escapeRe(NORTH_STAR)}`),
    );

    expect(countOperativeIfToNoticeStanzas(sot)).toBe(4);
    expect(countPaidProExecutionBlocks(sot)).toBe(1);

    const noticesIdx = sot.search(/\bNotices\b/i);
    const witnessIdx = sot.search(/\bIN WITNESS WHEREOF\b/i);
    const noticesRegion = sot.slice(noticesIdx, witnessIdx);
    const stanzas = extractOperativeIfToNoticeStanzas(noticesRegion);
    for (const party of TEST435_NORTH_STAR_PARTIES) {
      expect(stanzas).toContain(party);
      expect(noticesRegion).toMatch(new RegExp(`If to ${escapeRe(party)}:`, "i"));
    }
  });
});
