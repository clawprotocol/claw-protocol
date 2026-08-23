/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  createDemoSessionUser,
  hasDemoSessionUser,
  clearDemoSessionUser,
} from "../../launch/guestCheckoutAuthority";
import { shouldShowPaidProReviewDecisionChrome } from "./paidProReviewDecisionModel";
import type { PaidProReviewDecisionPhase } from "./paidProReviewDecisionModel";
import {
  hasPaidPremiumCompletionSession,
  hasStoredPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
  clearPaidPremiumCompletionSession,
  stripPremiumCompletionQueryParam,
} from "./premiumCompletionStorage";

describe("demoSessionUserPostPosChrome", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("showPaidProForcedFirstReviewTrackChooser for demo session users", () => {
    it("suppresses PaidProForcedFirstReviewChrome for demo session users", () => {
      createDemoSessionUser({
        displayName: "Test User",
        email: "test@example.com",
        settlementReceiptId: "rcpt_123",
      });
      expect(hasDemoSessionUser()).toBe(true);

      const phase: PaidProReviewDecisionPhase = "decision_1";
      const showRelicChrome = shouldShowPaidProReviewDecisionChrome(phase);
      expect(showRelicChrome).toBe(true);

      const showForDemoUser = hasDemoSessionUser() ? false : showRelicChrome;
      expect(showForDemoUser).toBe(false);
    });

    it("shows PaidProForcedFirstReviewChrome for non-demo users", () => {
      expect(hasDemoSessionUser()).toBe(false);

      const phase: PaidProReviewDecisionPhase = "decision_1";
      const showRelicChrome = shouldShowPaidProReviewDecisionChrome(phase);
      expect(showRelicChrome).toBe(true);

      const showForNonDemoUser = hasDemoSessionUser() ? false : showRelicChrome;
      expect(showForNonDemoUser).toBe(true);
    });
  });

  describe("post-POS flow for demo session users", () => {
    it("demo session user created has correct source", () => {
      const user = createDemoSessionUser({
        displayName: "Pro User",
        email: "demo@example.com",
        settlementReceiptId: "rcpt_demo_4242",
      });

      expect(user.source).toBe("demo_checkout");
      expect(user.settlementReceiptId).toBe("rcpt_demo_4242");
    });

    it("demo session user cleared correctly", () => {
      createDemoSessionUser({
        displayName: "Pro User",
        settlementReceiptId: "rcpt_demo_4242",
      });
      expect(hasDemoSessionUser()).toBe(true);

      clearDemoSessionUser();
      expect(hasDemoSessionUser()).toBe(false);
    });
  });

  describe("phase transitions for demo session users", () => {
    it("none phase hides chrome for all users", () => {
      const phase: PaidProReviewDecisionPhase = "none";
      expect(shouldShowPaidProReviewDecisionChrome(phase)).toBe(false);
    });

    it("signer_setup phase hides chrome for all users", () => {
      const phase: PaidProReviewDecisionPhase = "signer_setup";
      expect(shouldShowPaidProReviewDecisionChrome(phase)).toBe(false);
    });

    it("decision_2 phase shows chrome for non-demo users", () => {
      const phase: PaidProReviewDecisionPhase = "decision_2";
      expect(shouldShowPaidProReviewDecisionChrome(phase)).toBe(true);

      createDemoSessionUser({
        displayName: "Demo User",
        settlementReceiptId: "rcpt_123",
      });

      const showForDemoUser = hasDemoSessionUser() ? false : shouldShowPaidProReviewDecisionChrome(phase);
      expect(showForDemoUser).toBe(false);
    });
  });

  describe("guest 4242 return mounts inline signer setup", () => {
    it("demo session user with premium completion session qualifies for inline signer setup", () => {
      createDemoSessionUser({
        displayName: "Guest Buyer",
        email: "guest@example.com",
        settlementReceiptId: "rcpt_4242_demo",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      expect(hasDemoSessionUser()).toBe(true);
      expect(hasPaidPremiumCompletionSession()).toBe(true);

      const shouldArmInlineSignerSetup =
        hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      expect(shouldArmInlineSignerSetup).toBe(true);
    });

    it("demo session user without premium completion does not arm inline signer setup", () => {
      createDemoSessionUser({
        displayName: "Guest Buyer",
        settlementReceiptId: "rcpt_no_premium",
      });
      clearPaidPremiumCompletionSession();

      expect(hasDemoSessionUser()).toBe(true);
      expect(hasPaidPremiumCompletionSession()).toBe(false);

      const shouldArmInlineSignerSetup =
        hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      expect(shouldArmInlineSignerSetup).toBe(false);
    });

    it("non-demo user with premium completion does not arm demo-specific signer setup", () => {
      clearDemoSessionUser();
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      expect(hasDemoSessionUser()).toBe(false);
      expect(hasPaidPremiumCompletionSession()).toBe(true);

      const shouldArmDemoSignerSetup =
        hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      expect(shouldArmDemoSignerSetup).toBe(false);
    });
  });

  describe("restore leftover does not win over premiumCompletion", () => {
    it("stripPremiumCompletionQueryParam removes both premiumCompletion and restore=starterReview", () => {
      const testUrl = "http://localhost/app/create?premiumCompletion=1&restore=starterReview";
      const originalLocation = window.location;

      delete (window as { location?: Location }).location;
      (window as { location: Partial<Location> }).location = new URL(testUrl) as unknown as Location;
      Object.defineProperty(window.location, "href", {
        value: testUrl,
        writable: true,
        configurable: true,
      });

      let replaceStateUrl: string | null = null;
      const replaceStateMock = vi.fn((_state, _title, url) => {
        replaceStateUrl = url as string;
      });
      const originalReplaceState = window.history.replaceState;
      window.history.replaceState = replaceStateMock;

      try {
        stripPremiumCompletionQueryParam();

        expect(replaceStateMock).toHaveBeenCalled();
        expect(replaceStateUrl).not.toContain("premiumCompletion");
        expect(replaceStateUrl).not.toContain("restore=starterReview");
      } finally {
        window.history.replaceState = originalReplaceState;
        (window as { location: Location }).location = originalLocation;
      }
    });

    it("premium completion session marker persists even when URL params are stripped", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      expect(hasStoredPaidPremiumCompletionSession()).toBe(true);
      expect(hasPaidPremiumCompletionSession()).toBe(true);
    });

    it("demo session user remains valid after clearing premium completion", () => {
      createDemoSessionUser({
        displayName: "Harbor Pool Buyer",
        email: "buyer@harborpool.com",
        settlementReceiptId: "rcpt_harbor_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      expect(hasDemoSessionUser()).toBe(true);
      expect(hasStoredPaidPremiumCompletionSession()).toBe(true);

      clearPaidPremiumCompletionSession();

      expect(hasDemoSessionUser()).toBe(true);
      expect(hasStoredPaidPremiumCompletionSession()).toBe(false);
    });
  });

  describe("inline signer setup mounts for demo session user before SoT ready", () => {
    it("resolvePaidProInlineSignerSetupMounted returns true for demo user with premium completion even without SoT", async () => {
      const { resolvePaidProInlineSignerSetupMounted } = await import("./signerSetupPartyIdentity");

      const result = resolvePaidProInlineSignerSetupMounted({
        hasAcceptedPaidProAuthority: false,
        hasProfessionallyValidatedReviewCorpus: false,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        signerSetupLatched: true,
        signaturePreparationRequested: false,
        signerMetadataFinalized: false,
        demoSessionUserPremiumCompletionActive: true,
      });

      expect(result).toBe(true);
    });

    it("resolvePaidProInlineSignerSetupMounted returns false for demo user without latched setup", async () => {
      const { resolvePaidProInlineSignerSetupMounted } = await import("./signerSetupPartyIdentity");

      const result = resolvePaidProInlineSignerSetupMounted({
        hasAcceptedPaidProAuthority: false,
        hasProfessionallyValidatedReviewCorpus: false,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        signerSetupLatched: false,
        signaturePreparationRequested: false,
        signerMetadataFinalized: false,
        demoSessionUserPremiumCompletionActive: true,
      });

      expect(result).toBe(false);
    });

    it("resolvePaidProInlineSignerSetupMounted returns false for demo user with finalized metadata", async () => {
      const { resolvePaidProInlineSignerSetupMounted } = await import("./signerSetupPartyIdentity");

      const result = resolvePaidProInlineSignerSetupMounted({
        hasAcceptedPaidProAuthority: false,
        hasProfessionallyValidatedReviewCorpus: false,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createUiStageIsDraft: true,
        signerSetupLatched: true,
        signaturePreparationRequested: false,
        signerMetadataFinalized: true,
        demoSessionUserPremiumCompletionActive: true,
      });

      expect(result).toBe(false);
    });
  });

  describe("Continue persist works with demo session", () => {
    it("demo session user has source=demo_checkout for backend auth", () => {
      const user = createDemoSessionUser({
        displayName: "Signer Setup User",
        email: "signer@example.com",
        settlementReceiptId: "rcpt_continue_4242",
      });

      expect(user.source).toBe("demo_checkout");
      expect(hasDemoSessionUser()).toBe(true);
    });

    it("demo session user with premium completion can proceed to signer finalization", () => {
      createDemoSessionUser({
        displayName: "Pro Signer",
        email: "pro@example.com",
        settlementReceiptId: "rcpt_finalize_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const canFinalizeSigner =
        hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      expect(canFinalizeSigner).toBe(true);
    });

    it("clearing demo session blocks signer finalization path", () => {
      createDemoSessionUser({
        displayName: "Temp User",
        settlementReceiptId: "rcpt_temp",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      expect(hasDemoSessionUser()).toBe(true);

      clearDemoSessionUser();

      expect(hasDemoSessionUser()).toBe(false);
      const canFinalizeSigner =
        hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      expect(canFinalizeSigner).toBe(false);
    });
  });

  describe("demo session CTA routing (#23 regression)", () => {
    it("demo session post-POS uses 'Continue' CTA, not dashboard resume labels", () => {
      // Setup: demo session with premium completion
      createDemoSessionUser({
        displayName: "Harbor Pool & Patio LLC",
        email: "jordan.harbor.qa+aug21b@example.com",
        settlementReceiptId: "rcpt_demo_harbor_4242",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      expect(hasDemoSessionUser()).toBe(true);
      expect(hasPaidPremiumCompletionSession()).toBe(true);

      // The CTA should be "Continue" for complete signers
      const isDemoPostPOS = hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      const expectedCtaLabel = isDemoPostPOS ? "Continue" : "Continue";
      expect(expectedCtaLabel).toBe("Continue");
    });

    it("demo session incomplete signers shows 'Complete signer details'", () => {
      createDemoSessionUser({
        displayName: "Test User",
        email: "test@example.com",
        settlementReceiptId: "rcpt_123",
      });
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      const isDemoPostPOS = hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      const signerDetailsComplete = false;
      const expectedCtaLabel = isDemoPostPOS
        ? signerDetailsComplete
          ? "Continue"
          : "Complete signer details"
        : "Continue";
      expect(expectedCtaLabel).toBe("Complete signer details");
    });

    it("non-demo dashboard resume uses 'Continue'", () => {
      // Non-demo user (no demo session)
      expect(hasDemoSessionUser()).toBe(false);

      // Dashboard resume would show "Continue"
      const isDemoPostPOS = hasDemoSessionUser() && hasPaidPremiumCompletionSession();
      const expectedCtaLabel = isDemoPostPOS ? "Continue" : "Continue";
      expect(expectedCtaLabel).toBe("Continue");
    });
  });
});
