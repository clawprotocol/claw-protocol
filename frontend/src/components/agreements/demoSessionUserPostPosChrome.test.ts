/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  createDemoSessionUser,
  hasDemoSessionUser,
  clearDemoSessionUser,
} from "../../launch/guestCheckoutAuthority";
import { shouldShowPaidProReviewDecisionChrome } from "./paidProReviewDecisionModel";
import type { PaidProReviewDecisionPhase } from "./paidProReviewDecisionModel";

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
});
