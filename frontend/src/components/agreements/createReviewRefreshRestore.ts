import { hasCheckoutBackRestoreSnapshot } from "./checkoutBackRestore";
import {
  hasStoredCreateReviewState,
  readCreateReviewAgreementResumeId,
} from "./agreementIntakeStorage";

export type ReviewRefreshRegenerationSkipReason =
  | "stored_agreement_resume_id"
  | "stored_draft_ready_marker"
  | "draft_already_ready"
  | "auto_generate_already_consumed";

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

/** Skip home hero auto-generate when an in-tab review draft can be restored. */
export function shouldSkipHomeAutoGenerateForStoredReview(): boolean {
  if (hasCheckoutBackRestoreSnapshot()) {
    logReviewRefreshRegenerationSkipped("stored_draft_ready_marker");
    return true;
  }
  if (!hasStoredCreateReviewState()) return false;
  if (readCreateReviewAgreementResumeId()) {
    logReviewRefreshRegenerationSkipped("stored_agreement_resume_id");
    return true;
  }
  logReviewRefreshRegenerationSkipped("stored_draft_ready_marker");
  return true;
}
