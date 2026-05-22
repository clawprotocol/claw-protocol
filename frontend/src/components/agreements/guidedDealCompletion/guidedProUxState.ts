/**
 * Universal guided Pro UX state machine — agreement-family agnostic.
 * Single source of truth for phase guards, freeform suppression, and review gating.
 */

import type { CreateFlowProductionPhase } from "../createFlowTypes";
import { isGuidedFinalReviewPhase } from "../createFlowTypes";
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
};

export function resolveGuidedProUxState(args: ResolveGuidedProUxStateArgs): GuidedProUxState {
  if (!args.premiumPaidDocumentSurface) return "inactive";

  if (args.signingPacketSetupActive) return "signing_packet_setup";

  if (
    args.premiumRecipientUxActive ||
    args.createFlowPhase === "recipient_setup_required" ||
    args.createFlowPhase === "ready_to_send"
  ) {
    return "recipient_setup";
  }

  if (
    isGuidedFinalReviewPhase(args.createFlowPhase) &&
    args.guidedCompletionPhase === "applied" &&
    args.finalReviewExplicitlyOpened
  ) {
    return "guided_final_review";
  }

  if (args.guidedCompletionPhase === "applying_all") {
    return "guided_applying_updates";
  }

  if (args.guidedCompletionPhase === "applied") {
    if (args.finalReviewExplicitlyOpened && isGuidedFinalReviewPhase(args.createFlowPhase)) {
      return "guided_final_review";
    }
    return "updated_agreement_ready";
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
