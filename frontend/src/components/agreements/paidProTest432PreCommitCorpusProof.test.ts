/** @vitest-environment jsdom */
/**
 * Pre-commit corpus integrity proof for TEST432 production hardening.
 * Run explicitly before merge; not part of default CI unless included.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  countOperativeIfToNoticeStanzas,
  repairIncompleteIfToNoticeStanzas,
  trimOperativeNoticeStanzasToPartyCount,
} from "./paidProPartyNoticeDetails";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  BLUE_CANYON,
  DELTA_INTEGRATION,
  NORTH_STAR,
  SUMMIT_RIDGE,
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
} from "./paidProTest429FourPartyNorthStarFixtures";
import { countWitnessExecutionSections } from "./paidProSignerSigningCorpusHygiene";
import { countSignatureExecutionLinesInTail } from "./guidedDealCompletion/signatureRegion";
import { detectPaidProSectionHeadingTitleAnomalies } from "./paidProSectionHeadingTitleAuthority";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import {
  buildTest432FourPartyWireServerCorpus,
  test432FourPartyStructuredDraft,
} from "./paidProTest432FourPartyNorthStarPipelineFixtures";
import {
  buildTest432PreparedAcceptCorpus,
  buildTest432ServerFullDraftWithIncompleteNotices,
  TEST432_INTAKE,
  test432Draft,
} from "./paidProTest432Fixtures";

const ALL_PARTIES = [NORTH_STAR, SUMMIT_RIDGE, DELTA_INTEGRATION, BLUE_CANYON];

/** Operative sections that must survive notice-family-scoped repair (n-party builder + TEST432 appendices). */
const TWO_PARTY_MIDDLE_SECTION_MARKERS = [
  "TERM AND TERMINATION",
  "GOVERNING LAW",
  "MISCELLANEOUS AND ELECTRONIC SIGNATURES",
  "DELIVERABLES AND REPORTING APPENDIX",
];

const FOUR_PARTY_MIDDLE_SECTION_MARKERS = [
  "TERM AND TERMINATION",
  "GOVERNING LAW",
  "Miscellaneous",
  "Counterparts",
  "Electronic Signatures",
];

function report(label: string, text: string, source?: string): void {
  // eslint-disable-next-line no-console
  console.info(`[test432-precommit] ${label}`, {
    len: text.length,
    hash: hashPaidProCorpus(text),
    source: source ?? "",
  });
}

