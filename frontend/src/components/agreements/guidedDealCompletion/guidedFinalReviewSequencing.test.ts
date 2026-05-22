import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveGuidedSignerSetupStickyCta,
  resolveGuidedSignerSetupStatus,
} from "./guidedAnswerApplyOrchestration";
import {
  evaluateGuidedFinalReviewUnlockGate,
  resolveGuidedFinalReviewCtaVisibility,
  isGuidedContinueToFinalReviewCta,
  SIMPLE_PRO_FINAL_REVIEW_HEADLINE,
} from "./guidedFinalReviewTransition";
import {
  resolveGuidedProStickyCta,
  resolveGuidedProUxState,
  shouldAutoOpenGuidedFinalReviewAfterApply,
} from "./guidedProUxState";
import { resolveGuidedPreReviewSignerSlots } from "./resolveGuidedPreReviewSignerSlots";
import { resolveSimpleProFinalReviewActive } from "../simpleProFinalReviewPhase";

const BASE_UX = {
  premiumPaidDocumentSurface: true,
  hasGuidedSession: true,
  premiumRecipientUxActive: false,
  finalReviewExplicitlyOpened: false,
  sendIntentSelected: false,
  signingPacketSetupActive: false,
  guidedBulkApplying: false,
};

describe("guided final review sequencing (test23/test24)", () => {
  it("does not auto-open final review from apply threshold alone", () => {
    expect(
      shouldAutoOpenGuidedFinalReviewAfterApply({
        answeredCount: 5,
        frozenTotalQuestions: 5,
        postBodyLen: 12_000,
      }),
    ).toBe(false);
  });

  it("apply complete + 1 of 2 signer slots stays signer_setup_required UX", () => {
    const slots = resolveGuidedPreReviewSignerSlots({
      partyCount: 2,
      partySignerNames: ["Acme Corp", ""],
      recipient1Name: "Acme Corp",
      recipient2Name: "",
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: [],
      draftPartyNames: ["Acme Corp", "Client LLC"],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    expect(slots.complete).toBe(false);
    expect(slots.filledCount).toBe(1);

    expect(
      resolveGuidedProUxState({
        ...BASE_UX,
        guidedCompletionPhase: "ready_to_apply",
        createFlowPhase: "signer_setup_required",
        guidedAnswerApplyStatus: "applied",
      }),
    ).toBe("signer_setup_required");

    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "signer_setup_required",
        guidedCompletionPhase: "ready_to_apply",
        finalReviewExplicitlyOpened: false,
      }),
    ).toBe(false);
  });

  it("test24: explicit unlock milestone maps UX to guided_final_review", () => {
    expect(
      resolveGuidedProUxState({
        ...BASE_UX,
        guidedCompletionPhase: "applied",
        createFlowPhase: "guided_final_review",
        finalReviewExplicitlyOpened: true,
      }),
    ).toBe("guided_final_review");
    expect(
      resolveGuidedProUxState({
        ...BASE_UX,
        guidedCompletionPhase: "ready_to_apply",
        createFlowPhase: "signer_setup_required",
        finalReviewExplicitlyOpened: true,
        guidedAnswerApplyStatus: "applied",
      }),
    ).not.toBe("signer_setup_required");
  });

  it("test24: blocks unlock with precise reasons", () => {
    expect(
      evaluateGuidedFinalReviewUnlockGate({
        applyStatus: "applied",
        signerStatus: resolveGuidedSignerSetupStatus(true),
        authoritativeBodyLen: 6000,
        signersEditing: true,
      }).reason,
    ).toBe("signer_field_focused");
    expect(
      evaluateGuidedFinalReviewUnlockGate({
        applyStatus: "applied",
        signerStatus: resolveGuidedSignerSetupStatus(true),
        authoritativeBodyLen: 6000,
        signerMetadataDebouncing: true,
      }).reason,
    ).toBe("metadata_write_pending");
    expect(
      evaluateGuidedFinalReviewUnlockGate({
        applyStatus: "applying",
        signerStatus: resolveGuidedSignerSetupStatus(true),
        authoritativeBodyLen: 6000,
      }).reason,
    ).toBe("apply_not_complete");
    expect(
      evaluateGuidedFinalReviewUnlockGate({
        applyStatus: "applied",
        signerStatus: resolveGuidedSignerSetupStatus(false),
        authoritativeBodyLen: 6000,
      }).reason,
    ).toBe("signers_incomplete");
    expect(
      evaluateGuidedFinalReviewUnlockGate({
        applyStatus: "applied",
        signerStatus: resolveGuidedSignerSetupStatus(true),
        authoritativeBodyLen: 200,
      }).reason,
    ).toBe("authoritative_body_missing");
  });

  it("test24: CTA placement is mutually exclusive (sticky vs inline)", () => {
    const stickyOnly = resolveGuidedFinalReviewCtaVisibility({
      signerSetupActive: true,
      signerSlotsComplete: true,
      applyStatus: "applied",
      bulkApplying: false,
      stickyBottomBarVisible: true,
      finalReviewUnlocked: false,
    });
    expect(stickyOnly.showSticky).toBe(true);
    expect(stickyOnly.showInline).toBe(false);

    const inlineOnly = resolveGuidedFinalReviewCtaVisibility({
      signerSetupActive: true,
      signerSlotsComplete: true,
      applyStatus: "applied",
      bulkApplying: false,
      stickyBottomBarVisible: false,
      finalReviewUnlocked: false,
    });
    expect(inlineOnly.showSticky).toBe(false);
    expect(inlineOnly.showInline).toBe(true);
  });

  it("signers complete + apply complete enables Continue to final review sticky CTA", () => {
    const cta = resolveGuidedProStickyCta("signer_setup_required", 0, true, "applied");
    expect(cta?.label).toBe("Continue to final review");
    expect(cta?.disabled).toBe(false);
    expect(cta?.reason).toBe("signer_setup_ready_final_review");
    expect(isGuidedContinueToFinalReviewCta(cta?.label ?? "")).toBe(true);
  });

  it("signers incomplete keeps Add signer details disabled even when apply applied", () => {
    const cta = resolveGuidedSignerSetupStickyCta({
      signerStatus: resolveGuidedSignerSetupStatus(false),
      applyStatus: "applied",
    });
    expect(cta.label).toBe("Add signer details");
    expect(cta.disabled).toBe(true);
  });

  it("test24: intake wires explicit unlock, flushSync, dedupe, and single CTA visibility", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("guidedFinalReviewExplicitlyUnlockedRef");
    expect(intake).toContain("guidedFinalReviewNavigationInFlightRef");
    expect(intake).toContain("guidedFinalReviewUnlockedAt");
    expect(intake).toContain("logGuidedFinalReviewExplicitUnlockStarted");
    expect(intake).toContain("logGuidedFinalReviewExplicitUnlocked");
    expect(intake).toContain("logGuidedFinalReviewNavigationDeduped");
    expect(intake).toContain("showGuidedFinalReviewInlineCta");
    expect(intake).toContain("guidedFinalReviewCtaPlacement.showSticky");
    expect(intake).toContain("resolveGuidedFinalReviewCtaVisibility");
    expect(intake).toContain("flushGuidedSignerMetadataBeforeFinalReview");
    expect(intake).toContain("evaluateGuidedFinalReviewUnlockGate");
    expect(intake).toContain("guided_final_review_inline_cta");
    expect(intake).toContain("GUIDED_CONTINUE_TO_FINAL_REVIEW_CTA");
    expect(intake).toContain("data-testid=\"guided-pre-review-apply-inline\"");
    expect(intake).toContain("handleGuidedBackToSignerDetailsFromFinalReview");
  });

  it("final review mounts only after explicit open with applied phase", () => {
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "guided_final_review",
        guidedCompletionPhase: "applied",
        finalReviewExplicitlyOpened: true,
      }),
    ).toBe(true);
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: true,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "guided_final_review",
        guidedCompletionPhase: "ready_to_apply",
        finalReviewExplicitlyOpened: true,
      }),
    ).toBe(false);
  });

  it("test24: final review screen copy constants", () => {
    expect(SIMPLE_PRO_FINAL_REVIEW_HEADLINE).toBe("Final review before sharing");
    const screen = readFileSync(join(__dirname, "../SimpleProFinalReviewScreen.tsx"), "utf8");
    expect(screen).toContain("SIMPLE_PRO_FINAL_REVIEW_HEADLINE");
    expect(screen).toContain("simple-pro-back-to-signer-details");
  });
});
