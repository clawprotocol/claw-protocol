/**
 * Universal guided Pro UX state machine — agreement-family agnostic.
 * Canonical sequence:
 * paid_pro_draft → guided_questions_active → signer_setup_required → guided_applying_updates
 * → updated_agreement_ready → guided_final_review → send_intent_selected → recipient_setup
 */

import type { CreateFlowProductionPhase } from "../createFlowTypes";
import { isFinalizingFinalReviewPhase, isGuidedFinalReviewPhase, isUpdatedAgreementReadyPhase } from "../createFlowTypes";
import type { GuidedCompletionPhase } from "./guidedCompletionPhase";
import type { GuidedAnswerApplyStatus } from "./guidedAnswerApplyOrchestration";
import {
  resolveGuidedAnswerApplyStatus,
  resolveGuidedSignerSetupStickyCta,
  resolveGuidedSignerSetupStatus,
} from "./guidedAnswerApplyOrchestration";
import {
  canProceedFromGuidedFinalReviewToSigning,
  GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN,
} from "./guidedReviewSigningContinuity";
import type { GuidedQuestionGateDecision } from "./guidedQuestionGate";

export type GuidedProUxState =
  | "inactive"
  | "paid_pro_draft"
  | "guided_questions_active"
  | "signer_setup_required"
  | "guided_applying_updates"
  | "updated_agreement_ready"
  | "guided_final_review"
  | "send_intent_selected"
  | "recipient_setup"
  | "signing_packet_setup";

export type GuidedProStickyCta = {
  label: string;
  action: "guided_continue";
  disabled: boolean;
  reason: string;
};

export type ResolveGuidedProUxStateArgs = {
  premiumPaidDocumentSurface: boolean;
  hasGuidedSession: boolean;
  /** Accepted paid Pro corpus (e.g. paidProSourceOfTruth) — signer setup does not require guided Q&A. */
  paidProAcceptedCorpusReady?: boolean;
  guidedCompletionPhase: GuidedCompletionPhase;
  createFlowPhase: CreateFlowProductionPhase;
  premiumRecipientUxActive: boolean;
  /** User explicitly opened final review via CTA. */
  finalReviewExplicitlyOpened: boolean;
  /** All required pre-review signer slots filled (enables explicit apply CTA only). */
  signerSlotsComplete?: boolean;
  /** User chose Send for signature/review on final review. */
  sendIntentSelected: boolean;
  signingPacketSetupActive?: boolean;
  /** True while bulk guided regeneration is in flight (ref may be set before phase state flushes). */
  guidedBulkApplying?: boolean;
  /** Split apply status — signer setup can proceed while background apply runs. */
  guidedAnswerApplyStatus?: GuidedAnswerApplyStatus;
  /** Precomputed fatal vs optional gate — keeps material Pro review visible when only optional questions remain. */
  questionGate?: Pick<
    GuidedQuestionGateDecision,
    "blocked" | "fatalCount" | "optionalCount" | "materialReviewAllowed"
  > | null;
};

/** Guided phases where post–final-review recipient/signing UI must stay hidden. */
export function guidedProUxBlocksRecipientSetup(args: {
  guidedCompletionPhase: GuidedCompletionPhase;
  createFlowPhase: CreateFlowProductionPhase;
  finalReviewExplicitlyOpened: boolean;
  guidedBulkApplying?: boolean;
}): boolean {
  if (args.guidedBulkApplying || args.guidedCompletionPhase === "applying_all") return true;
  if (args.createFlowPhase === "signer_setup_required") return true;
  if (isFinalizingFinalReviewPhase(args.createFlowPhase)) return true;
  if (
    args.guidedCompletionPhase === "collecting_answers" ||
    args.guidedCompletionPhase === "ready_to_apply"
  ) {
    return true;
  }
  if (args.guidedCompletionPhase === "applied" && !args.finalReviewExplicitlyOpened) {
    return (
      isUpdatedAgreementReadyPhase(args.createFlowPhase) ||
      args.createFlowPhase === "draft_ready_for_review"
    );
  }
  if (
    args.guidedCompletionPhase === "applied" &&
    args.finalReviewExplicitlyOpened &&
    isGuidedFinalReviewPhase(args.createFlowPhase)
  ) {
    return true;
  }
  return false;
}

