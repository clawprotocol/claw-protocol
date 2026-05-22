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
    expect(intake).toContain('setCreateFlowPhase("updated_agreement_ready")');
    expect(intake).toContain("handleGuidedOpenFinalReview");
    const readyCard = readFileSync(
      join(__dirname, "GuidedUpdatedAgreementReadyCard.tsx"),
      "utf8",
    );
    expect(readyCard).toContain("guided-review-updated-agreement-cta");
    expect(intake).toContain("guidedFinalReviewExplicitlyOpened");
    expect(intake).toContain("resetPremiumRecipientsSurfaceForFinalReview");
    expect(intake).toContain("guidedFinalReviewContinueArmedRef");
    expect(intake).toContain("resolveGuidedBulkCommitBody");
    expect(intake).not.toContain("applyProRefineOutputToProSurfaceRef.current?.(stableBefore");
    expect(intake).toContain("guided_final_review_hidden");
    expect(intake).toContain("logSimpleProFinalReviewMounted");
  });

  it("SimpleProFinalReviewScreen exposes final review copy and send CTAs", () => {
    const screen = readFileSync(join(__dirname, "../SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("SIMPLE_PRO_FINAL_REVIEW_HEADLINE");
    expect(screen).toContain("simple-pro-final-review-headline");
    expect(screen).toContain("simple-pro-send-for-signature");
    expect(screen).toContain("simple-pro-send-for-review");
    expect(screen).toContain("simple-pro-copy-agreement");
    expect(screen).toContain("This is the version that will be sent.");
    expect(screen).toContain("Edit agreement text");
    expect(screen).not.toContain("simple-pro-continue-to-signing");
    expect(screen).not.toContain("simple-pro-suggest-changes-toggle");
  });

  it("intake blocks production send during guided_questions_active (test18)", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("guidedProUxSuppressesProductionSendCta");
    expect(intake).toContain("signer_setup_required");
    expect(intake).toContain("resolveGuidedProStickyCta");
    expect(intake).toContain("guided-deal-completion-primary");
    expect(intake).toContain('logGuidedSendCtaBlocked("handOffProductionDraftToRecipients"');
  });

  it("intake wires authoritative final review corpus and send path guards", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("resolveSimpleProFinalReviewCorpus");
    expect(intake).toContain("simpleProFinalReviewHtml");
    expect(intake).toContain("agreementHtml={simpleProFinalReviewHtml}");
    expect(intake).not.toMatch(/simpleProFinalReviewHtml\s*\|\|\s*premiumReadonlyAgreementHtml/);
    expect(intake).toContain("finalReviewAuthorityOnly: simpleProFinalReviewActive");
    expect(intake).toContain("finalReviewSendPathChosenRef");
    expect(intake).toContain("guidedFrozenAfterApplyRef");
    expect(intake).toContain("freezeGuidedSessionAfterApply");
    expect(intake).toContain("handleProSendForReview");
    expect(intake).toContain("premiumRecipientHandoffDebounceRef");
    expect(intake).toContain("logRecipientSetupStableWhileTyping");
    expect(intake).toContain("buildGuidedAppliedSummaryChecklist");
    const corpus = readFileSync(join(__dirname, "../simpleProFinalReviewCorpus.ts"), "utf8");
    expect(corpus).toContain("logFinalReviewAuthoritativeRender");
    expect(corpus).toContain("finalReviewAuthorityOnly");
    expect(intake).toContain("guidedAppliedSummaryChecklist");
    expect(intake).toContain("guidedCompletionFrozen");
    const phase = readFileSync(join(__dirname, "../simpleProFinalReviewPhase.ts"), "utf8");
    expect(phase).toContain("final-review-recipient-phase-blocked");
    expect(intake).toContain("!guidedPreReviewSignerSetupActive");
    expect(intake).toContain("showGuidedPreReviewApplying");
    expect(intake).toContain("logGuidedFinalReviewBlockedSignersIncomplete");
    expect(intake).toContain("evaluateGuidedFinalReviewUnlockGate");
    expect(intake).toContain("guidedFinalReviewExplicitlyUnlockedRef");
  });

  it("test27: signing confirmation screen and logs wired in intake", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("evaluateGuidedSigningPacketGate");
    expect(intake).toContain("signingConfirmationActive: guidedSigningConfirmationActive");
    expect(intake).toContain("!guidedSigningConfirmationActive");
  });

  it("test22: final review unlocks when apply + signers both complete", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("evaluateGuidedFinalReviewUnlockGate");
    expect(intake).toContain("handleGuidedPreReviewContinueToFinalReview");
    expect(intake).toContain("guidedAnswerApplyStatus");
    expect(intake).toContain("resolveGuidedFrozenAnswerCount");
    expect(intake).not.toContain("Applying your 0 answers");
  });
});
