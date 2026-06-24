/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { validateClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import {
  corpusHasCanonicalNoticesHeading,
  countOperativeIfToNoticeStanzas,
  ensureCanonicalNoticesSectionHeadingForFreeze,
} from "./paidProPartyNoticeDetails";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
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
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import {
  buildTest440ServerFullDraftMissingNoticesHeading,
  TEST440_HARBOR_PEAK,
  TEST440_INTAKE_WITH_SIGNERS,
  TEST440_MIN_SERVER_LEN,
  TEST440_RED_MESA,
  test440Draft,
} from "./paidProTest440Fixtures";

describe("TEST440 — missing NOTICES heading repair before Pro freeze", () => {
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

  it("server fixture is long with operative If-to stanzas but no canonical NOTICES heading", () => {
    const server = buildTest440ServerFullDraftMissingNoticesHeading();
    expect(server.length).toBeGreaterThan(TEST440_MIN_SERVER_LEN - 500);
    expect(countOperativeIfToNoticeStanzas(server)).toBeGreaterThanOrEqual(2);
    expect(corpusHasCanonicalNoticesHeading(server)).toBe(false);
    expect(server).toContain(TEST440_RED_MESA);
    expect(server).toContain(TEST440_HARBOR_PEAK);
  });

  it("notice heading authority inserts canonical NOTICES before freeze", () => {
    const server = buildTest440ServerFullDraftMissingNoticesHeading();
    const repaired = ensureCanonicalNoticesSectionHeadingForFreeze(server);
    expect(repaired.repairs.length).toBeGreaterThan(0);
    expect(corpusHasCanonicalNoticesHeading(repaired.text)).toBe(true);
    expect(repaired.text).not.toMatch(/\bParty 1\b/);
    expect(repaired.text).toContain(TEST440_HARBOR_PEAK);
  });

  it("freeze commit accepts ~14k server draft after notice normalization", () => {
    const server = buildTest440ServerFullDraftMissingNoticesHeading();
    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test440Draft(),
      TEST440_INTAKE_WITH_SIGNERS,
      { surface: "test440_prepare" },
    );
    expect(prepared.text.length).toBeGreaterThan(8000);

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test440Draft(),
      intakeText: TEST440_INTAKE_WITH_SIGNERS,
      agreementGenerationId: "gen-test440",
      surface: "test440_freeze_commit",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.rejectReason).not.toBe("missing_notices_heading");
    expect(corpusHasCanonicalNoticesHeading(freezeCommit.text)).toBe(true);
    expect(freezeCommit.text).toContain(TEST440_RED_MESA);
    expect(freezeCommit.text).toContain(TEST440_HARBOR_PEAK);
    expect(freezeCommit.text).not.toMatch(/\bParty 1\b/);
    expect(freezeCommit.text).not.toMatch(/\bParty 2\b/);

    const integrity = validateClauseFamilyStructuralIntegrity(freezeCommit.text, {
      parties: freezeCommit.reviewParties,
      draftPartyCount: 2,
      handoffPartySlots: 2,
      surface: "test440_clause_integrity",
    });
    expect(integrity.ok).toBe(true);
    expect(integrity.violations.some((v) => v.code === "missing_notices_heading")).toBe(false);
    expect(countOperativeIfToNoticeStanzas(freezeCommit.text)).toBe(2);
  });

  it("establishes SoT and renders authoritative Pro corpus without retry banner source", () => {
    const server = buildTest440ServerFullDraftMissingNoticesHeading();
    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test440Draft(),
      TEST440_INTAKE_WITH_SIGNERS,
      { surface: "test440_sot_prepare" },
    );
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test440Draft(),
      intakeText: TEST440_INTAKE_WITH_SIGNERS,
      agreementGenerationId: "gen-test440-sot",
      surface: "test440_sot_freeze",
    });
    expect(freezeCommit.ok).toBe(true);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test440Draft(),
      intakeText: TEST440_INTAKE_WITH_SIGNERS,
      reviewSessionId: "gen-test440-sot",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);

    const sot = getPaidProSourceOfTruthText();
    expect(sot).toContain(TEST440_HARBOR_PEAK);
    expect(sot).toMatch(/\n\d+\.\s+NOTICES\b/i);

    expect(isAuthoritativePremiumPipelineRenderSource("server_full_draft")).toBe(true);

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: test440Draft(),
      intakeText: TEST440_INTAKE_WITH_SIGNERS,
    });
    expect(reviewPlain.trim().length).toBeGreaterThan(5000);
    expect(reviewPlain).toContain(TEST440_RED_MESA);

    const finalReview = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: sot,
      renderedPreviewPlain: reviewPlain,
      finalReviewAuthorityOnly: true,
    });
    expect(finalReview.source).not.toBe("rejected_paid_corpus");
    expect(finalReview.source).not.toBe("free_starter");
    expect(finalReview.plainText).toContain(TEST440_RED_MESA);
    expect(finalReview.authoritativeLen).toBeGreaterThan(5000);
  });
});