export function resolveGuidedProUxState(args: ResolveGuidedProUxStateArgs): GuidedProUxState {
  if (!args.premiumPaidDocumentSurface) return "inactive";
  if (args.guidedCompletionPhase === "inactive" && !args.paidProAcceptedCorpusReady) return "inactive";

  if (args.signingPacketSetupActive) return "signing_packet_setup";

  if (
    args.paidProAcceptedCorpusReady &&
    args.createFlowPhase === "signer_setup_required" &&
    !args.finalReviewExplicitlyOpened &&
    args.guidedCompletionPhase !== "applying_all"
  ) {
    return "signer_setup_required";
  }

  if (
    args.paidProAcceptedCorpusReady &&
    args.guidedCompletionPhase === "ready_to_apply" &&
    !args.finalReviewExplicitlyOpened
  ) {
    return "signer_setup_required";
  }

  /** Explicit unlock milestone — only path to final review render state. */
  if (
    args.finalReviewExplicitlyOpened &&
    isGuidedFinalReviewPhase(args.createFlowPhase)
  ) {
    return "guided_final_review";
  }

  /** Stay on signer setup until user explicitly continues — never promote on background apply alone. */
  if (
    args.hasGuidedSession &&
    (args.createFlowPhase === "signer_setup_required" || isFinalizingFinalReviewPhase(args.createFlowPhase)) &&
    !args.finalReviewExplicitlyOpened &&
    args.guidedCompletionPhase !== "applying_all"
  ) {
    return isFinalizingFinalReviewPhase(args.createFlowPhase)
      ? "updated_agreement_ready"
      : "signer_setup_required";
  }

  const applyStatus = resolveGuidedAnswerApplyStatus({
    guidedAnswerApplyStatus: args.guidedAnswerApplyStatus ?? "idle",
    guidedCompletionPhase: args.guidedCompletionPhase,
    bulkApplying: Boolean(args.guidedBulkApplying),
  });

  /** Signer setup during background apply — do not replace with full-screen applying state. */
  if (
    args.hasGuidedSession &&
    args.guidedCompletionPhase === "ready_to_apply" &&
    !args.finalReviewExplicitlyOpened
  ) {
    return "signer_setup_required";
  }

  if (applyStatus === "applying" || args.guidedCompletionPhase === "applying_all") {
    return "guided_applying_updates";
  }

  if (args.guidedCompletionPhase === "applied") {
    if (
      isUpdatedAgreementReadyPhase(args.createFlowPhase) ||
      (args.createFlowPhase === "draft_ready_for_review" && !args.finalReviewExplicitlyOpened)
    ) {
      return "updated_agreement_ready";
    }
  }

  if (
    args.sendIntentSelected &&
    !guidedProUxBlocksRecipientSetup({
      guidedCompletionPhase: args.guidedCompletionPhase,
      createFlowPhase: args.createFlowPhase,
      finalReviewExplicitlyOpened: args.finalReviewExplicitlyOpened,
      guidedBulkApplying: args.guidedBulkApplying,
    })
  ) {
    if (
      args.premiumRecipientUxActive ||
      args.createFlowPhase === "recipient_setup_required" ||
      args.createFlowPhase === "ready_to_send"
    ) {
      return "send_intent_selected";
    }
  }

  if (
    !guidedProUxBlocksRecipientSetup({
      guidedCompletionPhase: args.guidedCompletionPhase,
      createFlowPhase: args.createFlowPhase,
      finalReviewExplicitlyOpened: args.finalReviewExplicitlyOpened,
      guidedBulkApplying: args.guidedBulkApplying,
    }) &&
    (args.premiumRecipientUxActive ||
      args.createFlowPhase === "recipient_setup_required" ||
      args.createFlowPhase === "ready_to_send")
  ) {
    return "recipient_setup";
  }

  if (
    args.hasGuidedSession &&
    (args.guidedCompletionPhase === "collecting_answers" ||
      args.guidedCompletionPhase === "failed")
  ) {
    const gate = args.questionGate;
    if (gate?.materialReviewAllowed && gate.fatalCount === 0) {
      return "paid_pro_draft";
    }
    return "guided_questions_active";
  }

  if (
    args.hasGuidedSession &&
    args.premiumPaidDocumentSurface &&
    args.guidedCompletionPhase !== "applied"
  ) {
    return "paid_pro_draft";
  }

  return "inactive";
}

export function guidedProUxSuppressesFreeform(state: GuidedProUxState): boolean {
  return (
    state === "guided_questions_active" ||
    state === "signer_setup_required" ||
    state === "guided_applying_updates" ||
    state === "updated_agreement_ready"
  );
}

export function guidedProUxAllowsRecipientSetup(state: GuidedProUxState): boolean {
  return state === "recipient_setup" || state === "signing_packet_setup" || state === "send_intent_selected";
}

export function guidedProUxShowsQuestionPanel(state: GuidedProUxState): boolean {
  return state === "guided_questions_active";
}

export function guidedProUxShowsSignerSetup(state: GuidedProUxState): boolean {
  return state === "signer_setup_required";
}

