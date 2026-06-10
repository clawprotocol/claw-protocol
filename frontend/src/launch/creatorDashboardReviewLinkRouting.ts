import {
  isReviewDeliveryModeExplicitlyManual,
  readReviewDeliveryMode,
  type ReviewDeliveryMode,
} from "./simpleProduct/reviewDeliveryConfig";

/** Owner dashboard should surface /app/done/{id} only when review delivery is explicitly manual. */
export function creatorDashboardUsesManualReviewLinkPage(
  mode: ReviewDeliveryMode = readReviewDeliveryMode(),
): boolean {
  void mode;
  return isReviewDeliveryModeExplicitlyManual();
}

export function creatorDashboardReviewLinkReadyPath(agreementId: string): string {
  return `/app/done/${encodeURIComponent(agreementId.trim())}`;
}

/** In-app focus target for dashboard review status (scroll, no obsolete done page). */
export function creatorDashboardFocusAgreementPath(agreementId: string): string {
  return `/app?focus=${encodeURIComponent(agreementId.trim())}`;
}
