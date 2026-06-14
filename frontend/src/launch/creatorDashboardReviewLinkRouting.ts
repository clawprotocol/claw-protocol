import { resolveAllReviewPartiesApproved } from "../agreement/recipientApprovedWaitingPresentation";
import type { AgreementDraft } from "../agreement/agreementTypes";
import {
  isReviewDeliveryModeExplicitlyManual,
  readReviewDeliveryMode,
  type ReviewDeliveryMode,
} from "./simpleProduct/reviewDeliveryConfig";

/** @deprecated Pre-signature review tracking uses dashboard focus; retained for env diagnostics only. */
export function creatorDashboardUsesManualReviewLinkPage(
  mode: ReviewDeliveryMode = readReviewDeliveryMode(),
): boolean {
  void mode;
  return isReviewDeliveryModeExplicitlyManual();
}

/** Completed / signed agreement proof surface (legacy route). */
export function creatorDashboardCompletedProofPath(agreementId: string): string {
  return `/app/done/${encodeURIComponent(agreementId.trim())}`;
}

/** @deprecated Use creatorDashboardCompletedProofPath for signed proof only. */
export function creatorDashboardReviewLinkReadyPath(agreementId: string): string {
  return creatorDashboardCompletedProofPath(agreementId);
}

/** In-app focus target for dashboard review status (scroll, no obsolete done page). */
export function creatorDashboardFocusAgreementPath(agreementId: string): string {
  return `/app?focus=${encodeURIComponent(agreementId.trim())}`;
}

/** Deep link for owner review-complete email and legacy /app/done bookmarks — same handoff as dashboard CTA. */
export function creatorDashboardPrepareSignatureLinksPath(agreementId: string): string {
  return `/app?prepare_signature_links=${encodeURIComponent(agreementId.trim())}`;
}

/** Legacy /app/done/:id bookmark — all reviews approved, unsigned → canonical signature-prep handoff. */
export function shouldRedirectLegacyDoneToPrepareSignatureLinks(args: {
  signed: boolean | null;
  draft: AgreementDraft | null | undefined;
  confirmedSend?: boolean;
  mode?: ReviewDeliveryMode;
}): boolean {
  void args.confirmedSend;
  void args.mode;
  if (args.signed === true) return false;
  if (!args.draft) return false;
  return resolveAllReviewPartiesApproved(args.draft);
}
