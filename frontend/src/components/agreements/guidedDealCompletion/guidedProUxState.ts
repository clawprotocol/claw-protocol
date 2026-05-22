/**
 * Universal guided Pro UX state machine — agreement-family agnostic.
 * Single source of truth for phase guards, freeform suppression, and review gating.
 */

import type { CreateFlowProductionPhase } from "../createFlowTypes";
import { isGuidedFinalReviewPhase, isUpdatedAgreementReadyPhase } from "../createFlowTypes";
import type { GuidedCompletionPhase } from "./guidedCompletionPhase";

export type GuidedProUxState =
  | "inactive"
  | "guided_questions_active"
  | "guided_applying_updates"
  | "updated_agreement_ready"
  | "guided_final_review"
  | "recipient_setup"
  | "signing_packet_setup";

export type ResolveGuidedProUxStateArgs = {
  premiumPaidDocumentSurface: boolean;
  hasGuidedSession: boolean;
  guidedCompletionPhase: GuidedCompletionPhase;
  createFlowPhase: CreateFlowProductionPhase;
  premiumRecipientUxActive: boolean;
  /** User explicitly opened final review via CTA. */
  finalReviewExplicitlyOpened: boolean;
  signingPacketSetupActive?: boolean;
  /** True while bulk guided regeneration is in flight (ref may be set before phase state flushes). */
  guidedBulkApplying?: boolean;
};

/** Guided phases where recipient/signing UI must stay hidden until explicit final-review send intent. */
export function guidedProUxBlocksRecipientSetup(args: {
  guidedCompletionPhase: GuidedCompletionPhase;
  createFlowPhase: CreateFlowProductionPhase;
  finalReviewExplicitlyOpened: boolean;
  guidedBulkApplying?: boolean;
}): boolean {
  if (args.guidedBulkApplying || args.guidedCompletionPhase === "applying_all") return true;
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

  if (args.signingPacketSetupActive) return "signing_packet_setup";

  if (args.guidedBulkApplying || args.guidedCompletionPhase === "applying_all") {
    return "guided_applying_updates";
  }

  if (args.guidedCompletionPhase === "applied") {
    if (args.finalReviewExplicitlyOpened && isGuidedFinalReviewPhase(args.createFlowPhase)) {
      return "guided_final_review";
    }
    if (
      isUpdatedAgreementReadyPhase(args.createFlowPhase) ||
      (args.createFlowPhase === "draft_ready_for_review" && !args.finalReviewExplicitlyOpened)
    ) {
      return "updated_agreement_ready";
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

  if (args.guidedCompletionPhase === "applied" && args.finalReviewExplicitlyOpened) {
    return "guided_final_review";
  }

  if (
    args.hasGuidedSession &&
    (args.guidedCompletionPhase === "collecting_answers" ||
      args.guidedCompletionPhase === "ready_to_apply" ||
      args.guidedCompletionPhase === "failed")
  ) {
    return "guided_questions_active";
  }

  return "inactive";
}

export function guidedProUxSuppressesFreeform(state: GuidedProUxState): boolean {
  return (
    state === "guided_questions_active" ||
    state === "guided_applying_updates" ||
    state === "updated_agreement_ready"
  );
}

export function guidedProUxAllowsRecipientSetup(state: GuidedProUxState): boolean {
  return state === "recipient_setup" || state === "signing_packet_setup";
}

export function guidedProUxShowsQuestionPanel(state: GuidedProUxState): boolean {
  return state === "guided_questions_active" || state === "guided_applying_updates";
}

export function guidedProUxShowsUpdatedReadyCard(state: GuidedProUxState): boolean {
  return state === "updated_agreement_ready";
}

export function guidedProUxShowsFinalReview(state: GuidedProUxState): boolean {
  return state === "guided_final_review";
}

/** Hide production send / continue-to-recipient CTAs until explicit final-review send intent. */
export function guidedProUxSuppressesProductionSendCta(state: GuidedProUxState): boolean {
  return (
    state === "guided_questions_active" ||
    state === "guided_applying_updates" ||
    state === "updated_agreement_ready"
  );
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
