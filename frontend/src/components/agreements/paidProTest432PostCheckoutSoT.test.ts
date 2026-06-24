/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
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
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import {
  buildTest432PreparedAcceptCorpus,
  buildTest432ServerFullDraftWithIncompleteNotices,
  TEST432_HARBOR_PEAK,
  TEST432_INTAKE,
  TEST432_RED_MESA,
  test432Draft,
} from "./paidProTest432Fixtures";

describe("TEST432 — post-checkout Pro SoT freeze/render (Red Mesa / Harbor Peak)", () => {
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

  it("prepared corpus meets production-scale server length", () => {
    expect(buildTest432PreparedAcceptCorpus().length).toBeGreaterThan(9000);
  });

  it("freeze commit establishes SoT from server_full_draft with incomplete notices", () => {
    const serverDraft = buildTest432ServerFullDraftWithIncompleteNotices();
    expect(serverDraft.length).toBeGreaterThan(9000);

    const prepared = preparePaidProServerDocumentForAcceptance(
      serverDraft,
      test432Draft(),
      TEST432_INTAKE,
      { surface: "test432_prepare" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test432Draft(),
      intakeText: TEST432_INTAKE,
      surface: "test432_freeze_commit",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.text.length).toBeGreaterThan(5000);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test432Draft(),
      intakeText: TEST432_INTAKE,
    });

    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(5000);
    expect(sot).toContain(TEST432_RED_MESA);
    expect(sot).toContain(TEST432_HARBOR_PEAK);
    expect(sot).not.toMatch(/If to\s+Party 1/i);
    expect(sot).not.toMatch(/If to\s+Party 2/i);

    const signerCount = resolveAuthoritativeSignerCount({
      intakeText: TEST432_INTAKE,
      draftParties: test432Draft().parties ?? [],
    });
    expect(signerCount.count).toBe(2);

    expect(sot).toMatch(/Red Mesa Logistics LLC/i);
    expect(sot).toMatch(/Harbor Peak Automation LLC/i);
    expect(sot).not.toMatch(/If to\s+Party 1/i);
    expect(sot).not.toMatch(/If to\s+Party 2/i);
  });

  it("validation + establish + review render use authoritative server corpus (>9000)", () => {
    const corpus = buildTest432PreparedAcceptCorpus();
    expect(corpus.length).toBeGreaterThan(9000);
    const prepared = preparePaidProServerDocumentForAcceptance(
      corpus,
      test432Draft(),
      TEST432_INTAKE,
      { surface: "test432_validation" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test432Draft(),
      intakeText: TEST432_INTAKE,
      surface: "test432_pipeline_sim",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test432Draft(),
      intakeText: TEST432_INTAKE,
    });

    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(5000);

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: test432Draft(),
      intakeText: TEST432_INTAKE,
    });
    expect(reviewPlain.trim().length).toBeGreaterThan(4000);

    const finalReview = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: getPaidProSourceOfTruthText(),
      renderedPreviewPlain: reviewPlain,
      finalReviewAuthorityOnly: true,
    });
    expect(finalReview.authoritativeLen).toBeGreaterThan(5000);
    expect(finalReview.plainText.length).toBeGreaterThan(4000);
  });
});
