/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
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
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import {
  applyPaidProSectionStructureCompletenessAuthority,
  evaluatePaidProSectionStructureFreezeGate,
} from "./paidProSectionStructureCompletenessAuthority";
import {
  hasFalseFragmentSectionHeading,
  hasOrphanStandaloneSectionNumberLines,
} from "./paidProOrphanSectionNumberRepair";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  latchAcceptedServerFullDraftAuthority,
} from "./premiumAcceptancePolicy";
import {
  buildTest427RedMesaOrphanSectionFragmentCorpus,
  TEST427_RED_MESA_INTAKE_WITH_SIGNERS,
  TEST427_RESUME_PHRASE,
  TEST435_HARBOR_PEAK,
  TEST435_MIN_SERVER_LEN,
  TEST435_RED_MESA,
  test435Draft,
} from "./paidProTest427RedMesaOrphanFragmentFixtures";

const FALSE_FRAGMENT_HEADING_RE = /^\d+\.\s+(Service|Provider|Client|If)\s*$/im;

function assertNoOrphanSectionDefects(text: string): void {
  expect(text).not.toMatch(FALSE_FRAGMENT_HEADING_RE);
  expect(hasOrphanStandaloneSectionNumberLines(text)).toBe(false);
  expect(hasFalseFragmentSectionHeading(text)).toBe(false);
  expect(text).not.toMatch(/^\d+\.\s*$/m);
}

describe("TEST427 — Red Mesa orphan subsection fragment repair before Pro SoT acceptance", () => {
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

  it("raw server corpus contains orphan 5. / Service / Provider fragment pattern", () => {
    const server = buildTest427RedMesaOrphanSectionFragmentCorpus();
    expect(server.length).toBeGreaterThan(TEST435_MIN_SERVER_LEN - 500);
    expect(server).toMatch(/Suspension, Force Majeure and Transition/i);
    expect(server).toMatch(/^\s*5\.\s*$/m);
    expect(server).toMatch(/^\s*Service\s*$/m);
    expect(server).toMatch(/Provider will resume performance promptly/i);
  });

  it("repair merges fragment into paragraph and freeze accepts server_full_draft with hash parity", () => {
    const server = buildTest427RedMesaOrphanSectionFragmentCorpus();
    latchAcceptedServerFullDraftAuthority(server, "server_full_draft");

    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test435Draft(),
      TEST427_RED_MESA_INTAKE_WITH_SIGNERS,
      { surface: "test427_prepare" },
    );

    const structure = applyPaidProSectionStructureCompletenessAuthority(prepared.text, {
      source: "test427_structure",
      phase: "pre_freeze",
    });
    expect(structure.rejected).toBe(false);
    expect(structure.diagnostics.sectionHeadingTitleAnomalies).toEqual([]);
    assertNoOrphanSectionDefects(structure.text);
    expect(structure.text).toContain(TEST427_RESUME_PHRASE);

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test435Draft(),
      intakeText: TEST427_RED_MESA_INTAKE_WITH_SIGNERS,
      agreementGenerationId: "gen-test427",
      surface: "test427_freeze",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.text).toContain(TEST427_RESUME_PHRASE);

    const validation = validatePaidProOutput({
      text: freezeCommit.text,
      rawIntake: TEST427_RED_MESA_INTAKE_WITH_SIGNERS,
      draft: test435Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok, validation.reasons.join("|") || "validation_failed").toBe(true);
    expect(validation.reasons).not.toContain("section_heading_title_anomaly");
    expect(validation.reasons).not.toContain("section_structure_completeness_unresolved");

    latchAcceptedServerFullDraftAuthority(freezeCommit.text, "server_full_draft", {
      freezeEstablished: true,
    });
    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test435Draft(),
      intakeText: TEST427_RED_MESA_INTAKE_WITH_SIGNERS,
    });

    const record = getPaidProSourceOfTruth()!;
    expect(record.source).toBe("server_full_draft");
    expect(record.hash).toBeTruthy();

    const sot = getPaidProSourceOfTruthText();
    assertNoOrphanSectionDefects(sot);
    expect(sot).toContain(TEST427_RESUME_PHRASE);
    expect(sot).toContain(TEST435_RED_MESA);
    expect(sot).toContain(TEST435_HARBOR_PEAK);

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: test435Draft(),
      intakeText: TEST427_RED_MESA_INTAKE_WITH_SIGNERS,
    });
    expect(hashPaidProCorpus(reviewPlain)).toBe(record.hash);
    assertNoOrphanSectionDefects(reviewPlain);
    expect(reviewPlain).toContain(TEST427_RESUME_PHRASE);

    const structureGate = evaluatePaidProSectionStructureFreezeGate(reviewPlain, "test427_review");
    expect(structureGate.ok, structureGate.rejectReason ?? "structure_gate_failed").toBe(true);
    expect(structureGate.diagnostics.sectionHeadingTitleAnomalies).toEqual([]);
    expect(structureGate.diagnostics.syntheticMalformedHeadings).toEqual([]);
  });
});
