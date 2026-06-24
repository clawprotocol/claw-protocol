/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { hasLatchedLongAcceptedServerFullDraft } from "./paidProAcceptedServerFullDraftCommitGuard";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import {
  applyPaidProSectionStructureCompletenessAuthority,
} from "./paidProSectionStructureCompletenessAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import {
  freezeSessionPremiumBodyForGeneration,
  latchAcceptedServerFullDraftAuthority,
} from "./premiumAcceptancePolicy";
import {
  buildTest435ServerFullDraftWithRepairableStructureBreaks,
  TEST435_HARBOR_PEAK,
  TEST435_INTAKE,
  TEST435_INTAKE_WITH_SIGNERS,
  TEST435_MIN_SERVER_LEN,
  TEST435_RED_MESA,
  test435Draft,
} from "./paidProTest435Fixtures";

const STARTER_FALLBACK = "Starter draft preview — short fallback corpus for TEST435.";

describe("TEST435 — Red Mesa / Harbor Peak post-checkout freeze after valid 17k server draft", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
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
    clearPremiumPartyNamesHandoff();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("uses exact manual QA prompt terms in intake fixture", () => {
    expect(TEST435_INTAKE_WITH_SIGNERS).toContain(TEST435_INTAKE);
    expect(TEST435_INTAKE).toContain("Governing law: Oklahoma.");
  });

  it("section structure authority repairs orphan 10.1 and glued 6.2 with explicit diagnostics", () => {
    const server = buildTest435ServerFullDraftWithRepairableStructureBreaks();
    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test435Draft(),
      TEST435_INTAKE_WITH_SIGNERS,
      { surface: "test435_structure_prep" },
    );
    const repaired = applyPaidProSectionStructureCompletenessAuthority(prepared.text, {
      source: "test435_structure",
      phase: "pre_freeze",
    });
    expect(repaired.rejected).toBe(false);
    expect(repaired.diagnostics.missingParentSections).toEqual([]);
    expect(repaired.diagnostics.missingIntermediateSections).toEqual([]);
    expect(repaired.repairs.length).toBeGreaterThan(0);
  });

  it("early session freeze without authority latch still passes freeze commit on 17k server corpus", () => {
    const server = buildTest435ServerFullDraftWithRepairableStructureBreaks();
    expect(server.length).toBeGreaterThan(TEST435_MIN_SERVER_LEN - 500);

    freezeSessionPremiumBodyForGeneration("gen-test435", server, "server_full_draft");
    expect(hasLatchedLongAcceptedServerFullDraft()).toBe(false);

    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test435Draft(),
      TEST435_INTAKE_WITH_SIGNERS,
      { surface: "test435_prepare" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
      agreementGenerationId: "gen-test435",
      surface: "test435_freeze_commit",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.text.length).toBeGreaterThan(5000);
    expect(hasLatchedLongAcceptedServerFullDraft()).toBe(false);
  });

  it("validatePaidProOutput accepts simulated premium API 200 long server path — no rejected_paid_corpus", () => {
    const server = buildTest435ServerFullDraftWithRepairableStructureBreaks();
    latchAcceptedServerFullDraftAuthority(server, "server_full_draft");
    expect(hasLatchedLongAcceptedServerFullDraft()).toBe(false);

    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test435Draft(),
      TEST435_INTAKE_WITH_SIGNERS,
      { surface: "test435_validate" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
      surface: "test435_validate_freeze",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);

    const validation = validatePaidProOutput({
      text: freezeCommit.text,
      rawIntake: TEST435_INTAKE_WITH_SIGNERS,
      draft: test435Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok, validation.reasons.join("|") || "validation_failed").toBe(true);
    expect(validation.reasons).not.toContain("section_structure_completeness_unresolved");
    expect(validation.reasons).not.toContain("rejected_paid_corpus");
  });

  it("freeze commit establishes SoT and authoritative review render beats starter fallback", () => {
    const server = buildTest435ServerFullDraftWithRepairableStructureBreaks();
    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test435Draft(),
      TEST435_INTAKE_WITH_SIGNERS,
      { surface: "test435_sot" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
      surface: "test435_sot_freeze",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);

    latchAcceptedServerFullDraftAuthority(freezeCommit.text, "server_full_draft", {
      freezeEstablished: true,
    });
    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
    });

    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(5000);
    expect(sot).toContain(TEST435_RED_MESA);
    expect(sot).toContain(TEST435_HARBOR_PEAK);

    expect(isAuthoritativePremiumPipelineRenderSource("server_full_draft")).toBe(true);

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
    });
    expect(reviewPlain.trim().length).toBeGreaterThan(4000);

    const finalReview = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: sot,
      renderedPreviewPlain: STARTER_FALLBACK,
      finalReviewAuthorityOnly: true,
    });
    expect(finalReview.authoritativeLen).toBeGreaterThan(5000);
    expect(finalReview.plainText.length).toBeGreaterThan(STARTER_FALLBACK.length * 4);
    expect(finalReview.plainText).toContain(TEST435_RED_MESA);
    expect(finalReview.source).toMatch(/authoritative|picker_authoritative/i);
  });
});