describe("TEST432 pre-commit corpus proof", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    clearPaidProSourceOfTruth();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  it("proves four-party wire → freeze → SoT integrity and document quality", () => {
    const wire = buildTest432FourPartyWireServerCorpus();
    report("wire_server_full", wire, "server_full_draft");

    const freeze = resolvePaidProFreezeCommitText({
      text: wire,
      source: "server_full_draft",
      draft: test432FourPartyStructuredDraft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      surface: "test432_precommit_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
    report("freeze_commit", freeze.text, "server_full_draft");

    expect(freeze.text.length).toBeGreaterThan(18_000);
    expect(freeze.text.length).toBeGreaterThan(Math.floor(wire.length * 0.85));
    expect(freeze.text.length).not.toBeLessThan(wire.length - 5000);

    establishPaidProSourceOfTruth({
      text: freeze.text,
      source: "server_full_draft",
      draft: test432FourPartyStructuredDraft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
    });
    const sot = getPaidProSourceOfTruthText();
    const record = getPaidProSourceOfTruth();
    report("accepted_sot", sot, record?.source ?? "");
    expect(record?.source).toBe("server_full_draft");
    expect(sot.length).toBeGreaterThan(18_000);
    expect(hashPaidProCorpus(sot)).toBe(record?.hash);

    for (const section of FOUR_PARTY_MIDDLE_SECTION_MARKERS) {
      expect(sot).toMatch(new RegExp(section, "i"));
    }

    expect(sot).not.toMatch(/with its principal place of business at Background:/i);
    expect(sot).not.toMatch(/Address:\s*\n\s*Background:/i);
    expect(sot).not.toMatch(/Agreement\.12\./);
    expect(sot).not.toMatch(/venue\.12\.2/);
    expect(sot).not.toMatch(/^\s*\d+\.\d+\s+Lead\s*$/m);
    expect(sot).not.toMatch(/^\s*\d+\.\d+\s+Revenue\s*$/m);
    expect(sot).not.toMatch(/^\s*\d+\.\d+\s+Consultant Responsibilities\s*$/m);
    expect(sot).not.toMatch(/^\s*\d+\.\d+\s+Allocation\s*$/m);
    expect(detectPaidProSectionHeadingTitleAnomalies(sot).length).toBe(0);

    expect(countOperativeIfToNoticeStanzas(sot)).toBe(4);
    expect(countPaidProExecutionBlocks(sot)).toBe(1);
    expect(countWitnessExecutionSections(sot)).toBe(1);
    expect(countSignatureExecutionLinesInTail(sot)).toBeGreaterThanOrEqual(4);

    const noticesIdx = sot.search(/\bNotices\b/i);
    const witnessIdx = sot.search(/\bIN WITNESS WHEREOF\b/i);
    const noticesRegion = sot.slice(noticesIdx, witnessIdx);
    for (const party of ALL_PARTIES) {
      const entityMatches = noticesRegion.match(new RegExp(party.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ?? [];
      expect(entityMatches.length).toBeGreaterThanOrEqual(1);
      expect(entityMatches.length).toBeLessThanOrEqual(3);
    }
  });

  it("proves two-party incomplete-notices path does not shrink to ~5k", () => {
    const serverDraft = buildTest432ServerFullDraftWithIncompleteNotices();
    report("incomplete_notices_wire", serverDraft, "server_full_draft");
    expect(serverDraft.length).toBeGreaterThan(9000);

    const prepared = preparePaidProServerDocumentForAcceptance(
      serverDraft,
      test432Draft(),
      TEST432_INTAKE,
      { surface: "test432_precommit_prepare" },
    );
    report("incomplete_notices_prepared", prepared.text, "server_full_draft");

    const freeze = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test432Draft(),
      intakeText: TEST432_INTAKE,
      surface: "test432_precommit_incomplete_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
    report("incomplete_notices_freeze", freeze.text, "server_full_draft");

    expect(freeze.text.length).toBeGreaterThan(8000);
    expect(freeze.text.length).toBeGreaterThan(Math.floor(serverDraft.length * 0.85));
    expect(countOperativeIfToNoticeStanzas(freeze.text)).toBe(2);

    for (const section of ["Governing Law", "TERM AND TERMINATION", "MISCELLANEOUS"]) {
      expect(freeze.text).toMatch(new RegExp(section, "i"));
    }
  });

  it("proves notice trim is scoped to notices family and preserves middle supplemental sections", () => {
    const base = buildTest432PreparedAcceptCorpus();
    const parties = resolvePartiesForReviewRender({ draft: test432Draft(), intakeText: TEST432_INTAKE });
    const repaired = repairIncompleteIfToNoticeStanzas(base, parties, {
      intakeText: TEST432_INTAKE,
      draftPartyNames: test432Draft().parties.map((p) => String((p as { name?: string }).name ?? "")),
      acceptedCorpus: base,
    });
    report("notice_repair", repaired.text);

    const trimmed = trimOperativeNoticeStanzasToPartyCount(repaired.text, 2);
    if (trimmed.repairs.length > 0) {
      report("notice_trim", trimmed.text);
      expect(trimmed.text.length).toBeGreaterThan(repaired.text.length - 100);
    }

    const finalText = trimmed.repairs.length > 0 ? trimmed.text : repaired.text;
    expect(finalText.length).toBeGreaterThan(8000);
    for (const section of TWO_PARTY_MIDDLE_SECTION_MARKERS) {
      expect(finalText).toMatch(new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    expect(countOperativeIfToNoticeStanzas(finalText)).toBe(2);
  });
});
