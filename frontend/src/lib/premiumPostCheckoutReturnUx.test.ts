import { describe, expect, it, vi } from "vitest";
import { PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS } from "./postCheckoutModalTimeout";
import {
  PREMIUM_PRO_WAIT_REASSURANCE,
  PREMIUM_PRO_WAIT_STALE_COPY_BANS,
  PREMIUM_PAID_CORPUS_REJECTED_BODY,
  PREMIUM_PAID_CORPUS_REJECTED_HEADLINE,
  PREMIUM_RETURN_RETRY_GENERATION_LABEL,
  PREMIUM_RETURN_USE_STARTER_LABEL,
  logPremiumProWaitCopyRotated,
  logPremiumProWaitSuccessTransition,
  logPremiumProWaitView,
  resolvePremiumProWaitModalView,
  resolvePremiumProWaitVisualPhase,
  shouldEnterPremiumReturnPatienceExtended,
  shouldLogPremiumReturnLateSuccess,
  shouldShowPremiumProWaitRecoveryActions,
  shouldTriggerPremiumModalFailopen,
} from "./premiumPostCheckoutReturnUx";

function allUserFacingCopy(): string {
  const phases = ["processing", "soft_wait", "extended_wait", "terminal_failure", "success"] as const;
  return phases
    .map((p) => {
      const v = resolvePremiumProWaitModalView(p);
      return [v.title, v.statusLine, v.reassurance, ...v.progressSteps.map((s) => s.shortLabel)].join(" ");
    })
    .join(" ");
}

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
    expect(view.title).toMatch(/Big agreement/i);
    expect(view.showRecoveryActions).toBe(false);
    expect(
      shouldShowPremiumProWaitRecoveryActions({
        visualPhase: phase,
        authoritativeRequestInFlight: true,
      }),
    ).toBe(false);
    expect(view.reassurance).toBe(PREMIUM_PRO_WAIT_REASSURANCE);
  });

  it("progress pills use Upgrade and Terms loaded, not Payment", () => {
    const view = resolvePremiumProWaitModalView("processing");
    const labels = view.progressSteps.map((s) => s.shortLabel).join(" ");
    expect(labels).toContain("Upgrade");
    expect(labels).toContain("Terms loaded");
    expect(labels).not.toMatch(/\bPayment\b/);
  });

  it("terminal failure uses paid corpus rejected copy", () => {
    const view = resolvePremiumProWaitModalView("terminal_failure");
    expect(view.title).toBe(PREMIUM_PAID_CORPUS_REJECTED_HEADLINE);
    expect(view.statusLine).toBe(PREMIUM_PAID_CORPUS_REJECTED_BODY);
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

  it("soft wait uses warmer building headline without finishing copy", () => {
    const soft = resolvePremiumProWaitModalView("soft_wait");
    expect(soft.title).toMatch(/Still building/i);
    expect(soft.title).not.toMatch(/Still finishing/i);
    expect(soft.showRotatingLines).toBe(true);
    expect(soft.statusLine).toBeNull();
  });

  it("success state copy for late apply transition", () => {
    const success = resolvePremiumProWaitModalView("success");
    expect(success.title).toMatch(/Pro agreement ready/i);
    expect(success.statusLine).toMatch(/Opening your review screen/i);
    expect(success.showSpinner).toBe(false);
  });

  it("processing shows one reassurance line and rotating status", () => {
    const view = resolvePremiumProWaitModalView("processing");
    expect(view.reassurance).toBe(PREMIUM_PRO_WAIT_REASSURANCE);
    expect(view.showRotatingLines).toBe(true);
    expect(view.statusLine).toBeNull();
  });

  it("does not include stale awkward wait copy", () => {
    const bundle = allUserFacingCopy().toLowerCase();
    for (const banned of PREMIUM_PRO_WAIT_STALE_COPY_BANS) {
      expect(bundle).not.toContain(banned.toLowerCase());
    }
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

  it("logs wait view phase", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumProWaitView("soft_wait");
    expect(spy).toHaveBeenCalledWith("[premium-pro-wait-view]", { phase: "soft_wait" });
    spy.mockRestore();
  });

  it("logs copy rotation only in dev", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumProWaitCopyRotated("Organizing the bones.");
    if (import.meta.env.DEV) {
      expect(spy).toHaveBeenCalledWith("[premium-pro-wait-copy-rotated]", {
        line: "Organizing the bones.",
      });
    } else {
      expect(spy).not.toHaveBeenCalled();
    }
    spy.mockRestore();
  });
});
