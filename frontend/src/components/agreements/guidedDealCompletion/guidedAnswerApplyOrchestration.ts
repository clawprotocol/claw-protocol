/**
 * Split guided answer apply from signer capture — universal across agreement families.
 */

import type { GuidedCompletionSession } from "./types";
import type { GuidedProStickyCta } from "./guidedProUxState";

export type GuidedAnswerApplyStatus = "idle" | "applying" | "applied" | "failed_retryable";

export type GuidedSignerSetupStatus = "missing" | "complete";

export function countGuidedAnsweredVariables(session: GuidedCompletionSession | null | undefined): number {
  if (!session) return 0;
  return Object.keys(session.answered).filter((id) => (session.answered[id] || "").trim()).length;
}

/** Prefer frozen answered IDs — never use visible queue length after freeze (queueLen → 0). */
export function resolveGuidedFrozenAnswerCount(session: GuidedCompletionSession | null | undefined): number {
  if (!session) return 0;
  const answered = countGuidedAnsweredVariables(session);
  if (answered > 0) return answered;
  const frozen = session.frozenTotalQuestions ?? 0;
  if (frozen > 0) return frozen;
  return session.variables.length;
}

export function listGuidedAnsweredVariableIds(session: GuidedCompletionSession | null | undefined): string[] {
  if (!session) return [];
  return Object.keys(session.answered).filter((id) => (session.answered[id] || "").trim());
}

export function resolveGuidedAnswerApplyStatus(args: {
  guidedAnswerApplyStatus: GuidedAnswerApplyStatus;
  guidedCompletionPhase: string;
  bulkApplying: boolean;
}): GuidedAnswerApplyStatus {
  if (args.guidedAnswerApplyStatus === "failed_retryable") return "failed_retryable";
  if (args.guidedAnswerApplyStatus === "applied" || args.guidedCompletionPhase === "applied") {
    return "applied";
  }
  if (
    args.guidedAnswerApplyStatus === "applying" ||
    args.bulkApplying ||
    args.guidedCompletionPhase === "applying_all"
  ) {
    return "applying";
  }
  return "idle";
}

export function resolveGuidedSignerSetupStatus(slotsComplete: boolean): GuidedSignerSetupStatus {
  return slotsComplete ? "complete" : "missing";
}

export type CanUnlockGuidedFinalReviewArgs = {
  applyStatus: GuidedAnswerApplyStatus;
  signerStatus: GuidedSignerSetupStatus;
  /** Authoritative Pro body length — must be usable before final review. */
  authoritativeBodyLen?: number;
  signersEditing?: boolean;
  signerMetadataDebouncing?: boolean;
};

export function canUnlockGuidedFinalReview(args: CanUnlockGuidedFinalReviewArgs): boolean {
  if (args.signersEditing || args.signerMetadataDebouncing) return false;
  if ((args.authoritativeBodyLen ?? 500) < 500) return false;
  return args.applyStatus === "applied" && args.signerStatus === "complete";
}

export const GUIDED_SIGNER_SETUP_HEADLINE = "Add signer/reviewer details";
export const GUIDED_SIGNER_SETUP_BACKGROUND_SUBCOPY =
  "LawDog is applying your answers in the background. Add the people who need to review or sign before final review.";
export const GUIDED_SIGNER_SETUP_APPLY_COMPLETE_SUBCOPY =
  "Your updated Pro agreement is ready. Finish signer details to continue to final review.";
/** @deprecated Use GUIDED_SIGNER_SETUP_HEADLINE */
export const GUIDED_SIGNER_SETUP_BACKGROUND_HEADLINE = GUIDED_SIGNER_SETUP_HEADLINE;
export const GUIDED_BACKGROUND_APPLY_PROGRESS = "Updating Pro agreement in background…";
export const GUIDED_FINISHING_UPDATED_AGREEMENT = "Finishing your updated agreement…";
export const GUIDED_APPLYING_ANSWERS_SUBCOPY = "Applying your answers to the Pro agreement…";
export const GUIDED_CONTINUE_TO_FINAL_REVIEW_CTA = "Continue to final review";

export function resolveGuidedSignerSetupStickyCta(args: {
  signerStatus: GuidedSignerSetupStatus;
  applyStatus: GuidedAnswerApplyStatus;
}): GuidedProStickyCta {
  if (args.signerStatus === "missing") {
    return {
      label: "Add signer details",
      action: "guided_continue",
      disabled: true,
      reason: "signer_setup_required",
    };
  }
  if (args.applyStatus === "applying") {
    return {
      label: GUIDED_FINISHING_UPDATED_AGREEMENT,
      action: "guided_continue",
      disabled: true,
      reason: "guided_apply_in_progress",
    };
  }
  if (args.applyStatus === "failed_retryable") {
    return {
      label: "Retry Pro update",
      action: "guided_continue",
      disabled: false,
      reason: "guided_apply_failed_retry",
    };
  }
  return {
    label: GUIDED_CONTINUE_TO_FINAL_REVIEW_CTA,
    action: "guided_continue",
    disabled: false,
    reason: "signer_setup_ready_final_review",
  };
}

export function shouldResolveGuidedApplyFromExistingBody(args: {
  applying: boolean;
  stableBodyLen: number;
  currentBodyLen: number;
  elapsedMs: number;
  minWaitMs?: number;
}): boolean {
  if (!args.applying) return false;
  const minWait = args.minWaitMs ?? 4_000;
  if (args.elapsedMs < minWait) return false;
  if (args.stableBodyLen < 500) return args.currentBodyLen >= 500;
  return args.currentBodyLen >= Math.max(args.stableBodyLen * 1.02, args.stableBodyLen + 200);
}

export function logGuidedBackgroundApplyStarted(payload: { answeredCount: number }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-background-apply-started]", payload);
}
