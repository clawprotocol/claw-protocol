import { describe, expect, it, vi } from "vitest";
import { PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS } from "./postCheckoutModalTimeout";
import {
  PREMIUM_RETURN_RETRY_GENERATION_LABEL,
  PREMIUM_RETURN_USE_STARTER_LABEL,
  logPremiumProWaitSuccessTransition,
  resolvePremiumProWaitModalView,
  resolvePremiumProWaitVisualPhase,
  shouldEnterPremiumReturnPatienceExtended,
  shouldLogPremiumReturnLateSuccess,
  shouldShowPremiumProWaitRecoveryActions,
  shouldTriggerPremiumModalFailopen,
} from "./premiumPostCheckoutReturnUx";

describe("premium post-checkout return UX policy", () => {
  it("120s hard ceiling while request in flight does not trigger modal failopen", () => {
    expect(
      shouldTriggerPremiumModalFailopen({
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: false,
        authoritativeRequestInFlight: true,
      }),
    ).toBe(false);
  });

  it("enters patience extended state at hard ceiling when request still in flight", () => {
    expect(
      shouldEnterPremiumReturnPatienceExtended({
        elapsedMs: PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
        authoritativeRequestInFlight: true,
        hasAcceptedServerFullDraftBody: false,
      }),
    ).toBe(true);
  });

  it("extended wait is not failure and hides recovery while in flight", () => {
    const phase = resolvePremiumProWaitVisualPhase({
      successFlash: false,
      terminalFailure: false,
      patienceExtended: true,
      softProgress: true,
    });
    expect(phase).toBe("extended_wait");
    const view = resolvePremiumProWaitModalView(phase);
    expect(view.title).toMatch(/Large agreement/i);
    expect(view.showRecoveryActions).toBe(false);
    expect(
      shouldShowPremiumProWaitRecoveryActions({
        visualPhase: phase,
        authoritativeRequestInFlight: true,
      }),
    ).toBe(false);
    expect(view.reassurance).toContain("Nothing is sent, signed, or shared until you confirm");
  });

  it("terminal failure shows recovery when request is not in flight", () => {
    const view = resolvePremiumProWaitModalView("terminal_failure");
    expect(view.showRecoveryActions).toBe(true);
    expect(
      shouldShowPremiumProWaitRecoveryActions({
        visualPhase: "terminal_failure",
        authoritativeRequestInFlight: false,
      }),
    ).toBe(true);
    expect(PREMIUM_RETURN_RETRY_GENERATION_LABEL).toMatch(/Retry Pro generation/);
    expect(PREMIUM_RETURN_USE_STARTER_LABEL).toMatch(/Use current draft/i);
  });

  it("soft wait evolves title without switching to finishing copy", () => {
    const soft = resolvePremiumProWaitModalView("soft_wait");
    expect(soft.title).toMatch(/Still building/i);
    expect(soft.title).not.toMatch(/Still finishing/i);
    expect(soft.showRotatingLines).toBe(true);
  });

  it("success state copy for late apply transition", () => {
    const success = resolvePremiumProWaitModalView("success");
    expect(success.title).toMatch(/Pro agreement ready/i);
    expect(success.body).toMatch(/Opening your review screen/i);
    expect(success.showSpinner).toBe(false);
  });

  it("late success log applies after patience extended without terminal failopen", () => {
    expect(
      shouldLogPremiumReturnLateSuccess({
        hardFailopenWasActive: false,
        patienceExtendedWasActive: true,
      }),
    ).toBe(true);
  });

  it("logs success transition marker", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumProWaitSuccessTransition();
    expect(spy).toHaveBeenCalledWith("[premium-pro-wait-success-transition]");
    spy.mockRestore();
  });
});
