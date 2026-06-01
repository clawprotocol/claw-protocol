/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  PAID_PRO_STICKY_REVEAL_SCROLL_PX,
  PAID_PRO_STICKY_REVEAL_SCROLL_RATIO,
  measurePaidProReviewScrollProgress,
  paidProStickyScrollMeetsRevealThreshold,
  resetPaidProStickyCtaDelayedRevealSessionForTests,
  resolvePaidProStickyCtaRevealImmediately,
  resolvePaidProStickyCtaVisuallyRevealed,
  resolvePaidProStickyScrollThresholdPx,
  paidProStickyCtaDelayedRevealSessionActive,
  markPaidProStickyCtaDelayedRevealSession,
  usePaidProStickyCtaDelayedReveal,
} from "./paidProStickyCtaDelayedReveal";

describe("paidProStickyCtaDelayedReveal", () => {
  afterEach(() => {
    resetPaidProStickyCtaDelayedRevealSessionForTests();
  });

  it("uses the earlier of 160px or 15% scroll span as reveal threshold", () => {
    expect(resolvePaidProStickyScrollThresholdPx(2000)).toBe(PAID_PRO_STICKY_REVEAL_SCROLL_PX);
    expect(resolvePaidProStickyScrollThresholdPx(800)).toBe(
      Math.floor(800 * PAID_PRO_STICKY_REVEAL_SCROLL_RATIO),
    );
    expect(paidProStickyScrollMeetsRevealThreshold({ scrolledPx: 159, reviewScrollSpanPx: 2000 })).toBe(
      false,
    );
    expect(paidProStickyScrollMeetsRevealThreshold({ scrolledPx: 160, reviewScrollSpanPx: 2000 })).toBe(
      true,
    );
  });

  it("reveals immediately during signer setup, completion, signing prep, recovery, and mobile", () => {
    expect(
      resolvePaidProStickyCtaRevealImmediately({
        signerSetupPanelActive: true,
        signerFieldsActive: false,
        signerDetailsComplete: false,
        stickyPhase: "signer_details_required",
        signaturePreparationRequested: false,
        recoveryOrRetryActive: false,
        isMobileViewport: false,
      }),
    ).toBe(true);
    expect(
      resolvePaidProStickyCtaRevealImmediately({
        signerSetupPanelActive: false,
        signerFieldsActive: false,
        signerDetailsComplete: true,
        stickyPhase: "signer_details_required",
        signaturePreparationRequested: false,
        recoveryOrRetryActive: false,
        isMobileViewport: false,
      }),
    ).toBe(true);
    expect(
      resolvePaidProStickyCtaRevealImmediately({
        signerSetupPanelActive: false,
        signerFieldsActive: false,
        signerDetailsComplete: false,
        stickyPhase: "prepare_signing",
        signaturePreparationRequested: false,
        recoveryOrRetryActive: false,
        isMobileViewport: false,
      }),
    ).toBe(true);
    expect(
      resolvePaidProStickyCtaRevealImmediately({
        signerSetupPanelActive: false,
        signerFieldsActive: false,
        signerDetailsComplete: false,
        stickyPhase: "signer_details_required",
        signaturePreparationRequested: false,
        recoveryOrRetryActive: true,
        isMobileViewport: false,
      }),
    ).toBe(true);
    expect(
      resolvePaidProStickyCtaRevealImmediately({
        signerSetupPanelActive: false,
        signerFieldsActive: false,
        signerDetailsComplete: false,
        stickyPhase: "signer_details_required",
        signaturePreparationRequested: false,
        recoveryOrRetryActive: false,
        isMobileViewport: true,
      }),
    ).toBe(true);
    expect(
      resolvePaidProStickyCtaRevealImmediately({
        signerSetupPanelActive: false,
        signerFieldsActive: false,
        signerDetailsComplete: false,
        stickyPhase: "signer_details_required",
        signaturePreparationRequested: false,
        recoveryOrRetryActive: false,
        isMobileViewport: false,
      }),
    ).toBe(false);
  });

  it("stays revealed for the session once scroll threshold is met", () => {
    expect(
      resolvePaidProStickyCtaVisuallyRevealed({
        sessionRevealed: false,
        scrollRevealed: false,
        forceImmediate: false,
      }),
    ).toBe(false);
    markPaidProStickyCtaDelayedRevealSession();
    expect(paidProStickyCtaDelayedRevealSessionActive()).toBe(true);
    expect(
      resolvePaidProStickyCtaVisuallyRevealed({
        sessionRevealed: true,
        scrollRevealed: false,
        forceImmediate: false,
      }),
    ).toBe(true);
  });

  it("measures scroll progress from overflow review container in jsdom", () => {
    document.body.innerHTML = `
      <div id="claw-simple-create-preview" style="height:400px;overflow:auto">
        <div id="simple-pro-final-review-screen" style="height:1200px"></div>
      </div>
    `;
    const preview = document.getElementById("claw-simple-create-preview")!;
    Object.defineProperty(preview, "scrollHeight", { value: 1200, configurable: true });
    Object.defineProperty(preview, "clientHeight", { value: 400, configurable: true });
    preview.scrollTop = 200;
    const progress = measurePaidProReviewScrollProgress();
    expect(progress.scrolledPx).toBe(200);
    expect(progress.thresholdPx).toBe(Math.min(160, Math.floor(800 * PAID_PRO_STICKY_REVEAL_SCROLL_RATIO)));
  });

  it("hook starts hidden on initial review then reveals after scroll threshold", () => {
    document.body.innerHTML = `<div id="claw-simple-create-preview" style="height:400px;overflow:auto">
      <div style="height:2000px"></div>
    </div>`;
    const preview = document.getElementById("claw-simple-create-preview")!;
    Object.defineProperty(preview, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(preview, "clientHeight", { value: 400, configurable: true });

    const { result } = renderHook(() =>
      usePaidProStickyCtaDelayedReveal({ enabled: true, forceImmediate: false }),
    );
    expect(result.current.visuallyRevealed).toBe(false);
    act(() => {
      preview.scrollTop = 180;
      preview.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.visuallyRevealed).toBe(true);
  });

  it("hook reveals immediately when forceImmediate is set", () => {
    const { result } = renderHook(() =>
      usePaidProStickyCtaDelayedReveal({ enabled: true, forceImmediate: true }),
    );
    expect(result.current.visuallyRevealed).toBe(true);
  });

  it("intake wires delayed reveal hook and data attribute on utility sticky bar", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("usePaidProStickyCtaDelayedReveal");
    expect(intake).toContain("data-paid-pro-sticky-cta-revealed");
    expect(intake).toContain("PAID_PRO_REVIEW_STICKY_HIDDEN_VISUAL_CLASS");
    expect(intake).toContain("attachPaidProStickyBar");
  });
});
