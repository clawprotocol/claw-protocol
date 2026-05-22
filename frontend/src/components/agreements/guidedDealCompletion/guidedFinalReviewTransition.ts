/**
 * Explicit guided Pro final-review unlock — navigation, CTA placement, logging.
 */

import type { GuidedAnswerApplyStatus } from "./guidedAnswerApplyOrchestration";
import {
  canUnlockGuidedFinalReview,
  type CanUnlockGuidedFinalReviewArgs,
  GUIDED_CONTINUE_TO_FINAL_REVIEW_CTA,
} from "./guidedAnswerApplyOrchestration";

export type GuidedFinalReviewUnlockBlockReason =
  | "signers_incomplete"
  | "apply_not_complete"
  | "authoritative_body_missing"
  | "signer_field_focused"
  | "metadata_write_pending";

export type GuidedFinalReviewUnlockEvaluation = {
  ok: boolean;
  reason: GuidedFinalReviewUnlockBlockReason | null;
};

export function evaluateGuidedFinalReviewUnlockGate(
  args: CanUnlockGuidedFinalReviewArgs,
): GuidedFinalReviewUnlockEvaluation {
  if (args.signersEditing) {
    return { ok: false, reason: "signer_field_focused" };
  }
  if (args.signerMetadataDebouncing) {
    return { ok: false, reason: "metadata_write_pending" };
  }
  if ((args.authoritativeBodyLen ?? 0) < 500) {
    return { ok: false, reason: "authoritative_body_missing" };
  }
  if (args.applyStatus !== "applied") {
    return { ok: false, reason: "apply_not_complete" };
  }
  if (args.signerStatus !== "complete") {
    return { ok: false, reason: "signers_incomplete" };
  }
  return { ok: true, reason: null };
}

export function resolveGuidedFinalReviewUnlockGate(
  args: CanUnlockGuidedFinalReviewArgs,
): boolean {
  return canUnlockGuidedFinalReview(args);
}

export const GUIDED_SIGNER_SETUP_PRE_REVIEW_SUBCOPY =
  "Nothing is sent yet. You'll review the final version before choosing signature or review-only sharing.";

export const SIMPLE_PRO_FINAL_REVIEW_HEADLINE = "Final review before sharing";
export const SIMPLE_PRO_FINAL_REVIEW_SUBCOPY =
  "Review the updated Pro agreement. Then choose whether to send for review or send for signature.";

export type ResolveGuidedFinalReviewCtaVisibilityArgs = {
  signerSetupActive: boolean;
  signerSlotsComplete: boolean;
  applyStatus: GuidedAnswerApplyStatus;
  bulkApplying: boolean;
  stickyBottomBarVisible: boolean;
  finalReviewUnlocked: boolean;
};

export function resolveGuidedFinalReviewCtaVisibility(
  args: ResolveGuidedFinalReviewCtaVisibilityArgs,
): { showSticky: boolean; showInline: boolean } {
  if (!args.signerSetupActive || args.finalReviewUnlocked) {
    return { showSticky: false, showInline: false };
  }
  const ready =
    args.signerSlotsComplete &&
    args.applyStatus !== "applying" &&
    !args.bulkApplying &&
    (args.applyStatus === "applied" || args.applyStatus === "failed_retryable");
  if (!ready) {
    return { showSticky: false, showInline: false };
  }
  const showSticky = args.stickyBottomBarVisible;
  return {
    showSticky,
    showInline: !showSticky,
  };
}

export function isGuidedContinueToFinalReviewCta(label: string): boolean {
  return label.trim() === GUIDED_CONTINUE_TO_FINAL_REVIEW_CTA;
}

export function logGuidedFinalReviewExplicitUnlockStarted(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-explicit-unlock-started]");
}

export function logGuidedFinalReviewExplicitUnlocked(payload?: { unlockedAt?: number | null }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-explicit-unlocked]", payload ?? {});
}

export function logGuidedFinalReviewExplicitUnlockBlocked(
  reason: GuidedFinalReviewUnlockBlockReason,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-explicit-unlock-blocked]", { reason });
}

export function logGuidedFinalReviewNavigationDeduped(): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-navigation-deduped]");
}
