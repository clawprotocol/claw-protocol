/** @vitest-environment jsdom */
/**
 * After-pay handoff: verify 200 + premiumCompletion (or checkout_session_id) starts Pro generation.
 * Must not require the demo-only checkout grant, and must not treat that as Retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { peekAdvancedFullDraftCheckoutGrant } from "../components/agreements/agreementAdvancedDraftAccess";
import {
  clearPaidPremiumCompletionSession,
  hasPaidPremiumCompletionSession,
} from "../components/agreements/premiumCompletionStorage";
import { setOrgId } from "./orgContext";
import {
  handleCheckoutReturnEntitlement,
  isAfterPayPremiumCompletionReturn,
  shouldRefuseAfterPayPremiumCompletionForMissingGrant,
  type AfterPayHandoffSignals,
} from "./checkoutReturnEntitlement";

const stripeReturn = (over: Partial<AfterPayHandoffSignals> = {}): AfterPayHandoffSignals => ({
  premiumCompletionInUrl: true,
  checkoutSessionId: "cs_test_a1tfvd12sloPecj8WZjfDjA3B3JPGc2ogj8gPkrxT51EdRs3D9KXdYEVgO",
  hasPaidSession: false,
  hasCheckoutGrant: false,
  awaitingProCheckoutResume: true,
  ...over,
});

describe("after-pay verify → Pro generation handoff", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPaidPremiumCompletionSession();
    setOrgId("user-83caa7c7");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
    clearPaidPremiumCompletionSession();
  });

  it("premiumCompletion=1 without demo grant is an after-pay return, not a refuse", () => {
    const s = stripeReturn({ hasCheckoutGrant: false });
    expect(isAfterPayPremiumCompletionReturn(s)).toBe(true);
    expect(shouldRefuseAfterPayPremiumCompletionForMissingGrant(s)).toBe(false);
  });

  it("checkout_session_id after premiumCompletion was stripped still enters Pro generation", () => {
    const s = stripeReturn({
      premiumCompletionInUrl: false,
      hasCheckoutGrant: false,
      hasPaidSession: false,
    });
    expect(isAfterPayPremiumCompletionReturn(s)).toBe(true);
    expect(shouldRefuseAfterPayPremiumCompletionForMissingGrant(s)).toBe(false);
  });

  it("lone leftover checkout_session_id without resume/session/grant does not start Pro generation", () => {
    const s = stripeReturn({
      premiumCompletionInUrl: false,
      hasCheckoutGrant: false,
      hasPaidSession: false,
      awaitingProCheckoutResume: false,
    });
    expect(isAfterPayPremiumCompletionReturn(s)).toBe(false);
    expect(shouldRefuseAfterPayPremiumCompletionForMissingGrant(s)).toBe(false);
  });

  it("verify 200 marks paid session + grant so remount does not land on Retry", async () => {
    Object.defineProperty(window, "location", {
      value: {
        href: "https://lawdog.test/app/create?premiumCompletion=1&checkout_session_id=cs_test_after_pay",
        origin: "https://lawdog.test",
      },
      writable: true,
      configurable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("verify-checkout-session")) {
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                ok: true,
                agreement_id: "dd37f0e4-feba-42e5-bb37-713218aaf346",
                subscription: { plan_code: "pro", status: "active" },
              }),
          };
        }
        return { ok: false, status: 404, text: async () => "not found" };
      }),
    );

    const ok = await handleCheckoutReturnEntitlement();
    expect(ok).toBe(true);
    expect(hasPaidPremiumCompletionSession()).toBe(true);
    expect(peekAdvancedFullDraftCheckoutGrant()).toBe(true);
    expect(sessionStorage.getItem("claw_agreement_create_review_resume_v1")).toBe(
      "dd37f0e4-feba-42e5-bb37-713218aaf346",
    );
    expect(
      shouldRefuseAfterPayPremiumCompletionForMissingGrant({
        premiumCompletionInUrl: false,
        checkoutSessionId: "cs_test_after_pay",
        hasPaidSession: hasPaidPremiumCompletionSession(),
        hasCheckoutGrant: peekAdvancedFullDraftCheckoutGrant(),
        awaitingProCheckoutResume: true,
      }),
    ).toBe(false);
  });

  it("demo grant+resume without Stripe URL still enters (last-good bypass path)", () => {
    const s: AfterPayHandoffSignals = {
      premiumCompletionInUrl: false,
      checkoutSessionId: null,
      hasPaidSession: false,
      hasCheckoutGrant: true,
      awaitingProCheckoutResume: true,
    };
    expect(isAfterPayPremiumCompletionReturn(s)).toBe(true);
    expect(shouldRefuseAfterPayPremiumCompletionForMissingGrant(s)).toBe(false);
  });

  it("unrelated create mount without after-pay signals does not enter generation", () => {
    const s: AfterPayHandoffSignals = {
      premiumCompletionInUrl: false,
      checkoutSessionId: null,
      hasPaidSession: false,
      hasCheckoutGrant: false,
      awaitingProCheckoutResume: false,
    };
    expect(isAfterPayPremiumCompletionReturn(s)).toBe(false);
    expect(shouldRefuseAfterPayPremiumCompletionForMissingGrant(s)).toBe(false);
  });
});

describe("after-pay intake wiring (static)", () => {
  const intake = readFileSync(
    join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
    "utf8",
  );
  const checkout = readFileSync(join(__dirname, "simpleProduct/SimpleCheckoutPage.tsx"), "utf8");
  const reset = readFileSync(join(__dirname, "newAgreementSessionReset.ts"), "utf8");

  it("post-checkout effect awaits verify and does not strip premiumCompletion for missing demo grant on Stripe return", () => {
    const effectIdx = intake.indexOf("After create-flow checkout: premium completion");
    expect(effectIdx).toBeGreaterThan(-1);
    const effect = intake.slice(effectIdx, intake.indexOf("const upgradeContextReasons", effectIdx));
    expect(effect).toContain("isAfterPayPremiumCompletionReturn");
    expect(effect).toContain("shouldRefuseAfterPayPremiumCompletionForMissingGrant");
    expect(effect).toContain("handleCheckoutReturnEntitlement");
    expect(effect).toContain("markAdvancedFullDraftCheckoutGranted");
    expect(effect).toContain("checkout_session_id");
    const refuseIdx = effect.indexOf("shouldRefuseAfterPayPremiumCompletionForMissingGrant(afterPaySignals)");
    expect(refuseIdx).toBeGreaterThan(-1);
    const verifyIdx = effect.indexOf("handleCheckoutReturnEntitlement");
    expect(verifyIdx).toBeGreaterThan(refuseIdx);
  });

  it("Stripe start marks the same-tab grant before leaving for Checkout", () => {
    const startIdx = checkout.indexOf("async function startStripeCheckout");
    expect(startIdx).toBeGreaterThan(-1);
    const startBody = checkout.slice(startIdx, startIdx + 2400);
    expect(startBody).toContain("markAdvancedFullDraftCheckoutGranted()");
    expect(startBody).toContain("window.location.assign(session.checkout_url)");
    expect(startBody.indexOf("markAdvancedFullDraftCheckoutGranted()")).toBeLessThan(
      startBody.indexOf("window.location.assign(session.checkout_url)"),
    );
  });

  it("direct-entry bootstrap does not wipe after-pay when only checkout_session_id remains", () => {
    expect(reset).toContain("readCheckoutSessionIdFromUrl()");
    const boot = reset.slice(
      reset.indexOf("export function bootstrapDirectAuthenticatedCreateEntryIfNeeded"),
      reset.indexOf("export function bootstrapDirectAuthenticatedCreateEntryIfNeeded") + 1800,
    );
    expect(boot).toContain('reason: "checkout_return"');
    expect(boot).toContain("readCheckoutSessionIdFromUrl()");
  });
});
