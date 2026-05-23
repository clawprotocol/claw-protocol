import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateGuidedFinalReviewUnlockGate,
  isGuidedFinalReviewTransientApplyNotComplete,
} from "./guidedFinalReviewTransition";
import { resolveGuidedSignerSetupStatus } from "./guidedAnswerApplyOrchestration";
import {
  GUIDED_FINALIZE_IN_FLIGHT_BODY,
  GUIDED_FINALIZE_IN_FLIGHT_TITLE,
  guidedFinalizeModalUsesInFlightCopy,
} from "./guidedFinalizeModal";

describe("guidedFinalReviewTransition (test37)", () => {
  it("does not block unlock on transient apply_not_complete when signers and body are ready", () => {
    const gate = evaluateGuidedFinalReviewUnlockGate({
      applyStatus: "idle",
      signerStatus: resolveGuidedSignerSetupStatus(true),
      authoritativeBodyLen: 3200,
      guidedCompletionPhase: "ready_to_apply",
      guidedSessionComplete: false,
      answeredCount: 0,
    });
    expect(gate.ok).toBe(true);
    expect(gate.reason).toBeNull();
  });

  it("still blocks when signers incomplete", () => {
    const gate = evaluateGuidedFinalReviewUnlockGate({
      applyStatus: "idle",
      signerStatus: resolveGuidedSignerSetupStatus(false),
      authoritativeBodyLen: 3200,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe("signers_incomplete");
  });

  it("classifies transient apply_not_complete for in-flight handling", () => {
    expect(
      isGuidedFinalReviewTransientApplyNotComplete({
        reason: "apply_not_complete",
        signersComplete: true,
        authoritativeBodyLen: 3000,
        applyStatus: "idle",
      }),
    ).toBe(true);
    expect(
      isGuidedFinalReviewTransientApplyNotComplete({
        reason: "signers_incomplete",
        signersComplete: false,
        authoritativeBodyLen: 3000,
        applyStatus: "idle",
      }),
    ).toBe(false);
  });

  it("finalize modal uses in-flight copy instead of Needs your attention", () => {
    expect(guidedFinalizeModalUsesInFlightCopy("finalizing_agreement")).toBe(true);
    expect(GUIDED_FINALIZE_IN_FLIGHT_TITLE).toContain("Finalizing your agreement");
    expect(GUIDED_FINALIZE_IN_FLIGHT_BODY).toMatch(/Applying your answers/i);
  });

  it("intake wires transition dedup, apply await logs, and promise ref", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    const setup = readFileSync(join(__dirname, "guidedSignerSetupToFinalReview.ts"), "utf8");
    expect(intake).toContain("guidedFinalReviewTransitionPromiseRef");
    expect(intake).toContain("logGuidedFinalReviewTransitionDeduped");
    expect(intake).toContain("logGuidedFinalReviewApplyAwaitStart");
    expect(intake).toContain("logGuidedFinalReviewApplyAwaitSuccess");
    expect(intake).toContain("logGuidedFinalReviewApplyAwaitTimeout");
    expect(intake).toContain("isGuidedFinalReviewActionableBlockReason");
    expect(intake).toContain('setGuidedFinalizeModalStage("finalizing_agreement")');
    expect(setup).toContain("[guided-final-review-transition-deduped]");
    expect(setup).toContain("[guided-final-review-apply-await-start]");
  });
});
