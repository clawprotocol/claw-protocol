import {
  readReviewDeliveryMode,
  reviewDeliveryModeAllowsEmailSend,
  type ReviewDeliveryMode,
} from "./reviewDeliveryConfig";

export const REVIEW_INVITATIONS_SENT_TITLE = "Review invitations sent";

export const REVIEW_INVITATIONS_SENT_BODY =
  "Review invitations sent. Track review status from your dashboard.";

/** Owner destination after successful review-first send when email delivery is active. */
export function resolveOwnerPostReviewSendPath(
  agreementId: string,
  mode: ReviewDeliveryMode = readReviewDeliveryMode(),
): string {
  if (reviewDeliveryModeAllowsEmailSend(mode)) {
    return "/app";
  }
  return `/app/done/${encodeURIComponent(agreementId.trim())}`;
}

export function ownerPostReviewSendUsesDashboard(
  mode: ReviewDeliveryMode = readReviewDeliveryMode(),
): boolean {
  return reviewDeliveryModeAllowsEmailSend(mode);
}
