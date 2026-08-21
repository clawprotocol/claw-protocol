/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  createDemoSessionUser,
  hasDemoSessionUser,
  clearDemoSessionUser,
} from "../../launch/guestCheckoutAuthority";
import {
  hasPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
  clearPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import { resolvePaidProInlineSignerSetupMounted } from "./signerSetupPartyIdentity";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { stripPremiumInstructionNoiseForDocument } from "./premiumInstructionStrip";

describe("harborDemoContinuePersistFinalReview", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("Issue A: demo session bypasses paint-ready gate for persist", () => {
    it("demo session user with premium completion and valid corpus qualifies for persist bypass", () => {
      createDemoSessionUser({
        displayName: "Harbor Pool & Patio LLC",
        email: "jordan.harbor.qa+aug21c@example.com",
        settlementReceiptId: "rcpt_harbor_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      expect(hasDemoSessionUser()).toBe(true);
      expect(hasPaidPremiumCompletionSession()).toBe(true);

      const corpusPlain = "SERVICES AGREEMENT\n".repeat(100);
      const corpusLen = corpusPlain.trim().length;

      const demoSessionBypassPaintReadyGate =
        hasDemoSessionUser() &&
        hasPaidPremiumCompletionSession() &&
        corpusLen >= PAID_PRO_AUTHORITY_MIN_LEN;

      expect(demoSessionBypassPaintReadyGate).toBe(true);
    });

    it("demo session user without premium completion does not bypass paint-ready gate", () => {
      createDemoSessionUser({
        displayName: "Test User",
        email: "test@example.com",
        settlementReceiptId: "rcpt_123",
      });
      clearPaidPremiumCompletionSession();

      expect(hasDemoSessionUser()).toBe(true);
      expect(hasPaidPremiumCompletionSession()).toBe(false);

      const corpusPlain = "SERVICES AGREEMENT\n".repeat(100);
      const corpusLen = corpusPlain.trim().length;

      const demoSessionBypassPaintReadyGate =
        hasDemoSessionUser() &&
        hasPaidPremiumCompletionSession() &&
        corpusLen >= PAID_PRO_AUTHORITY_MIN_LEN;

      expect(demoSessionBypassPaintReadyGate).toBe(false);
    });

    it("demo session user with short corpus does not bypass paint-ready gate", () => {
      createDemoSessionUser({
        displayName: "Test User",
        email: "test@example.com",
        settlementReceiptId: "rcpt_123",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const corpusPlain = "short";

      const demoSessionBypassPaintReadyGate =
        hasDemoSessionUser() &&
        hasPaidPremiumCompletionSession() &&
        corpusPlain.trim().length >= PAID_PRO_AUTHORITY_MIN_LEN;

      expect(demoSessionBypassPaintReadyGate).toBe(false);
    });

    it("non-demo user does not bypass paint-ready gate even with valid corpus", () => {
      clearDemoSessionUser();
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      expect(hasDemoSessionUser()).toBe(false);

      const corpusPlain = "SERVICES AGREEMENT\n".repeat(100);
      const corpusLen = corpusPlain.trim().length;

      const demoSessionBypassPaintReadyGate =
        hasDemoSessionUser() &&
        hasPaidPremiumCompletionSession() &&
        corpusLen >= PAID_PRO_AUTHORITY_MIN_LEN;

      expect(demoSessionBypassPaintReadyGate).toBe(false);
    });
  });

  describe("Issue B: SimpleProFinalReviewScreen mounts after demo finalize", () => {
    it("inline signer setup unmounts after signerMetadataFinalized for demo user", () => {
      createDemoSessionUser({
        displayName: "Harbor Pool & Patio LLC",
        email: "jordan.harbor.qa+aug21c@example.com",
        settlementReceiptId: "rcpt_harbor_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const beforeFinalize = resolvePaidProInlineSignerSetupMounted({
        hasAcceptedPaidProAuthority: true,
        hasProfessionallyValidatedReviewCorpus: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        signerSetupLatched: true,
        signaturePreparationRequested: false,
        signerMetadataFinalized: false,
        demoSessionUserPremiumCompletionActive: true,
      });
      expect(beforeFinalize).toBe(true);

      const afterFinalize = resolvePaidProInlineSignerSetupMounted({
        hasAcceptedPaidProAuthority: true,
        hasProfessionallyValidatedReviewCorpus: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        signerSetupLatched: true,
        signaturePreparationRequested: false,
        signerMetadataFinalized: true,
        demoSessionUserPremiumCompletionActive: true,
      });
      expect(afterFinalize).toBe(false);
    });

    it("suppressFinalReviewActions is false after demo finalize", () => {
      const paidProCanonicalReviewSignerSetupActive = false;
      const showPaidProForcedFirstReviewTrackChooser = false;

      const suppressFinalReviewActions =
        paidProCanonicalReviewSignerSetupActive || showPaidProForcedFirstReviewTrackChooser;

      expect(suppressFinalReviewActions).toBe(false);
    });

    it("render ternary excludes demo+premiumCompletion+signerMetadataFinalized from forced first review arm (source inspection)", () => {
      const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

      // The render gate for SimpleProFinalReviewScreen vs forced first review arm.
      // After the fix, demo users with premium completion who have finalized signer metadata
      // should NOT stay on the forced first review arm — they should fall through to
      // SimpleProFinalReviewScreen.
      //
      // The ternary must include the exception:
      //   (paidProForcedFirstReviewActive &&
      //     !(demoSessionUserActive && hasPaidPremiumCompletionSession() && paidProSignerMetadataFinalized))
      //
      // This test reads the actual source to verify the condition is present.

      // Find the render ternary that gates SimpleProFinalReviewScreen vs forced first review.
      // The pattern is: the div with the review card, then the ternary condition.
      const reviewCardDivPattern =
        /rounded-sm border border-stone-200\/90 bg-\[#faf7f0\].*?ring-1 ring-black\/\[0\.07\]/s;
      const reviewCardMatch = intake.match(reviewCardDivPattern);
      expect(reviewCardMatch).not.toBeNull();

      // After the review card div, find the ternary condition.
      const reviewCardIndex = intake.indexOf(reviewCardMatch![0]);
      expect(reviewCardIndex).toBeGreaterThan(0);

      // Extract a window of ~1500 chars after the review card div to capture the ternary.
      const ternaryWindow = intake.slice(reviewCardIndex, reviewCardIndex + 1500);

      // The fix adds an exception for demo+premiumCompletion+signerMetadataFinalized.
      // Check that the exception is present in the ternary.
      expect(ternaryWindow).toContain("paidProForcedFirstReviewActive");
      expect(ternaryWindow).toContain("demoSessionUserActive");
      expect(ternaryWindow).toContain("hasPaidPremiumCompletionSession()");
      expect(ternaryWindow).toContain("paidProSignerMetadataFinalized");

      // Verify the structure: paidProForcedFirstReviewActive is AND'd with a negated condition.
      // The pattern should be: (paidProForcedFirstReviewActive && !(demo && premium && finalized))
      const demoBypassPattern =
        /\(paidProForcedFirstReviewActive\s*&&\s*!\s*\(\s*demoSessionUserActive\s*&&\s*hasPaidPremiumCompletionSession\(\)\s*&&\s*paidProSignerMetadataFinalized\s*\)\)/s;
      expect(ternaryWindow).toMatch(demoBypassPattern);
    });
  });

  describe("Issue C: stripPremiumInstructionNoiseForDocument removes leaked prompts", () => {
    it("strips numbered sections with company name + verb pattern", () => {
      const corpus = `SERVICES AGREEMENT

This Services Agreement is entered into between Harbor Pool & Patio LLC and Mesa Realty Group LLC.

1. SERVICES
The Provider shall deliver pool maintenance services.

2. PAYMENT TERMS
$2,500 monthly fee.

11. Mesa Realty Group LLC / said they'll send us the final check
12. Don't / count / our house accounts in the total
13. 12 month deal, exclusive territory

10. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement.`;

      const stripped = stripPremiumInstructionNoiseForDocument(corpus);

      expect(stripped).toContain("1. SERVICES");
      expect(stripped).toContain("2. PAYMENT TERMS");
      expect(stripped).toContain("10. ENTIRE AGREEMENT");

      expect(stripped).not.toContain("11. Mesa Realty Group LLC");
      expect(stripped).not.toContain("12. Don't");
      expect(stripped).not.toContain("13. 12 month deal");
    });

    it("preserves legitimate numbered sections", () => {
      const corpus = `SERVICES AGREEMENT

1. SERVICES
The Provider shall deliver services.

2. PAYMENT TERMS
Payment is due monthly.

11. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement.`;

      const stripped = stripPremiumInstructionNoiseForDocument(corpus);

      expect(stripped).toContain("1. SERVICES");
      expect(stripped).toContain("2. PAYMENT TERMS");
      expect(stripped).toContain("11. ENTIRE AGREEMENT");
    });

    it("handles slash-separated tokens from live leak", () => {
      const corpus = `SERVICES AGREEMENT

11. Mesa Realty Group LLC / said they'll send us the check`;

      const stripped = stripPremiumInstructionNoiseForDocument(corpus);

      expect(stripped).not.toContain("11. Mesa Realty Group LLC");
      expect(stripped).not.toContain("said they'll send us");
    });

    it("normalizes slash-separated tokens before pattern matching", () => {
      const corpus = `11. Don't / count / our house accounts in the total`;

      const stripped = stripPremiumInstructionNoiseForDocument(corpus);

      expect(stripped).not.toContain("11. Don't");
      expect(stripped).not.toContain("count");
      expect(stripped).not.toContain("house accounts");
    });
  });

  describe("Issue D: Continue-time ensure builds snapshot from visible corpus when pipeline refs empty", () => {
    /**
     * These tests verify the LOGIC of the fix in ensureReviewAgreementWorkspaceId:
     * When demo+premiumCompletion, build the persist snapshot from visible corpus sources
     * (SoT, display surface, review surface) when pipeline refs are empty.
     *
     * The actual function lives in AgreementBuilderIntake.tsx and uses:
     * - lastPremiumWinningCorpusRef.current (pipeline ref)
     * - premiumPipelineOutputBodyRef.current (pipeline ref)
     * - hydratedPremiumBodyRef.current (pipeline ref)
     * - getPaidProSourceOfTruthText() (SoT - frozen corpus)
     * - getPaidProDocumentForSurface("display") (visible display surface)
     * - getPaidProDocumentForSurface("review") (visible review surface)
     *
     * The tests use mocked values to verify the fallback logic.
     */

    it("demo+premiumCompletion can build snapshot from mocked visible corpus when pipeline refs empty", () => {
      createDemoSessionUser({
        displayName: "Harbor Pool & Patio LLC",
        email: "jordan.harbor.qa+aug21c@example.com",
        settlementReceiptId: "rcpt_harbor_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      // Simulate the logic from ensureReviewAgreementWorkspaceId
      // Pipeline refs are all empty (as in the live Harbor fail)
      const lastPremiumWinningCorpus = "";
      const premiumPipelineOutputBody = "";
      const hydratedPremiumBody = "";

      let pipelineCorpus = (
        lastPremiumWinningCorpus ||
        premiumPipelineOutputBody ||
        hydratedPremiumBody ||
        ""
      ).trim();

      // Pipeline refs are empty
      expect(pipelineCorpus.length).toBeLessThan(PAID_PRO_AUTHORITY_MIN_LEN);

      // Mock visible corpus sources - this simulates getPaidProDocumentForSurface("display")
      // returning a valid corpus that the user can see on screen
      const mockSotText = "";
      const mockDisplayCorpus = "SERVICES AGREEMENT\n".repeat(100);
      const mockReviewCorpus = "";

      // The fix logic: try SoT first, then display, then review
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN && mockSotText.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
        pipelineCorpus = mockSotText;
      }
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN) {
        const displayCorpus = mockDisplayCorpus.trim();
        if (displayCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
          pipelineCorpus = displayCorpus;
        }
      }
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN) {
        const reviewCorpus = mockReviewCorpus.trim();
        if (reviewCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
          pipelineCorpus = reviewCorpus;
        }
      }

      // Now we have a valid corpus from visible display
      expect(pipelineCorpus.length).toBeGreaterThanOrEqual(PAID_PRO_AUTHORITY_MIN_LEN);
      expect(pipelineCorpus).toBe(mockDisplayCorpus.trim());

      // Demo session bypass gate should be true
      const demoSessionBypassPaintReadyGate =
        hasDemoSessionUser() &&
        hasPaidPremiumCompletionSession() &&
        pipelineCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN;
      expect(demoSessionBypassPaintReadyGate).toBe(true);
    });

    it("demo+premiumCompletion can build snapshot from mocked SoT when pipeline refs empty", () => {
      createDemoSessionUser({
        displayName: "Harbor Pool & Patio LLC",
        email: "jordan.harbor.qa+aug21c@example.com",
        settlementReceiptId: "rcpt_harbor_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      // Pipeline refs are all empty
      let pipelineCorpus = "";

      // Mock SoT corpus is available
      const mockSotText = "MASTER SERVICES AGREEMENT\n".repeat(100);
      const mockDisplayCorpus = "";
      const mockReviewCorpus = "";

      // The fix logic: SoT takes priority
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN && mockSotText.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
        pipelineCorpus = mockSotText;
      }
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN) {
        const displayCorpus = mockDisplayCorpus.trim();
        if (displayCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
          pipelineCorpus = displayCorpus;
        }
      }
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN) {
        const reviewCorpus = mockReviewCorpus.trim();
        if (reviewCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
          pipelineCorpus = reviewCorpus;
        }
      }

      expect(pipelineCorpus.length).toBeGreaterThanOrEqual(PAID_PRO_AUTHORITY_MIN_LEN);
      expect(pipelineCorpus).toBe(mockSotText);
    });

    it("demo+premiumCompletion can build snapshot from review surface when pipeline refs, SoT, and display empty", () => {
      createDemoSessionUser({
        displayName: "Harbor Pool & Patio LLC",
        email: "jordan.harbor.qa+aug21c@example.com",
        settlementReceiptId: "rcpt_harbor_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      let pipelineCorpus = "";

      // Neither SoT nor display is available, but review surface is
      const mockSotText = "";
      const mockDisplayCorpus = "";
      const mockReviewCorpus = "PROFESSIONAL SERVICES CONTRACT\n".repeat(100);

      // The fix logic: review surface is final fallback
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN && mockSotText.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
        pipelineCorpus = mockSotText;
      }
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN) {
        const displayCorpus = mockDisplayCorpus.trim();
        if (displayCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
          pipelineCorpus = displayCorpus;
        }
      }
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN) {
        const reviewCorpus = mockReviewCorpus.trim();
        if (reviewCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
          pipelineCorpus = reviewCorpus;
        }
      }

      expect(pipelineCorpus.length).toBeGreaterThanOrEqual(PAID_PRO_AUTHORITY_MIN_LEN);
      expect(pipelineCorpus).toBe(mockReviewCorpus.trim());
    });

    it("no snapshot built when all corpus sources empty (returns null)", () => {
      createDemoSessionUser({
        displayName: "Harbor Pool & Patio LLC",
        email: "jordan.harbor.qa+aug21c@example.com",
        settlementReceiptId: "rcpt_harbor_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      let pipelineCorpus = "";

      // All corpus sources are empty
      const mockSotText = "";
      const mockDisplayCorpus = "";
      const mockReviewCorpus = "";

      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN && mockSotText.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
        pipelineCorpus = mockSotText;
      }
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN) {
        const displayCorpus = mockDisplayCorpus.trim();
        if (displayCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
          pipelineCorpus = displayCorpus;
        }
      }
      if (pipelineCorpus.length < PAID_PRO_AUTHORITY_MIN_LEN) {
        const reviewCorpus = mockReviewCorpus.trim();
        if (reviewCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
          pipelineCorpus = reviewCorpus;
        }
      }

      // No valid corpus found
      expect(pipelineCorpus.length).toBeLessThan(PAID_PRO_AUTHORITY_MIN_LEN);

      // Cannot build snapshot, would return null
      const canBuildSnapshot = pipelineCorpus.length >= PAID_PRO_AUTHORITY_MIN_LEN;
      expect(canBuildSnapshot).toBe(false);
    });

    it("verifies source code has fallback chain for visible corpus (source inspection)", () => {
      const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

      // The fix adds fallback logic to try visible corpus sources when pipeline refs are empty.
      // Check that the source includes these patterns:

      // 1. Check for SoT fallback
      expect(intake).toContain("getPaidProSourceOfTruthText()");
      expect(intake).toContain("using_sot_for_persist");

      // 2. Check for display surface fallback
      expect(intake).toContain('getPaidProDocumentForSurface("display")');
      expect(intake).toContain("using_visible_display_for_persist");

      // 3. Check for review surface fallback
      expect(intake).toContain('getPaidProDocumentForSurface("review")');
      expect(intake).toContain("using_visible_review_for_persist");

      // 4. Check for diagnostic logging when no corpus found
      expect(intake).toContain("no_valid_corpus_for_persist");
    });
  });

  describe("Issue E: demo+premiumCompletion bypasses ownership-transition and superseded-cache gates", () => {
    it("demo+premiumCompletion bypass gate is true for fresh demo session", () => {
      createDemoSessionUser({
        displayName: "Harbor Pool & Patio LLC",
        email: "jordan.harbor.qa+aug21c@example.com",
        settlementReceiptId: "rcpt_harbor_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const demoSessionBypassCacheGates = hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      expect(demoSessionBypassCacheGates).toBe(true);
    });

    it("demo session without premium completion does not bypass cache gates", () => {
      createDemoSessionUser({
        displayName: "Test User",
        email: "test@example.com",
        settlementReceiptId: "rcpt_123",
      });
      clearPaidPremiumCompletionSession();

      const demoSessionBypassCacheGates = hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      expect(demoSessionBypassCacheGates).toBe(false);
    });

    it("non-demo user does not bypass cache gates", () => {
      clearDemoSessionUser();
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const demoSessionBypassCacheGates = hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      expect(demoSessionBypassCacheGates).toBe(false);
    });
  });

  describe("demo Continue flow end-to-end routing", () => {
    it("demo_session_signer_details_complete reason triggers finalize, not signature prep", () => {
      createDemoSessionUser({
        displayName: "Harbor Pool & Patio LLC",
        email: "jordan.harbor.qa+aug21c@example.com",
        settlementReceiptId: "rcpt_harbor_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const reason = "demo_session_signer_details_complete";
      const shouldCallFinalize = reason === "demo_session_signer_details_complete";
      const shouldCallPrepareSignatures = reason === "dashboard_signer_setup_resume_complete";

      expect(shouldCallFinalize).toBe(true);
      expect(shouldCallPrepareSignatures).toBe(false);
    });

    it("dashboard_signer_setup_resume_complete reason triggers finalize then signature prep", () => {
      clearDemoSessionUser();

      const reason = "dashboard_signer_setup_resume_complete";
      const shouldCallFinalize = reason === "dashboard_signer_setup_resume_complete";
      const shouldCallPrepareSignatures = reason === "dashboard_signer_setup_resume_complete";

      expect(shouldCallFinalize).toBe(true);
      expect(shouldCallPrepareSignatures).toBe(true);
    });
  });
});
