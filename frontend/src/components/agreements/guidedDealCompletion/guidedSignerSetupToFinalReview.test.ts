import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  evaluateGuidedSignerSetupContinueReadiness,
  isGuidedSignerSetupContinueToFinalReviewReason,
  userMessageForGuidedSignerSetupContinueBlock,
  resolveGuidedFinalizeModalBlockedPresentation,
} from "./guidedSignerSetupToFinalReview";

describe("guidedSignerSetupToFinalReview", () => {
  it("allows continue when applied, signers complete, corpus present, no reviewId required", () => {
    const ready = evaluateGuidedSignerSetupContinueReadiness({
      applyStatus: "applied",
      signersComplete: true,
      authoritativeBodyLen: 1200,
    });
    expect(ready.ok).toBe(true);
    expect(ready.reason).toBeNull();
  });

  it("blocks with user-facing copy when signers incomplete", () => {
    const blocked = evaluateGuidedSignerSetupContinueReadiness({
      applyStatus: "applied",
      signersComplete: false,
      authoritativeBodyLen: 1200,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("signers_incomplete");
    expect(userMessageForGuidedSignerSetupContinueBlock("signers_incomplete")).toMatch(/signer/i);
  });

  it("blocks refine in flight", () => {
    const blocked = evaluateGuidedSignerSetupContinueReadiness({
      applyStatus: "applied",
      signersComplete: true,
      authoritativeBodyLen: 1200,
      refineInFlight: true,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("refine_in_flight");
  });

  it("recognizes all guided_continue final-review reasons", () => {
    expect(isGuidedSignerSetupContinueToFinalReviewReason("signer_setup_ready_final_review")).toBe(true);
    expect(isGuidedSignerSetupContinueToFinalReviewReason("guided_apply_failed_retry")).toBe(true);
    expect(isGuidedSignerSetupContinueToFinalReviewReason("guided_final_review_inline_cta")).toBe(true);
    expect(isGuidedSignerSetupContinueToFinalReviewReason("updated_agreement_ready")).toBe(true);
    expect(isGuidedSignerSetupContinueToFinalReviewReason("guided_apply_in_progress")).toBe(false);
  });

  it("intake wires canonical continueGuidedSignerSetupToFinalReview with transition logs", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    const logs = readFileSync(join(__dirname, "guidedSignerSetupToFinalReview.ts"), "utf8");
    expect(intake).toContain("continueGuidedSignerSetupToFinalReview");
    expect(intake).toContain("logGuidedFinalReviewCtaClick");
    expect(intake).toContain("logGuidedFinalReviewTransitionStart");
    expect(intake).toContain("logGuidedFinalReviewTransitionComplete");
    expect(intake).toContain("logGuidedFinalReviewTransitionSuccess");
    expect(intake).toContain("logGuidedFinalReviewTransitionFailure");
    expect(intake).toContain("logGuidedFinalReviewTransitionBlocked");
    expect(logs).toContain("[guided-final-review-cta-click]");
    expect(logs).toContain("[guided-final-review-cta-route]");
    expect(logs).toContain("[guided-final-review-transition-start]");
    expect(logs).toContain("[guided-final-review-transition-complete]");
    expect(logs).toContain("[guided-final-review-transition-success]");
    expect(logs).toContain("[guided-final-review-transition-failure]");
    expect(logs).toContain("[guided-final-review-transition-blocked]");
    expect(logs).toContain("[guided-final-review-transition-deduped]");
    expect(intake).toContain("logGuidedFinalizeModalEnter");
    expect(intake).toContain('setCreateFlowPhase("guided_final_review")');
    expect(intake).toContain("resolveGuidedAnswerApplyStatus");
    expect(intake).not.toContain("handleGuidedPreReviewContinueToFinalReview");
    const inlineBranch = intake.slice(
      intake.indexOf("guided_final_review_inline_cta"),
      intake.indexOf("guided_final_review_inline_cta") + 400,
    );
    expect(inlineBranch).toContain("guidedEarlySticky");
    expect(inlineBranch).not.toMatch(/disabled:\s*true,\s*\n\s*reason:\s*"guided_final_review_inline_cta"/);
  });

  it("valid signer manifest + transient apply must not use actionable blocked modal path", () => {
    const logs = readFileSync(join(__dirname, "guidedSignerSetupToFinalReview.ts"), "utf8");
    expect(logs).toContain("isGuidedFinalReviewActionableBlockReason");
    expect(logs).not.toContain('case "apply_not_complete": return "Needs your attention"');
  });

  it("test41: preparing modal has no Try again CTA when working draft exists", () => {
    const modal = resolveGuidedFinalizeModalBlockedPresentation({
      reason: "guided_validation_incomplete",
      workingDraftLen: 2982,
    });
    expect(modal.headline).toBe("Preparing final review.");
    expect(modal.ctaLabel).toBeNull();
  });

  it("test41: internal stabilization uses neutral copy and preserves signer state", () => {
    const modal = resolveGuidedFinalizeModalBlockedPresentation({
      reason: "guided_validation_incomplete",
      workingDraftLen: 900,
      validationMissing: ["saas_sla"],
    });
    expect(modal.headline).toBe("Optimizing agreement structure.");
    expect(modal.body).not.toMatch(/Net\s*30/i);
    expect(modal.body).not.toMatch(/could not finish|another pass|retry final review/i);
    expect(modal.ctaLabel).toBeNull();
    expect(modal.kind).toBe("still_preparing");
    expect(modal.footnote).toMatch(/signer details are saved/i);
  });
});
