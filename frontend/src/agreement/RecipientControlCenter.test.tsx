/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchStatus = vi.hoisted(() => vi.fn());

vi.mock("./recipientDeliveryStatus", async () => {
  const actual = await vi.importActual<typeof import("./recipientDeliveryStatus")>(
    "./recipientDeliveryStatus",
  );
  return {
    ...actual,
    fetchRecipientDeliveryStatus: mockFetchStatus,
  };
});

import { RecipientControlCenter } from "./RecipientControlCenter";

describe("RecipientControlCenter", () => {
  beforeEach(() => {
    cleanup();
    mockFetchStatus.mockReset();
    mockFetchStatus.mockResolvedValue({
      ok: true,
      review_sent: true,
      signing_invites_sent: false,
      recipients: [
        {
          phase: "review",
          participant_id: "p_cp",
          entity_name: "Counterparty LLC",
          human_name: null,
          email: "reviewer@example.com",
          role: "reviewer",
          status: "sent",
          last_sent_at: "2026-06-07T12:00:00Z",
          last_opened_at: null,
          resent_count: 0,
          locked: false,
          lock_reason: null,
          can_correct_email: true,
          can_resend_invite: true,
          can_copy_link: true,
        },
        {
          phase: "review",
          participant_id: "p_owner2",
          entity_name: "Other LLC",
          human_name: null,
          email: "other@example.com",
          role: "reviewer",
          status: "approved",
          last_sent_at: "2026-06-07T12:00:00Z",
          last_opened_at: "2026-06-07T13:00:00Z",
          resent_count: 1,
          locked: true,
          lock_reason: "This reviewer already approved.",
          can_correct_email: false,
          can_resend_invite: false,
          can_copy_link: false,
        },
      ],
    });
  });

  it("shows sent and approved states from delivery status API", async () => {
    render(
      <RecipientControlCenter
        agreementId="ag_test"
        phase="review"
        linkByParticipantKey={{ "review:p_cp": "https://app.example.com/review?token=abc" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recipient-control-status-review-p_cp").textContent).toMatch(/Sent/);
    });
    expect(screen.getByTestId("recipient-control-status-review-p_owner2").textContent).toMatch(/Approved/);
    expect(screen.getByTestId("recipient-control-resend-review:p_cp")).toBeTruthy();
    expect(screen.queryByTestId("recipient-control-correct-review:p_owner2")).toBeNull();
  });

  it("shows inline error when delivery status API fails", async () => {
    mockFetchStatus.mockResolvedValue(null);
    render(<RecipientControlCenter agreementId="ag_fail" phase="review" />);

    await waitFor(() => {
      expect(screen.getByTestId("recipient-control-center-error").textContent).toMatch(
        /Could not load recipient status/i,
      );
    });
    expect(screen.getByTestId("recipient-control-center-retry").textContent).toMatch(/Retry/i);
    expect(screen.queryByTestId("recipient-control-row-review-p_cp")).toBeNull();
  });
});
