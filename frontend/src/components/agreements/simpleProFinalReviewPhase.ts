/**
 * Stable paid Pro final review phase — agreement-first, signers deferred.
 */

import type { CreateFlowProductionPhase } from "./createFlowTypes";
import { isGuidedFinalReviewPhase } from "./createFlowTypes";
import type { GuidedCompletionPhase } from "./guidedDealCompletion/guidedCompletionPhase";

export type FinalReviewSendIntent = "review_only" | "signature";

export function resolveSimpleProFinalReviewActive(args: {
  paidProAuthoritative: boolean;
  premiumPaidDocumentSurface: boolean;
  premiumRecipientUxActive: boolean;
  createFlowPhase: CreateFlowProductionPhase;
  guidedCompletionPhase: GuidedCompletionPhase;
  /** User explicitly opened final review — never auto-open from apply alone. */
  finalReviewExplicitlyOpened?: boolean;
}): boolean {
  if (!args.paidProAuthoritative || !args.premiumPaidDocumentSurface) return false;
  if (args.premiumRecipientUxActive) return false;
  if (!args.finalReviewExplicitlyOpened) return false;
  return (
    isGuidedFinalReviewPhase(args.createFlowPhase) &&
    args.guidedCompletionPhase === "applied"
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
  // eslint-disable-next-line no-console
  console.info("[final-review-recipient-phase-blocked]", { context, phase });
}

export function logRecipientInputPhaseChangeBlocked(args: {
  attemptedPhase: CreateFlowProductionPhase;
  currentPhase: CreateFlowProductionPhase;
  source: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[recipient-input-phase-change-blocked]", args);
}

export function recipientSetupTitleForIntent(intent: FinalReviewSendIntent | null): string {
  if (intent === "review_only") return "Add reviewer emails";
  if (intent === "signature") return "Add signer emails";
  return "Add recipients";
}

export function recipientSetupSubcopyForIntent(intent: FinalReviewSendIntent | null): string {
  if (intent === "review_only") {
    return "You’ll create review links and share them. LawDog does not email recipients automatically.";
  }
  if (intent === "signature") {
    return "You’ll create signing links and share them. Signing fields are placed automatically when possible.";
  }
  return "";
}
