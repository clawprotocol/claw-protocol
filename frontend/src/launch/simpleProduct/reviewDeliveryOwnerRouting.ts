import {
  readReviewDeliveryMode,
  type ReviewDeliveryMode,
} from "./reviewDeliveryConfig";
import { creatorDashboardFocusAgreementPath } from "../creatorDashboardReviewLinkRouting";

export const REVIEW_INVITATIONS_SENT_TITLE = "Review invitations sent";

export const REVIEW_INVITATIONS_SENT_BODY =
  "Review invitations sent. Track review status from your dashboard.";

export type OwnerPostReviewRouteReason =
  | "explicit_manual_mode"
  | "delivery_mode_email"
  | "review_sent_ok"
  | "review_sent_failed_fallback"
  | "review_email_delivery_incomplete";

export type OwnerPostReviewDestination = "dashboard";

export type OwnerPostReviewRouteDecision = {
  path: string;
  destination: OwnerPostReviewDestination;
  reason: OwnerPostReviewRouteReason;
  deliveryMode: ReviewDeliveryMode;
  reviewSentOk: boolean;
};

export type ResolveOwnerPostReviewSendPathOptions = {
  mode?: ReviewDeliveryMode;
  reviewSentOk?: boolean;
  /** POST /review-sent was invoked (or invites were already sent on a prior attempt). */
  reviewEmailDeliveryAttempted?: boolean;
  /** Server persisted review_invite_emails_sent_at after a successful delivery attempt. */
  reviewInviteEmailsSent?: boolean;
};

export function resolveOwnerPostReviewSendRoute(
  agreementId: string,
  options?: ResolveOwnerPostReviewSendPathOptions,
): OwnerPostReviewRouteDecision {
  const mode = options?.mode ?? readReviewDeliveryMode();
  const reviewSentOk = options?.reviewSentOk === true;
  const deliveryAttempted = options?.reviewEmailDeliveryAttempted === true;
  const inviteEmailsSent = options?.reviewInviteEmailsSent === true;
  const id = agreementId.trim();
  const dashboardPath = "/app";
  const focusPath = creatorDashboardFocusAgreementPath(id);

  if (!deliveryAttempted || !inviteEmailsSent) {
    return {
      path: focusPath,
      destination: "dashboard",
      reason: !deliveryAttempted ? "review_sent_failed_fallback" : "review_email_delivery_incomplete",
      deliveryMode: mode,
      reviewSentOk: false,
    };
  }

  return {
    path: dashboardPath,
    destination: "dashboard",
    reason: reviewSentOk ? "review_sent_ok" : "delivery_mode_email",
    deliveryMode: mode,
    reviewSentOk,
  };
}

/** Owner destination after successful review-first send. */
export function resolveOwnerPostReviewSendPath(
  agreementId: string,
  modeOrOptions?: ReviewDeliveryMode | ResolveOwnerPostReviewSendPathOptions,
): string {
  if (typeof modeOrOptions === "string") {
    return resolveOwnerPostReviewSendRoute(agreementId, { mode: modeOrOptions }).path;
  }
  return resolveOwnerPostReviewSendRoute(agreementId, modeOrOptions).path;
}

export function ownerPostReviewSendUsesDashboard(
  _mode: ReviewDeliveryMode = readReviewDeliveryMode(),
): boolean {
  return true;
}

export function logReviewFirstOwnerRouteResolved(payload: {
  agreementId: string;
  destination: OwnerPostReviewDestination;
  reason: OwnerPostReviewRouteReason;
  deliveryMode: ReviewDeliveryMode;
  reviewSentOk: boolean;
  reviewEmailDeliveryAttempted?: boolean;
  reviewInviteEmailsSent?: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-owner-route-resolved]", payload);
}
