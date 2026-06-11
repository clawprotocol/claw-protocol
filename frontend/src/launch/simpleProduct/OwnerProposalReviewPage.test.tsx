/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import * as agreementWorkspaceApi from "../../agreement/agreementWorkspaceApi";
import { OwnerProposalReviewPage } from "./OwnerProposalReviewPage";

const mockNavigate = vi.fn();

vi.mock("../LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app/review-changes/ag_rev",
    search: "",
    hash: "",
    navigate: mockNavigate,
  }),
}));

function draftWithOpenProposal(): AgreementDraft {
  return {
    id: "ag_rev",
    title: "Consulting Agreement",
    jurisdiction: "CA",
    parties: [
      { id: "p1", name: "Blue Canyon LLC", role: "party" },
      { id: "p2", name: "Iron Vale Systems Inc", role: "reviewer", email: "iron@test.com" },
    ],
    purpose: "Payment within thirty (30) days after receipt.",
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-01-01T00:00:00.000Z" }],
    audit_log: [
      {
        event_type: "recipient_proposal_pending",
        at: "2026-01-02T01:00:00.000Z",
        value: {
          proposal_id: "prop-1",
          instruction: "Payment timing changed",
          proposer_id: "p2",
          proposer_display_name: "Iron Vale Systems Inc",
          draft: {
            title: "Consulting Agreement",
            jurisdiction: "CA",
            parties: [
              { id: "p1", name: "Blue Canyon LLC", role: "party" },
              { id: "p2", name: "Iron Vale Systems Inc", role: "reviewer" },
            ],
            purpose: "Payment within a fifteen (15) day period.",
            payment_terms: "Net 30",
            duration: "1y",
            due_date: null,
            effective_date: null,
          },
        },
      },
    ],
  } as AgreementDraft;
}

describe("OwnerProposalReviewPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("renders proposal diff and accept/decline actions", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: draftWithOpenProposal(),
    });

    render(<OwnerProposalReviewPage agreementId="ag_rev" />);

    await waitFor(() => {
      expect(screen.getByTestId("owner-proposal-review-panel")).toBeTruthy();
    });

    expect(screen.getByText("Consulting Agreement")).toBeTruthy();
    expect(screen.getByText("Suggested changes need your review")).toBeTruthy();
    expect(screen.getByText(/Iron Vale Systems Inc/)).toBeTruthy();
    expect(screen.getByTestId("owner-proposal-review-diff")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept proposed changes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Decline changes" })).toBeTruthy();
    expect(screen.queryByText("Send this agreement")).toBeNull();
  });

  it("shows empty state when no open proposals exist", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: { ...draftWithOpenProposal(), audit_log: [] },
    });

    render(<OwnerProposalReviewPage agreementId="ag_rev" />);

    await waitFor(() => {
      expect(screen.getByTestId("owner-proposal-review-empty")).toBeTruthy();
    });

    expect(screen.getByText("No suggested changes are pending.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(mockNavigate).toHaveBeenCalledWith("/app");
  });

  it("accept applies proposal via API", async () => {
    const applySpy = vi.spyOn(agreementWorkspaceApi, "applyRecipientProposalApi").mockResolvedValue({
      ok: true,
      draft: {
        ...draftWithOpenProposal(),
        purpose: "Payment within a fifteen (15) day period.",
        audit_log: [
          ...(draftWithOpenProposal().audit_log ?? []),
          { event_type: "recipient_proposal_applied", at: "2026-01-02T02:00:00.000Z", value: { proposal_id: "prop-1" } },
        ],
      },
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: draftWithOpenProposal(),
    });

    render(<OwnerProposalReviewPage agreementId="ag_rev" />);

    await waitFor(() => {
      expect(screen.getByTestId("owner-proposal-review-accept")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept proposed changes" }));

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledWith("ag_rev", "prop-1");
    });
  });

  it("decline rejects proposal without changing canonical purpose on refresh", async () => {
    const rejectSpy = vi.spyOn(agreementWorkspaceApi, "rejectRecipientProposalApi").mockResolvedValue({
      ok: true,
    });
    const fetchSpy = vi
      .spyOn(agreementWorkspaceApi, "fetchAgreementDraft")
      .mockResolvedValueOnce({ ok: true, draft: draftWithOpenProposal() })
      .mockResolvedValueOnce({
        ok: true,
        draft: {
          ...draftWithOpenProposal(),
          audit_log: [
            ...(draftWithOpenProposal().audit_log ?? []),
            { event_type: "recipient_proposal_rejected", at: "2026-01-02T02:00:00.000Z", value: { proposal_id: "prop-1" } },
          ],
        },
      });

    render(<OwnerProposalReviewPage agreementId="ag_rev" />);

    await waitFor(() => {
      expect(screen.getByTestId("owner-proposal-review-decline")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Decline changes" }));

    await waitFor(() => {
      expect(rejectSpy).toHaveBeenCalledWith("ag_rev", "prop-1");
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
