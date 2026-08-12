/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaidProForcedFirstReviewChrome } from "./paidProForcedFirstReviewChrome";
import { PremiumSendNextStepFork } from "./PremiumSendNextStepFork";
import {
  PAID_PRO_DELIVERY_TRACK_REVIEW_CTA,
  PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION,
  PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE,
  PAID_PRO_DELIVERY_TRACK_SIGNATURE_CTA,
  PAID_PRO_DELIVERY_TRACK_SIGNATURE_TITLE,
} from "./paidProDeliveryTrackGtmCopy";

describe("paidProDeliveryTrackGtmCopy", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps Option B review/redline copy peer to Option A signing", () => {
    expect(PAID_PRO_DELIVERY_TRACK_SIGNATURE_CTA).toBe("Prepare for signing");
    expect(PAID_PRO_DELIVERY_TRACK_REVIEW_CTA).toBe("Send for review");
    expect(PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE).toMatch(/other parties/i);
    expect(PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION).toMatch(/private review links/i);
    expect(PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION).not.toMatch(/compare edits/i);
  });

  it("forced chrome shows equal dual-track cards when signers are ready", () => {
    const onShareForReview = vi.fn();
    const onPrepareSignatures = vi.fn();
    render(
      <PaidProForcedFirstReviewChrome
        signersReady
        signerMetadataFinalized
        postFinalizeCorpusHash="hash1"
        postFinalizeActionsReady
        getCopyPlainText={() => "body"}
        onEditAgreement={vi.fn()}
        onEditSignerDetails={vi.fn()}
        onExportAgreement={vi.fn()}
        onShareForReview={onShareForReview}
        onPrepareSignatures={onPrepareSignatures}
      />,
    );
    expect(screen.getByTestId("paid-pro-delivery-track-chooser")).toBeTruthy();
    expect(screen.getByTestId("paid-pro-delivery-track-signature-card").textContent).toContain(
      PAID_PRO_DELIVERY_TRACK_SIGNATURE_TITLE,
    );
    expect(screen.getByTestId("paid-pro-delivery-track-review-card").textContent).toContain(
      PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE,
    );
    expect(screen.getByTestId("paid-pro-delivery-track-review-card").textContent).toMatch(
      /private review links|Nothing is emailed/i,
    );
    fireEvent.click(screen.getByTestId("paid-pro-forced-share-for-review"));
    expect(onShareForReview).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("paid-pro-forced-prepare-signatures"));
    expect(onPrepareSignatures).toHaveBeenCalledTimes(1);
  });

  it("forced chrome foreshadows Option B before signer details are complete", () => {
    render(
      <PaidProForcedFirstReviewChrome
        signersReady={false}
        signerMetadataFinalized={false}
        getCopyPlainText={() => "body"}
        onEditAgreement={vi.fn()}
        onEditSignerDetails={vi.fn()}
        onExportAgreement={vi.fn()}
        onShareForReview={vi.fn()}
        onPrepareSignatures={vi.fn()}
      />,
    );
    expect(screen.getByTestId("paid-pro-delivery-track-before-signers-hint").textContent).toMatch(
      /reviewer emails|authorized signer/i,
    );
    expect(screen.getByTestId("paid-pro-forced-add-signer-details")).toBeTruthy();
    expect(screen.queryByTestId("paid-pro-delivery-track-chooser")).toBeNull();
  });

  it("PremiumSendNextStepFork defaults use the same GTM Option A/B copy", () => {
    render(<PremiumSendNextStepFork selected="review" onPick={() => {}} />);
    expect(screen.getByTestId("pro-delivery-track-review").textContent).toContain(
      PAID_PRO_DELIVERY_TRACK_REVIEW_CTA,
    );
    expect(screen.getByTestId("pro-delivery-track-signing").textContent).toContain(
      PAID_PRO_DELIVERY_TRACK_SIGNATURE_CTA,
    );
    expect(
      screen.getByTestId("pro-delivery-track-review").closest("div")?.textContent,
    ).toMatch(/private review links|other parties|Nothing is emailed/i);
  });
});
