import { describe, expect, it, vi } from "vitest";
import { PREMIUM_POST_CHECKOUT_INFLIGHT_PATIENCE_EXTENDED_MS } from "./postCheckoutModalTimeout";
import {
  PREMIUM_PRO_WAIT_BODY_EXTENDED_WAIT,
  PREMIUM_PRO_WAIT_BODY_PATIENCE_EXTENDED,
  PREMIUM_PRO_WAIT_BODY_PROCESSING,
  PREMIUM_PRO_WAIT_BODY_SOFT_WAIT,
  PREMIUM_PRO_WAIT_REASSURANCE,
  PREMIUM_PRO_WAIT_STALE_COPY_BANS,
  PREMIUM_PAID_CORPUS_REJECTED_BODY,
  PREMIUM_PAID_CORPUS_REJECTED_HEADLINE,
  PREMIUM_NETWORK_RECOVERABLE_HEADLINE,
  PREMIUM_NETWORK_RECOVERABLE_RETRY_LABEL,
  PREMIUM_NETWORK_RECOVERABLE_STARTER_LABEL,
  buildPremiumNetworkRecoverableDebugInfo,
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
  const phases = [
    "processing",
    "soft_wait",
    "extended_wait",
    "patience_extended",
    "terminal_failure",
    "success",
  ] as const;
  return phases
    .map((p) => {
      const v = resolvePremiumProWaitModalView(p);
      return [v.title, v.statusLine, v.reassurance, ...v.progressSteps.map((s) => s.shortLabel)].join(" ");
    })
    .join(" ");
}

