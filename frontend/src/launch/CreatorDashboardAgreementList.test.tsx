/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CreatorDashboardAgreementList } from "./CreatorDashboardAgreementList";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";

function indexRow(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_ready",
    title: "Services Agreement",
    updated_at: "2026-05-01T12:00:00.000Z",
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: "2026-05-01T10:00:00.000Z",
    reviewer_approved: true,
    review_approvals_required: 2,
    review_approvals_completed: 2,
    all_reviewers_approved: true,
    ...p,
  };
}

describe("CreatorDashboardAgreementList", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows review hydration skeleton instead of index-derived review state", () => {
    render(
      <CreatorDashboardAgreementList
        rows={[
          indexRow({
            reviewer_approved: true,
            review_approvals_required: 1,
            review_approvals_completed: 1,
            all_reviewers_approved: false,
          }),
        ]}
        reviewRowsByAgreementId={{}}
        onNavigate={vi.fn()}
        onPrepareSignatureLinks={vi.fn()}
        featured
      />,
    );

    expect(screen.getByTestId("creator-dashboard-agreement-skeleton-ag_ready")).toBeTruthy();
    expect(screen.getByTestId("creator-dashboard-review-hydrating-ag_ready").textContent).toContain(
      "Loading review status",
    );
    expect(screen.queryByText("Ready for Signing")).toBeNull();
    expect(screen.queryByText("1 of 1 approved")).toBeNull();
    expect(screen.queryByText("Reviews approved")).toBeNull();
    expect(screen.queryByRole("button", { name: "Prepare and send signing links" })).toBeNull();
  });

  it("shows per-party review status and prepare signature CTA when all approved", () => {
    render(
      <CreatorDashboardAgreementList
        rows={[indexRow({})]}
        reviewRowsByAgreementId={{
          ag_ready: [
            {
              partyIndex: 0,
              partyLabel: "Party 1",
              displayName: "Blue Canyon Analytics LLC",
              partyId: "p1",
              status: "approved",
              statusLabel: "Approved",
            },
            {
              partyIndex: 1,
              partyLabel: "Party 2",
              displayName: "Iron Vale Systems Inc.",
              partyId: "p2",
              status: "approved",
              statusLabel: "Approved",
            },
          ],
        }}
        onNavigate={vi.fn()}
        onPrepareSignatureLinks={vi.fn()}
        manualReviewLinkPage
        featured
      />,
    );

    expect(screen.getByTestId("creator-dashboard-all-approved")).toBeTruthy();
    expect(screen.getByTestId("creator-dashboard-review-party-0").textContent).toContain(
      "Blue Canyon Analytics LLC",
    );
    expect(screen.getByTestId("creator-dashboard-review-party-1").textContent).toContain(
      "Iron Vale Systems Inc.",
    );
    expect(screen.getByText(/Next action:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prepare and send signing links" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open review link page" })).toBeTruthy();
    expect(screen.getByText("Ready for Signing")).toBeTruthy();
    expect(
      screen.getByText("Everyone approved this draft. Review field placement, then LawDog sends signing links to all parties."),
    ).toBeTruthy();
  });

  it("in_review email-mode card uses track review status without done/send links", () => {
    const onNavigate = vi.fn();
    const onFocus = vi.fn();
    render(
      <CreatorDashboardAgreementList
        rows={[
          indexRow({
            id: "ag_in_review",
            reviewer_approved: false,
            review_approvals_required: 2,
            review_approvals_completed: 0,
            all_reviewers_approved: false,
          }),
        ]}
        reviewRowsByAgreementId={{
          ag_in_review: [
            {
              partyIndex: 0,
              partyLabel: "Party 1",
              displayName: "Owner Co",
              partyId: "p1",
              status: "approved",
              statusLabel: "Approved",
            },
            {
              partyIndex: 1,
              partyLabel: "Party 2",
              displayName: "Reviewer Co",
              partyId: "p2",
              status: "not_reviewed",
              statusLabel: "Not reviewed",
            },
          ],
        }}
        onNavigate={onNavigate}
        onFocusReviewStatus={onFocus}
        onPrepareSignatureLinks={vi.fn()}
        manualReviewLinkPage={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Track review status" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open workspace" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue review" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open review link page" })).toBeNull();

    fireEvent.click(screen.getByTestId("creator-dashboard-action-ag_in_review"));
    expect(onFocus).toHaveBeenCalledWith("ag_in_review");
    expect(onNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
    expect(onNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/send/"));
  });

  it("shows waiting-on-reviewer state when one required reviewer still pending", () => {
    render(
      <CreatorDashboardAgreementList
        rows={[
          indexRow({
            reviewer_approved: true,
            review_approvals_required: 2,
            review_approvals_completed: 1,
            all_reviewers_approved: false,
          }),
        ]}
        reviewRowsByAgreementId={{
          ag_ready: [
            {
              partyIndex: 0,
              partyLabel: "Party 1",
              displayName: "Iron Vale Systems Inc.",
              partyId: "p-rev-1",
              status: "approved",
              statusLabel: "Approved",
            },
            {
              partyIndex: 1,
              partyLabel: "Party 2",
              displayName: "North Ridge Consulting LLC",
              partyId: "p-rev-2",
              status: "not_reviewed",
              statusLabel: "Not reviewed",
            },
          ],
        }}
        onNavigate={vi.fn()}
        onPrepareSignatureLinks={vi.fn()}
        featured
      />,
    );

    expect(screen.getByText("Waiting on reviewer")).toBeTruthy();
    expect(screen.getByText(/Review progress:/)).toBeTruthy();
    expect(screen.getByText(/1 of 2 approved/)).toBeTruthy();
    expect(screen.getByText(/North Ridge Consulting LLC — Not reviewed/)).toBeTruthy();
    expect(screen.getByText(/Signature links unlock after all parties approve\./)).toBeTruthy();
    expect(screen.getByTestId("creator-dashboard-agreement-ag_ready").getAttribute("data-creator-dashboard-prepare-enabled")).toBe(
      "false",
    );
  });

  it("shows blocked notice when prepare is clicked before all required reviewers approve", () => {
    const onPrepare = vi.fn();
    render(
      <CreatorDashboardAgreementList
        rows={[
          indexRow({
            reviewer_approved: true,
            review_approvals_required: 2,
            review_approvals_completed: 1,
            all_reviewers_approved: false,
          }),
        ]}
        reviewRowsByAgreementId={{
          ag_ready: [
            {
              partyIndex: 0,
              partyLabel: "Party 1",
              displayName: "Iron Vale Systems Inc.",
              partyId: "p-rev-1",
              status: "approved",
              statusLabel: "Approved",
            },
            {
              partyIndex: 1,
              partyLabel: "Party 2",
              displayName: "North Ridge Consulting LLC",
              partyId: "p-rev-2",
              status: "not_reviewed",
              statusLabel: "Not reviewed",
            },
          ],
        }}
        onNavigate={vi.fn()}
        onPrepareSignatureLinks={onPrepare}
        manualReviewLinkPage
        featured
      />,
    );

    fireEvent.click(screen.getByTestId("creator-dashboard-action-ag_ready"));
    expect(onPrepare).not.toHaveBeenCalled();
    expect(screen.getByTestId("creator-dashboard-prepare-blocked-notice-ag_ready").textContent).toContain(
      "Signature links are available after all parties approve the review.",
    );
  });

  it("calls onPrepareSignatureLinks for the primary CTA when all approved", () => {
    const onPrepare = vi.fn();
    render(
      <CreatorDashboardAgreementList
        rows={[indexRow({})]}
        reviewRowsByAgreementId={{
          ag_ready: [
            {
              partyIndex: 0,
              partyLabel: "Party 1",
              displayName: "Blue Canyon Analytics LLC",
              partyId: "p1",
              status: "approved",
              statusLabel: "Approved",
            },
            {
              partyIndex: 1,
              partyLabel: "Party 2",
              displayName: "Iron Vale Systems Inc.",
              partyId: "p2",
              status: "approved",
              statusLabel: "Approved",
            },
          ],
        }}
        onNavigate={vi.fn()}
        onPrepareSignatureLinks={onPrepare}
        featured
      />,
    );

    fireEvent.click(screen.getByTestId("creator-dashboard-action-ag_ready"));
    expect(onPrepare).toHaveBeenCalledWith("ag_ready");
  });
});
