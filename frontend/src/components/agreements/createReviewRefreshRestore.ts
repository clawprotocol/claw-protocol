import { paidProAuthorityBlocksStarterReviewRestore } from "./authoritativePaidProReview";
import { hasCheckoutBackRestoreSnapshot } from "./checkoutBackRestore";
import {
  hasStoredCreateReviewState,
  readCreateReviewAgreementResumeId,
  readCreateReviewDraftReadyMarker,
} from "./agreementIntakeStorage";
import { hasCurrentSessionFreeStarterIntent } from "./paidProSessionEligibility";

export type ReviewRefreshRegenerationSkipReason =
  | "stored_agreement_resume_id"
  | "stored_draft_ready_marker"
  | "draft_already_ready"
  | "auto_generate_already_consumed"
  | "paid_pro_authority_blocks_starter_restore";

export function agreementIdShort(agreementId: string | null | undefined): string | null {
  const hid = (agreementId || "").trim();
  if (!hid) return null;
  return hid.length <= 12 ? hid : `${hid.slice(0, 8)}…`;
}

export function logReviewRefreshRestore(args: {
  hasStoredDraft: boolean;
  agreementIdShort: string | null;
  restored: boolean;
}): void {
  console.info("[review-refresh-restore]", args);
}

export function logReviewRefreshRegenerationSkipped(reason: ReviewRefreshRegenerationSkipReason): void {
  console.info("[review-refresh-regeneration-skipped]", { reason });
}

/** Do not hydrate stored free starter snapshot when paid SoT already exists. */
export function shouldRestoreStoredCreateReviewDraftSnapshot(): boolean {
  if (hasCurrentSessionFreeStarterIntent()) {
    return false;
  }
  if (paidProAuthorityBlocksStarterReviewRestore()) {
    logReviewRefreshRegenerationSkipped("paid_pro_authority_blocks_starter_restore");
    return false;
  }
  return readCreateReviewDraftReadyMarker() || hasStoredCreateReviewState();
}

export function shouldHydrateStoredAgreementResumeId(opts?: SkipHomeAutoGenerateOptions): boolean {
  if (opts?.freshHomeHeroHandoff || hasCurrentSessionFreeStarterIntent()) return false;
  return Boolean(readCreateReviewAgreementResumeId());
}

export type SkipHomeAutoGenerateOptions = {
  /** Fresh homepage hero submit — must not inherit stale paid Pro authority from a prior tab session. */
  freshHomeHeroHandoff?: boolean;
};

/** Skip home hero auto-generate when an in-tab review draft can be restored. */
export function shouldSkipHomeAutoGenerateForStoredReview(opts?: SkipHomeAutoGenerateOptions): boolean {
  if (!opts?.freshHomeHeroHandoff && paidProAuthorityBlocksStarterReviewRestore()) {
    logReviewRefreshRegenerationSkipped("paid_pro_authority_blocks_starter_restore");
    return true;
  }
  if (hasCheckoutBackRestoreSnapshot()) {
    logReviewRefreshRegenerationSkipped("stored_draft_ready_marker");
    return true;
  }
  if (opts?.freshHomeHeroHandoff || hasCurrentSessionFreeStarterIntent()) {
    return false;
  }
  if (!hasStoredCreateReviewState()) return false;
  if (shouldHydrateStoredAgreementResumeId(opts)) {
    logReviewRefreshRegenerationSkipped("stored_agreement_resume_id");
    return true;
  }
  logReviewRefreshRegenerationSkipped("stored_draft_ready_marker");
  return true;
}
