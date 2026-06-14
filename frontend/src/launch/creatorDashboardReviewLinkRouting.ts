import { resolveAllReviewPartiesApproved } from "../agreement/recipientApprovedWaitingPresentation";
import type { AgreementDraft } from "../agreement/agreementTypes";
import {
  isReviewDeliveryModeExplicitlyManual,
  readReviewDeliveryMode,
  reviewDeliveryModeAllowsEmailSend,
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

/** Deep link for owner review-complete email and legacy /app/done bookmarks — same handoff as dashboard CTA. */
export function creatorDashboardPrepareSignatureLinksPath(agreementId: string): string {
  return `/app?prepare_signature_links=${encodeURIComponent(agreementId.trim())}`;
}

/** Legacy /app/done/:id without local send state — route to modern signature-prep dashboard handoff. */
export function shouldRedirectLegacyDoneToPrepareSignatureLinks(args: {
  signed: boolean | null;
  draft: AgreementDraft | null | undefined;
  confirmedSend: boolean;
  mode?: ReviewDeliveryMode;
}): boolean {
  if (args.confirmedSend) return false;
  if (args.signed === true) return false;
  if (!args.draft) return false;
  if (!resolveAllReviewPartiesApproved(args.draft)) return false;
  const mode = args.mode ?? readReviewDeliveryMode();
  if (isReviewDeliveryModeExplicitlyManual()) return false;
  return reviewDeliveryModeAllowsEmailSend(mode);
}
