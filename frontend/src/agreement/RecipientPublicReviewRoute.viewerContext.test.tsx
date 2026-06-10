/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { AccessProvider } from "../access/AccessContext";
import { RecipientPublicReviewRoute } from "./RecipientPublicReviewRoute";
import { RECIPIENT_APPROVED_LAWDOG_PROMO_LINE } from "./recipientPublicReviewChrome";
import type { RecipientPostApprovalPresentation } from "./recipientApprovedWaitingPresentation";

const mockNavigate = vi.fn();

vi.mock("../launch/LaunchNavContext", () => ({
  useLaunchNav: () => ({ navigate: mockNavigate }),
}));

function assertNoCreatorChrome() {
  expect(screen.queryByText("Account")).toBeNull();
  expect(screen.queryByText(/Current plan:/)).toBeNull();
  expect(screen.queryByText(/Account · Access/)).toBeNull();
  expect(screen.queryByRole("button", { name: /^Billing$/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Dashboard$/ })).toBeNull();
}

describe("RecipientPublicReviewRoute viewer context chrome", () => {
  afterEach(() => {
    cleanup();
    mockNavigate.mockClear();
  });

  it("public Party 2 reviewer never renders Account or billing chrome", () => {
    render(
      <AccessProvider>
        <RecipientPublicReviewRoute
          agreementId="ag_party2"
          viewerContext="public_recipient"
          onClose={vi.fn()}
          reviewGate={() => <div data-testid="recipient-review-active">Review in progress</div>}
        />
      </AccessProvider>,
    );

    assertNoCreatorChrome();
    expect(screen.getByTestId("recipient-review-active")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "← Home" })).toBeNull();
  });

  it("public Party 2 has no Home navigation to owner routes", () => {
    render(
      <AccessProvider>
        <RecipientPublicReviewRoute
          agreementId="ag_party2"
          viewerContext="public_recipient"
          onClose={vi.fn()}
          reviewGate={() => <div>Review</div>}
        />
      </AccessProvider>,
    );

    expect(screen.queryByRole("button", { name: "← Home" })).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("QA Party 1 simulation never renders Account/Dashboard and Home returns to Review Link Ready", () => {
    render(
      <AccessProvider>
        <RecipientPublicReviewRoute
          agreementId="ag_qa"
          viewerContext="qa_recipient_simulation"
          ownerReturnPath="/app/done/ag_qa"
          onClose={vi.fn()}
          reviewGate={() => <div data-testid="qa-reviewer-view">QA reviewer</div>}
        />
      </AccessProvider>,
    );

    assertNoCreatorChrome();
    expect(screen.getByTestId("qa-reviewer-view")).toBeTruthy();
    expect(screen.getByTestId("recipient-public-review-route").getAttribute("data-lawdog-viewer-context")).toBe(
      "qa_recipient_simulation",
    );

    screen.getByRole("button", { name: "← Review Link Ready" }).click();
    expect(mockNavigate).toHaveBeenCalledWith("/app/done/ag_qa");
    expect(mockNavigate).not.toHaveBeenCalledWith("/app");
  });

  it("approved/waiting public recipient keeps review actions without creator chrome", async () => {
    const presentation: RecipientPostApprovalPresentation = {
      audience: "public_recipient",
      shellHeroTitle: "Review submitted",
      shellHeroSubtitle: null,
      statusBanner: null,
      waitingPanel: {
        header: "Review submitted",
        body: "Your review has been recorded. You can close this page. The agreement owner will continue the signing process.",
        actions: [{ kind: "done", label: "Done", emphasis: "primary" }],
        pollHint: null,
      },
    };

    function ApprovedWaitingMock(props: {
      onPresentationChange: (value: RecipientPostApprovalPresentation | null) => void;
    }) {
      useEffect(() => {
        props.onPresentationChange(presentation);
        return () => props.onPresentationChange(null);
      }, [props]);
      return (
        <div data-testid="recipient-accepted-awaiting-lock-root">
          <h2>Want a copy?</h2>
          <button type="button">Download PDF</button>
          <p data-testid="recipient-approved-lawdog-promo">{RECIPIENT_APPROVED_LAWDOG_PROMO_LINE}</p>
        </div>
      );
    }

    render(
      <AccessProvider>
        <RecipientPublicReviewRoute
          agreementId="ag_test308"
          viewerContext="public_recipient"
          onClose={vi.fn()}
          reviewGate={({ onRecipientPostApprovalPresentationChange }) => (
            <ApprovedWaitingMock onPresentationChange={onRecipientPostApprovalPresentationChange} />
          )}
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recipient-accepted-awaiting-lock-root")).toBeTruthy();
    });

    assertNoCreatorChrome();
    expect(screen.getByRole("heading", { name: "Review submitted" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Want a copy\?$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Download PDF$/ })).toBeTruthy();
  });
});
