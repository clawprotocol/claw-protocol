/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { AccessProvider } from "../access/AccessContext";
import { RecipientPublicReviewRoute } from "./RecipientPublicReviewRoute";
import { RECIPIENT_APPROVED_LAWDOG_PROMO_LINE } from "./recipientPublicReviewChrome";

vi.mock("../launch/LaunchNavContext", () => ({
  useLaunchNav: () => ({ navigate: vi.fn() }),
}));

function MockApprovedWaitingReview(props: {
  onRecipientApprovedWaitingChange: (active: boolean) => void;
}) {
  useEffect(() => {
    props.onRecipientApprovedWaitingChange(true);
  }, [props.onRecipientApprovedWaitingChange]);

  return (
    <div data-testid="recipient-accepted-awaiting-lock-root">
      <div data-testid="recipient-review-approved-status">Reviewer approved this draft without requesting changes.</div>
      <div>Waiting for sender to finalize signing.</div>
      <h2>Want a copy?</h2>
      <button type="button">Download PDF</button>
      <button type="button">Download text</button>
      <button type="button">Copy text</button>
      <p data-testid="recipient-approved-lawdog-promo">{RECIPIENT_APPROVED_LAWDOG_PROMO_LINE}</p>
    </div>
  );
}

describe("RecipientPublicReviewRoute approved/waiting chrome", () => {
  afterEach(() => {
    cleanup();
  });

  it("hides Account / Current plan header aside when reviewer is approved and waiting", async () => {
    render(
      <AccessProvider>
        <RecipientPublicReviewRoute
          agreementId="ag_test308"
          onClose={vi.fn()}
          reviewGate={(gateProps) => <MockApprovedWaitingReview {...gateProps} />}
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recipient-accepted-awaiting-lock-root")).toBeTruthy();
    });

    expect(screen.queryByText("Account")).toBeNull();
    expect(screen.queryByText(/Current plan:/)).toBeNull();
    expect(screen.queryByText(/Account · Access/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Billing$/ })).toBeNull();
  });

  it("still renders approved status and Want a copy actions while account chrome is hidden", async () => {
    render(
      <AccessProvider>
        <RecipientPublicReviewRoute
          agreementId="ag_test308"
          onClose={vi.fn()}
          reviewGate={(gateProps) => <MockApprovedWaitingReview {...gateProps} />}
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recipient-review-approved-status")).toBeTruthy();
    });

    expect(screen.getByText("Waiting for sender to finalize signing.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Want a copy\?$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Download PDF$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Download text$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Copy text$/ })).toBeTruthy();
    expect(screen.getByTestId("recipient-approved-lawdog-promo").textContent).toContain(
      RECIPIENT_APPROVED_LAWDOG_PROMO_LINE,
    );
  });

  it("shows Account disclosure before approval waiting state activates", () => {
    render(
      <AccessProvider>
        <RecipientPublicReviewRoute
          agreementId="ag_test308"
          onClose={vi.fn()}
          reviewGate={() => <div data-testid="recipient-review-active">Review in progress</div>}
        />
      </AccessProvider>,
    );

    expect(screen.getByText("Account")).toBeTruthy();
    expect(screen.getByTestId("recipient-review-active")).toBeTruthy();
  });
});
