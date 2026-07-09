/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearReviewDeliveryHandoffNoticeForTests,
  consumeReviewDeliveryHandoffNotice,
  REVIEW_DELIVERY_HANDOFF_NOTICE_KEY,
  reviewDeliveryHandoffNoticeCopy,
  reviewDeliveryHandoffNoticeKindFromRouteReason,
  writeReviewDeliveryHandoffNotice,
} from "./reviewDeliveryHandoffNotice";
import { initializeNewAgreementSession } from "./newAgreementSessionReset";

describe("reviewDeliveryHandoffNotice", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearReviewDeliveryHandoffNoticeForTests();
  });

  afterEach(() => {
    clearReviewDeliveryHandoffNoticeForTests();
  });

  it("maps route reasons to notice kinds and copy", () => {
    expect(reviewDeliveryHandoffNoticeKindFromRouteReason("review_sent_ok")).toBe(
      "review_invitations_sent",
    );
    expect(reviewDeliveryHandoffNoticeKindFromRouteReason("review_email_delivery_incomplete")).toBe(
      "review_email_delivery_incomplete",
    );
    expect(reviewDeliveryHandoffNoticeKindFromRouteReason("review_sent_ok")).toBe(
      "review_invitations_sent",
    );
    expect(reviewDeliveryHandoffNoticeCopy("review_email_delivery_incomplete").title).toContain(
      "Review links",
    );
  });

  it("write then consume returns one-shot notice", () => {
    writeReviewDeliveryHandoffNotice({
      agreementId: "ag_notice_1",
      routeReason: "review_email_delivery_incomplete",
    });
    const first = consumeReviewDeliveryHandoffNotice();
    expect(first?.agreementId).toBe("ag_notice_1");
    expect(first?.kind).toBe("review_email_delivery_incomplete");
    expect(consumeReviewDeliveryHandoffNotice()).toBeNull();
  });

  it("initializeNewAgreementSession clears pending handoff notice key", () => {
    writeReviewDeliveryHandoffNotice({
      agreementId: "ag_reset",
      routeReason: "review_sent_ok",
    });
    expect(sessionStorage.getItem(REVIEW_DELIVERY_HANDOFF_NOTICE_KEY)).toBeTruthy();
    initializeNewAgreementSession();
    expect(sessionStorage.getItem(REVIEW_DELIVERY_HANDOFF_NOTICE_KEY)).toBeNull();
  });
});
