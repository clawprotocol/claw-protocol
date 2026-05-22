import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canUnlockGuidedFinalReview,
  resolveGuidedSignerSetupStickyCta,
  resolveGuidedSignerSetupStatus,
} from "./guidedAnswerApplyOrchestration";
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

describe("guided final review sequencing (test23)", () => {
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

  it("blocks final review unlock while signers editing or metadata debouncing", () => {
    expect(
      canUnlockGuidedFinalReview({
        applyStatus: "applied",
        signerStatus: resolveGuidedSignerSetupStatus(true),
        authoritativeBodyLen: 6000,
        signersEditing: true,
      }),
    ).toBe(false);
    expect(
      canUnlockGuidedFinalReview({
        applyStatus: "applied",
        signerStatus: resolveGuidedSignerSetupStatus(true),
        authoritativeBodyLen: 6000,
        signerMetadataDebouncing: true,
      }),
    ).toBe(false);
  });

  it("signers complete + apply complete enables Continue to final review sticky CTA", () => {
    const cta = resolveGuidedProStickyCta("signer_setup_required", 0, true, "applied");
    expect(cta?.label).toBe("Continue to final review");
    expect(cta?.disabled).toBe(false);
    expect(cta?.reason).toBe("signer_setup_ready_final_review");
  });

  it("signers incomplete keeps Add signer details disabled even when apply applied", () => {
    const cta = resolveGuidedSignerSetupStickyCta({
      signerStatus: resolveGuidedSignerSetupStatus(false),
      applyStatus: "applied",
    });
    expect(cta.label).toBe("Add signer details");
    expect(cta.disabled).toBe(true);
  });

  it("intake removes auto-open effect and logs blocked signers incomplete", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("logGuidedFinalReviewBlockedSignersIncomplete");
    expect(intake).toContain("resolveGuidedFinalReviewUnlockGate");
    expect(intake).not.toMatch(
      /canUnlockGuidedFinalReview\([\s\S]{0,400}setGuidedFinalReviewExplicitlyOpened\(true\)/,
    );
    expect(intake).toContain("stayOnSignerSetup");
    expect(intake).not.toContain("} else if (autoFinal) {");
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
});
