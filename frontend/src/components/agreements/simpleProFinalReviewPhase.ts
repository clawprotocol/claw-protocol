/**
 * Stable paid Pro final review phase — agreement-first, signers deferred.
 */

import type { CreateFlowProductionPhase } from "./createFlowTypes";
import { isGuidedFinalReviewPhase } from "./createFlowTypes";
import type { GuidedCompletionPhase } from "./guidedDealCompletion/guidedCompletionPhase";

export function resolveSimpleProFinalReviewActive(args: {
  paidProAuthoritative: boolean;
  premiumPaidDocumentSurface: boolean;
  premiumRecipientUxActive: boolean;
  createFlowPhase: CreateFlowProductionPhase;
  guidedCompletionPhase: GuidedCompletionPhase;
}): boolean {
  if (!args.paidProAuthoritative || !args.premiumPaidDocumentSurface) return false;
  if (args.premiumRecipientUxActive) return false;
  if (isGuidedFinalReviewPhase(args.createFlowPhase)) return true;
  return (
    args.guidedCompletionPhase === "applied" &&
    args.createFlowPhase !== "recipient_setup_required" &&
    args.createFlowPhase !== "ready_to_send"
  );
}

export function logSimpleProFinalReviewMounted(payload: {
  bodyLen: number;
  phase: CreateFlowProductionPhase;
  guidedApplied: boolean;
  recipientUxActive: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[simple-pro-final-review-mounted]", payload);
}

export function logSimpleProFinalReviewHiddenRecipientUi(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[simple-pro-final-review-hidden-recipient-ui]");
}

export function logSimpleProFinalReviewContinueToSigning(payload: { bodyLen: number }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[simple-pro-final-review-continue-to-signing]", payload);
}

export function logGuidedFinalReviewPhaseGuardBlocked(context: string, phase: CreateFlowProductionPhase): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[guided-final-review-phase-guard-blocked-recipient-setup]", { context, phase });
}
