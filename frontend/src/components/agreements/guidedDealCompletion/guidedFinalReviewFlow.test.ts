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
    expect(intake).toContain("simpleProFinalReviewActive");
    expect(intake).toContain("SimpleProFinalReviewScreen");
    expect(intake).toContain("!guidedFinalReviewActive");
    expect(intake).toContain('setCreateFlowPhase("guided_final_review")');
    expect(intake).toContain("resetPremiumRecipientsSurfaceForFinalReview");
    expect(intake).toContain("guidedFinalReviewContinueArmedRef");
    expect(intake).toContain("resolveGuidedBulkCommitBody");
    expect(intake).not.toContain("applyProRefineOutputToProSurfaceRef.current?.(stableBefore");
    expect(intake).toContain("guided_final_review_hidden");
    expect(intake).toContain("logSimpleProFinalReviewMounted");
  });

  it("SimpleProFinalReviewScreen exposes final review copy and CTAs", () => {
    const screen = readFileSync(join(__dirname, "../SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("Review your updated Pro agreement");
    expect(screen).toContain("simple-pro-continue-to-signing");
    expect(screen).toContain("simple-pro-copy-agreement");
    expect(screen.replace(/\s+/g, " ")).toContain(
      "Side-by-side redline comparison is not available yet",
    );
    expect(screen).not.toContain('data-testid="pro-review-compare-versions"');
  });
});