export function guidedProUxShowsUpdatedReadyCard(state: GuidedProUxState): boolean {
  return state === "updated_agreement_ready";
}

export function guidedProUxShowsFinalReview(state: GuidedProUxState): boolean {
  return state === "guided_final_review";
}

export function guidedProUxShowsSigningConfirmation(state: GuidedProUxState): boolean {
  return state === "signing_packet_setup";
}

/** Hide production send / continue-to-recipient CTAs until explicit final-review send intent. */
export function guidedProUxSuppressesProductionSendCta(
  state: GuidedProUxState,
  gate?: Pick<GuidedQuestionGateDecision, "materialReviewAllowed" | "fatalCount"> | null,
): boolean {
  if (gate?.materialReviewAllowed && gate.fatalCount === 0) {
    if (state === "signer_setup_required" || state === "guided_applying_updates" || state === "updated_agreement_ready" || state === "send_intent_selected") {
      return true;
    }
    return false;
  }
  return (
    state === "guided_questions_active" ||
    state === "signer_setup_required" ||
    state === "guided_applying_updates" ||
    state === "updated_agreement_ready" ||
    state === "send_intent_selected"
  );
}

/**
 * Final review → signing confirmation: recipient re-entry is not required when signers were captured pre-review.
 */
export function guidedProFinalReviewSigningPacketReady(args: {
  guidedCompletionPhase: GuidedCompletionPhase;
  finalReviewExplicitlyOpened: boolean;
  createFlowPhase: CreateFlowProductionPhase;
  signersComplete: boolean;
  authoritativeCorpusLen?: number;
}): boolean {
  return canProceedFromGuidedFinalReviewToSigning({
    paidProAuthoritative: true,
    guidedCompletionPhase: args.guidedCompletionPhase,
    finalReviewExplicitlyOpened: args.finalReviewExplicitlyOpened,
    createFlowPhase: args.createFlowPhase,
    authoritativeCorpusLen: args.authoritativeCorpusLen ?? GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN,
    signersComplete: args.signersComplete,
  });
}

/**
 * Legacy threshold check — do NOT use for navigation. Final review opens only via explicit CTA.
 */
export function shouldAutoOpenGuidedFinalReviewAfterApply(_args: {
  answeredCount: number;
  frozenTotalQuestions?: number;
  postBodyLen: number;
}): boolean {
  return false;
}

export function resolveGuidedProStickyCta(
  state: GuidedProUxState,
  pendingQuestions: number,
  signerSlotsComplete = false,
  applyStatus: GuidedAnswerApplyStatus = "idle",
  gate?: Pick<
    GuidedQuestionGateDecision,
    "blocked" | "fatalCount" | "optionalCount" | "materialReviewAllowed"
  > | null,
): GuidedProStickyCta | null {
  if (gate?.materialReviewAllowed && gate.fatalCount === 0) {
    return null;
  }
  switch (state) {
    case "guided_questions_active":
      return {
        label:
          pendingQuestions > 0
            ? `Answer ${pendingQuestions} guided question${pendingQuestions === 1 ? "" : "s"} above`
            : "Answer guided questions above",
        action: "guided_continue",
        disabled: true,
        reason: "guided_questions_active",
      };
    case "signer_setup_required":
      return resolveGuidedSignerSetupStickyCta({
        signerStatus: resolveGuidedSignerSetupStatus(signerSlotsComplete),
        applyStatus,
      });
    case "guided_applying_updates":
      return {
        label: "Updating agreement…",
        action: "guided_continue",
        disabled: true,
        reason: "guided_applying_updates",
      };
    case "updated_agreement_ready":
      return {
        label: "Review updated agreement",
        action: "guided_continue",
        disabled: false,
        reason: "updated_agreement_ready",
      };
    default:
      return guidedProUxSuppressesProductionSendCta(state)
        ? {
            label: "Complete guided steps above",
            action: "guided_continue",
            disabled: true,
            reason: state,
          }
        : null;
  }
}

export function logGuidedSendCtaBlocked(
  context: string,
  uxState: GuidedProUxState,
  action?: string,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-send-cta-blocked]", { context, uxState, action });
}

export function logGuidedProUxStateResolved(state: GuidedProUxState, phase: GuidedCompletionPhase): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-pro-ux-state]", { state, guidedCompletionPhase: phase });
}

export function logRecipientSetupPhaseBlocked(context: string, uxState: GuidedProUxState): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[recipient-setup-phase-blocked]", { context, uxState });
}

export function logGuidedFinalReviewActive(payload: { bodyLen: number; uxState: GuidedProUxState }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-active]", payload);
}

export function logRecipientUiSuppressed(payload: { uxState: GuidedProUxState; reason: string }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[recipient-ui-suppressed]", payload);
}