describe("premium post-checkout return UX policy", () => {
  it("in-flight request does not trigger modal failopen", () => {
    expect(
      shouldTriggerPremiumModalFailopen({
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: false,
        authoritativeRequestInFlight: true,
      }),
    ).toBe(false);
  });

  it("enters patience extended at 150s in-flight threshold, not at 121s", () => {
    expect(
      shouldEnterPremiumReturnPatienceExtended({
        elapsedMs: 121_383,
        authoritativeRequestInFlight: true,
        hasAcceptedServerFullDraftBody: false,
      }),
    ).toBe(false);
    expect(
      shouldEnterPremiumReturnPatienceExtended({
        elapsedMs: PREMIUM_POST_CHECKOUT_INFLIGHT_PATIENCE_EXTENDED_MS,
        authoritativeRequestInFlight: true,
        hasAcceptedServerFullDraftBody: false,
      }),
    ).toBe(true);
  });

  it("150s in-flight uses patience_extended copy without failure language", () => {
    const phase = resolvePremiumProWaitVisualPhase({
      successFlash: false,
      terminalFailure: false,
      patienceExtended: true,
      softProgress: true,
      extendedWaitCopy: true,
    });
    expect(phase).toBe("patience_extended");
    const view = resolvePremiumProWaitModalView(phase);
    expect(view.title).toMatch(/Finalizing your agreement draft/i);
    expect(view.statusLine).toBe(PREMIUM_PRO_WAIT_BODY_PATIENCE_EXTENDED);
    expect(view.statusLine).toMatch(/still active/i);
    expect(view.statusLine).not.toMatch(/failed|failure|error/i);
    expect(view.showRecoveryActions).toBe(false);
    expect(
      shouldShowPremiumProWaitRecoveryActions({
        visualPhase: phase,
        authoritativeRequestInFlight: true,
      }),
    ).toBe(false);
  });

  it("60s extended_wait uses larger-agreements copy, not failure", () => {
    const phase = resolvePremiumProWaitVisualPhase({
      successFlash: false,
      terminalFailure: false,
      patienceExtended: false,
      softProgress: true,
      extendedWaitCopy: true,
    });
    expect(phase).toBe("extended_wait");
    const view = resolvePremiumProWaitModalView(phase);
    expect(view.title).toMatch(/Still preparing your agreement draft/i);
    expect(view.statusLine).toBe(PREMIUM_PRO_WAIT_BODY_EXTENDED_WAIT);
    expect(view.statusLine).toMatch(/few minutes/i);
    expect(view.showRecoveryActions).toBe(false);
  });

  it("progress pills use workflow labels and do not mark draft done before success", () => {
    const processing = resolvePremiumProWaitModalView("processing");
    expect(processing.progressSteps.map((s) => `${s.shortLabel}:${s.state}`)).toEqual([
      "Terms loaded:active",
      "Pro draft generating:pending",
      "Review checks:pending",
      "Signer setup:pending",
    ]);
    const soft = resolvePremiumProWaitModalView("soft_wait");
    expect(soft.progressSteps[1]).toEqual({ shortLabel: "Pro draft generating", state: "active" });
    expect(soft.progressSteps[1].state).not.toBe("done");
    const extended = resolvePremiumProWaitModalView("extended_wait");
    expect(extended.progressSteps[1].state).toBe("active");
    const labels = processing.progressSteps.map((s) => s.shortLabel).join(" ");
    expect(labels).not.toMatch(/\bPayment\b/);
    expect(labels).not.toContain("Agreement generated");
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
    expect(PREMIUM_NETWORK_RECOVERABLE_RETRY_LABEL).toMatch(/Retry Pro draft/);
    expect(PREMIUM_NETWORK_RECOVERABLE_STARTER_LABEL).toMatch(/Continue with starter draft/i);
  });

  it("network recoverable debug info includes session generation and fingerprint", () => {
    const text = buildPremiumNetworkRecoverableDebugInfo({
      sessionGenerationId: "gen-123",
      intakeFingerprint: "fp-abc",
      agreementId: "agr-1",
      renderSource: "premium_network_retryable",
      phase: "premium_network_recoverable",
    });
    expect(text).toContain("gen-123");
    expect(text).toContain("fp-abc");
    expect(text).toContain("premium_network_recoverable");
    expect(PREMIUM_NETWORK_RECOVERABLE_HEADLINE).toMatch(/payment is confirmed/i);
  });

  it("soft wait keeps processing title and calm non-failure body", () => {
    const soft = resolvePremiumProWaitModalView("soft_wait");
    expect(soft.title).toMatch(/Generating your agreement draft/i);
    expect(soft.statusLine).toBe(PREMIUM_PRO_WAIT_BODY_SOFT_WAIT);
    expect(soft.statusLine).toMatch(/Still working normally/i);
    expect(soft.statusLine).toMatch(/payment is complete/i);
    expect(soft.statusLine).not.toMatch(/failed|failure|error/i);
    expect(soft.showRotatingLines).toBe(false);
  });

  it("success state copy for late apply transition", () => {
    const success = resolvePremiumProWaitModalView("success");
    expect(success.title).toMatch(/Agreement draft ready/i);
    expect(success.statusLine).toMatch(/Opening your review screen/i);
    expect(success.showSpinner).toBe(false);
    expect(success.progressSteps.every((s) => s.state === "done")).toBe(true);
  });

  it("processing uses 1–3 minutes expectation and reassurance", () => {
    const view = resolvePremiumProWaitModalView("processing");
    expect(view.reassurance).toBe(PREMIUM_PRO_WAIT_REASSURANCE);
    expect(view.showRotatingLines).toBe(false);
    expect(view.statusLine).toBe(PREMIUM_PRO_WAIT_BODY_PROCESSING);
    expect(view.statusLine).toMatch(/1–3 minutes/i);
    expect(view.title).toMatch(/Generating your agreement draft/i);
  });

  it("121s in-flight uses soft_wait not terminal failure copy", () => {
    const phase = resolvePremiumProWaitVisualPhase({
      successFlash: false,
      terminalFailure: false,
      patienceExtended: false,
      softProgress: true,
    });
    expect(phase).toBe("soft_wait");
    const view = resolvePremiumProWaitModalView(phase);
    expect(view.title).not.toBe(PREMIUM_PAID_CORPUS_REJECTED_HEADLINE);
    expect(view.showRecoveryActions).toBe(false);
  });

  it("does not include stale awkward wait copy or 15–30 second promise", () => {
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

describe("premium post-checkout wait modal copy contract", () => {
  it("initial copy uses 1–3 minutes", () => {
    const view = resolvePremiumProWaitModalView("processing");
    expect(view.statusLine).toMatch(/1–3 minutes/i);
  });

  it("30s copy is calm and non-failure", () => {
    const view = resolvePremiumProWaitModalView("soft_wait");
    expect(view.statusLine).toMatch(/Still working normally/i);
    expect(`${view.title} ${view.statusLine}`).not.toMatch(/failed|failure|error|couldn't/i);
  });

  it("60s copy says larger agreements can take a few minutes", () => {
    const view = resolvePremiumProWaitModalView("extended_wait");
    expect(view.statusLine).toMatch(/Larger agreements can take a few minutes/i);
  });

  it("in-flight 150s patience copy does not show failure language", () => {
    const view = resolvePremiumProWaitModalView("patience_extended");
    expect(`${view.title} ${view.statusLine}`).not.toMatch(/failed|failure|error|couldn't/i);
    expect(view.showRecoveryActions).toBe(false);
  });

  it("no user-facing wait copy says 15–30 seconds", () => {
    expect(allUserFacingCopy()).not.toMatch(/15[–-]30\s*seconds/i);
  });
});
