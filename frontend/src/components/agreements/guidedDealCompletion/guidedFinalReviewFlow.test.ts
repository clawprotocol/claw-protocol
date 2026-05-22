import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isGuidedFinalReviewPhase } from "../createFlowTypes";
import { deriveGuidedUxPhaseFlags } from "./guidedUxStability";
import { resolveProReviewActiveStep } from "../ProReviewStepIndicator";

describe("guided final review flow", () => {
  it("isGuidedFinalReviewPhase recognizes guided_final_review", () => {
    expect(isGuidedFinalReviewPhase("guided_final_review")).toBe(true);
    expect(isGuidedFinalReviewPhase("recipient_setup_required")).toBe(false);
  });

  it("deriveGuidedUxPhaseFlags marks review ready after apply without active question panel", () => {
    const flags = deriveGuidedUxPhaseFlags({
      showPrimaryGuided: false,
      hasSession: true,
      phase: "applied",
      hasAuthoritativeSummary: true,
      guidedFinalReview: true,
    });
    expect(flags.guidedReviewReady).toBe(true);
    expect(flags.guidedUpdated).toBe(true);
    expect(flags.guidedQueued).toBe(false);
  });

  it("resolveProReviewActiveStep stays on review_draft during final review", () => {
    expect(
      resolveProReviewActiveStep({
        guidedCompletionActive: false,
        guidedPhase: "applied",
        guidedFinalReview: true,
        signersReady: false,
        packetPrepared: false,
      }),
    ).toBe("review_draft");
  });

  it("intake hides recipient setup during guided final review", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("guidedFinalReviewActive");
    expect(intake).toContain("!guidedFinalReviewActive");
    expect(intake).toContain('setCreateFlowPhase("guided_final_review")');
    expect(intake).toContain("finalReviewMoment={guidedFinalReviewActive}");
  });

  it("ProReviewSigningFlowPanel exposes final review copy", () => {
    const panel = readFileSync(join(__dirname, "../ProReviewSigningFlowPanel.tsx"), "utf8");
    expect(panel).toContain("Your agreement is ready to review");
    expect(panel).toContain("Suggest changes before sending");
  });
});
