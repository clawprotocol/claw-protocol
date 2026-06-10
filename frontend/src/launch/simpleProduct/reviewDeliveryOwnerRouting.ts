import {
  isReviewDeliveryModeExplicitlyManual,
  readReviewDeliveryMode,
  reviewDeliveryModeAllowsEmailSend,
  type ReviewDeliveryMode,
} from "./reviewDeliveryConfig";

export const REVIEW_INVITATIONS_SENT_TITLE = "Review invitations sent";

export const REVIEW_INVITATIONS_SENT_BODY =
  "Review invitations sent. Track review status from your dashboard.";

export type OwnerPostReviewRouteReason =
  | "explicit_manual_mode"
  | "delivery_mode_email"
  | "review_sent_ok"
  | "review_sent_failed_fallback";

export type OwnerPostReviewDestination = "dashboard" | "done";

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
};

export function resolveOwnerPostReviewSendRoute(
  agreementId: string,
  options?: ResolveOwnerPostReviewSendPathOptions,
): OwnerPostReviewRouteDecision {
  const mode = options?.mode ?? readReviewDeliveryMode();
  const reviewSentOk = options?.reviewSentOk === true;
  const id = agreementId.trim();
  const donePath = `/app/done/${encodeURIComponent(id)}`;

  if (isReviewDeliveryModeExplicitlyManual()) {
    return {
      path: donePath,
      destination: "done",
      reason: "explicit_manual_mode",
      deliveryMode: mode,
      reviewSentOk,
    };
  }
  if (reviewDeliveryModeAllowsEmailSend(mode)) {
    return {
      path: "/app",
      destination: "dashboard",
      reason: "delivery_mode_email",
      deliveryMode: mode,
      reviewSentOk,
    };
  }
  if (reviewSentOk) {
    return {
      path: "/app",
      destination: "dashboard",
      reason: "review_sent_ok",
      deliveryMode: mode,
      reviewSentOk,
    };
  }
  return {
    path: donePath,
    destination: "done",
    reason: "review_sent_failed_fallback",
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
  mode: ReviewDeliveryMode = readReviewDeliveryMode(),
): boolean {
  return reviewDeliveryModeAllowsEmailSend(mode);
}

export function logReviewFirstOwnerRouteResolved(payload: {
  agreementId: string;
  destination: OwnerPostReviewDestination;
  reason: OwnerPostReviewRouteReason;
  deliveryMode: ReviewDeliveryMode;
  reviewSentOk: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-first-owner-route-resolved]", payload);
}
