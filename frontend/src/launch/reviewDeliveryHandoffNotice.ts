/**
 * One-shot owner notice after review-track handoff navigates to dashboard.
 * Written by paidProPostRecipientSetupHandoff; consumed by AppDashboard.
 */

import type { OwnerPostReviewRouteReason } from "./simpleProduct/reviewDeliveryOwnerRouting";
import {
  REVIEW_INVITATIONS_SENT_BODY,
  REVIEW_INVITATIONS_SENT_TITLE,
  REVIEW_EMAIL_DELIVERY_INCOMPLETE_BODY,
  REVIEW_EMAIL_DELIVERY_INCOMPLETE_TITLE,
} from "./simpleProduct/reviewDeliveryOwnerRouting";

export const REVIEW_DELIVERY_HANDOFF_NOTICE_KEY = "claw_review_delivery_handoff_notice_v1";

export type ReviewDeliveryHandoffNoticeKind =
  | "review_invitations_sent"
  | "review_email_delivery_incomplete";

export type ReviewDeliveryHandoffNotice = {
  v: 1;
  agreementId: string;
  kind: ReviewDeliveryHandoffNoticeKind;
  title: string;
  body: string;
  routeReason: OwnerPostReviewRouteReason;
  at: number;
};

export function reviewDeliveryHandoffNoticeKindFromRouteReason(
  reason: OwnerPostReviewRouteReason,
): ReviewDeliveryHandoffNoticeKind {
  if (reason === "review_email_delivery_incomplete") return "review_email_delivery_incomplete";
  return "review_invitations_sent";
}

export function reviewDeliveryHandoffNoticeCopy(kind: ReviewDeliveryHandoffNoticeKind): {
  title: string;
  body: string;
} {
  switch (kind) {
    case "review_email_delivery_incomplete":
      return {
        title: REVIEW_EMAIL_DELIVERY_INCOMPLETE_TITLE,
        body: REVIEW_EMAIL_DELIVERY_INCOMPLETE_BODY,
      };
    case "review_invitations_sent":
    default:
      return {
        title: REVIEW_INVITATIONS_SENT_TITLE,
        body: REVIEW_INVITATIONS_SENT_BODY,
      };
  }
}

export function writeReviewDeliveryHandoffNotice(args: {
  agreementId: string;
  routeReason: OwnerPostReviewRouteReason;
}): void {
  if (typeof sessionStorage === "undefined") return;
  const agreementId = args.agreementId.trim();
  if (!agreementId) return;
  const kind = reviewDeliveryHandoffNoticeKindFromRouteReason(args.routeReason);
  const copy = reviewDeliveryHandoffNoticeCopy(kind);
  const notice: ReviewDeliveryHandoffNotice = {
    v: 1,
    agreementId,
    kind,
    title: copy.title,
    body: copy.body,
    routeReason: args.routeReason,
    at: Date.now(),
  };
  try {
    sessionStorage.setItem(REVIEW_DELIVERY_HANDOFF_NOTICE_KEY, JSON.stringify(notice));
  } catch {
    /* ignore */
  }
}

export function consumeReviewDeliveryHandoffNotice(): ReviewDeliveryHandoffNotice | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(REVIEW_DELIVERY_HANDOFF_NOTICE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(REVIEW_DELIVERY_HANDOFF_NOTICE_KEY);
    const parsed = JSON.parse(raw) as Partial<ReviewDeliveryHandoffNotice>;
    if (parsed.v !== 1 || typeof parsed.agreementId !== "string" || !parsed.agreementId.trim()) {
      return null;
    }
    if (typeof parsed.title !== "string" || typeof parsed.body !== "string") return null;
    return parsed as ReviewDeliveryHandoffNotice;
  } catch {
    return null;
  }
}

export function clearReviewDeliveryHandoffNoticeForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(REVIEW_DELIVERY_HANDOFF_NOTICE_KEY);
  } catch {
    /* ignore */
  }
}
