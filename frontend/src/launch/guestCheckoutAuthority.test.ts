/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  markGuestCheckoutAuthority,
  readGuestCheckoutAuthority,
  hasGuestCheckoutAuthority,
  isGuestCheckoutAuthorityActiveForPath,
  clearGuestCheckoutAuthority,
  createDemoSessionUser,
  readDemoSessionUser,
  hasDemoSessionUser,
  clearDemoSessionUser,
  clearAllGuestCheckoutAuthorities,
} from "./guestCheckoutAuthority";

describe("guestCheckoutAuthority", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("guest checkout authority", () => {
    it("marks and reads guest checkout authority", () => {
      expect(hasGuestCheckoutAuthority()).toBe(false);
      markGuestCheckoutAuthority("/app/checkout/__claw_create_checkout__");
      expect(hasGuestCheckoutAuthority()).toBe(true);
      const marker = readGuestCheckoutAuthority();
      expect(marker).not.toBeNull();
      expect(marker?.origin).toBe("starter_pro_checkout");
      expect(marker?.targetPath).toBe("/app/checkout/__claw_create_checkout__");
    });

    it("clears guest checkout authority", () => {
      markGuestCheckoutAuthority("/app/checkout/__claw_create_checkout__");
      expect(hasGuestCheckoutAuthority()).toBe(true);
      clearGuestCheckoutAuthority();
      expect(hasGuestCheckoutAuthority()).toBe(false);
    });

    it("requires history state for authority to be active", () => {
      markGuestCheckoutAuthority("/app/checkout/__claw_create_checkout__");
      expect(isGuestCheckoutAuthorityActiveForPath("/app/checkout/__claw_create_checkout__")).toBe(false);
      window.history.replaceState({ clawGuestCheckout: true }, "");
      expect(isGuestCheckoutAuthorityActiveForPath("/app/checkout/__claw_create_checkout__")).toBe(true);
    });

    it("rejects mismatched path", () => {
      markGuestCheckoutAuthority("/app/checkout/__claw_create_checkout__");
      window.history.replaceState({ clawGuestCheckout: true }, "");
      expect(isGuestCheckoutAuthorityActiveForPath("/app/checkout/other")).toBe(false);
    });

    it("rejects non-create checkout paths", () => {
      markGuestCheckoutAuthority("/app/checkout/some-agreement-id");
      window.history.replaceState({ clawGuestCheckout: true }, "");
      expect(isGuestCheckoutAuthorityActiveForPath("/app/checkout/some-agreement-id")).toBe(false);
    });
  });

  describe("demo session user", () => {
    it("creates and reads demo session user", () => {
      expect(hasDemoSessionUser()).toBe(false);
      const user = createDemoSessionUser({
        displayName: "Test User",
        email: "test@example.com",
        settlementReceiptId: "rcpt_123",
      });
      expect(hasDemoSessionUser()).toBe(true);
      expect(user.displayName).toBe("Test User");
      expect(user.email).toBe("test@example.com");
      expect(user.settlementReceiptId).toBe("rcpt_123");
      expect(user.source).toBe("demo_checkout");

      const readUser = readDemoSessionUser();
      expect(readUser).not.toBeNull();
      expect(readUser?.id).toBe(user.id);
      expect(readUser?.displayName).toBe("Test User");
    });

    it("defaults display name to Pro User when empty", () => {
      const user = createDemoSessionUser({
        displayName: "",
        settlementReceiptId: "rcpt_123",
      });
      expect(user.displayName).toBe("Pro User");
    });

    it("clears guest checkout authority when creating demo session user", () => {
      markGuestCheckoutAuthority("/app/checkout/__claw_create_checkout__");
      expect(hasGuestCheckoutAuthority()).toBe(true);
      createDemoSessionUser({
        displayName: "Test User",
        settlementReceiptId: "rcpt_123",
      });
      expect(hasGuestCheckoutAuthority()).toBe(false);
    });

    it("clears demo session user", () => {
      createDemoSessionUser({
        displayName: "Test User",
        settlementReceiptId: "rcpt_123",
      });
      expect(hasDemoSessionUser()).toBe(true);
      clearDemoSessionUser();
      expect(hasDemoSessionUser()).toBe(false);
    });

    it("keeps the checkout-created LawDog user across a fresh tab (sessionStorage empty)", () => {
      const user = createDemoSessionUser({
        displayName: "Paid LawDog",
        email: "payer@example.com",
        settlementReceiptId: "rcpt_dashboard_4242_abcd",
      });
      expect(localStorage.getItem("claw_demo_session_user_v1")).toContain("rcpt_dashboard_4242_abcd");
      sessionStorage.clear();
      expect(hasDemoSessionUser()).toBe(true);
      const readUser = readDemoSessionUser();
      expect(readUser?.id).toBe(user.id);
      expect(readUser?.settlementReceiptId).toBe("rcpt_dashboard_4242_abcd");
      expect(readUser?.email).toBe("payer@example.com");
    });
  });

  describe("clearAllGuestCheckoutAuthorities", () => {
    it("clears both guest checkout authority and demo session user", () => {
      markGuestCheckoutAuthority("/app/checkout/__claw_create_checkout__");
      createDemoSessionUser({
        displayName: "Test User",
        settlementReceiptId: "rcpt_123",
      });
      expect(hasGuestCheckoutAuthority()).toBe(false);
      expect(hasDemoSessionUser()).toBe(true);

      clearAllGuestCheckoutAuthorities();
      expect(hasGuestCheckoutAuthority()).toBe(false);
      expect(hasDemoSessionUser()).toBe(false);
    });
  });
});
