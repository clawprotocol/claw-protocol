/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { DashboardWhatsNextPanel } from "./DashboardWhatsNextPanel";

function indexRow(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_whats_next",
    title: "Consulting Agreement",
    updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: "2026-01-02T00:00:00Z",
    reviewer_approved: false,
    review_approvals_required: 1,
    review_approvals_completed: 0,
    all_reviewers_approved: false,
    ...p,
  };
}

const pendingReviewerDraft: AgreementDraft = {
  id: "ag_whats_next",
  title: "Consulting Agreement",
  jurisdiction: "CA",
  parties: [
    { id: "p-blue", name: "Blue Canyon Analytics LLC", role: "party" },
    { id: "p-iron", name: "Iron Vale Systems Inc", role: "reviewer", email: "iron@example.test" },
  ],
  purpose: "Services",
  payment_terms: "Net 30",
  duration: "1y",
  due_date: null,
  effective_date: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T12:00:00.000Z",
  versions: [{ version: 1, created_at: "2026-01-01T00:00:00.000Z" }],
  audit_log: [],
};

const reviewerApprovedDraft: AgreementDraft = {
  ...pendingReviewerDraft,
  audit_log: [
    {
      event_type: "participant_approved",
      at: "2026-06-07T00:00:00.000Z",
      value: { participant_id: "p-iron" },
    },
  ],
};

const revisionRequestedDraft: AgreementDraft = {
  ...pendingReviewerDraft,
  audit_log: [
    {
      event_type: "recipient_proposal_pending",
      at: "2026-06-07T21:00:00.000Z",
      value: {
        proposal_id: "prop-iron",
        proposer_id: "p-iron",
        instruction: "Update payment terms",
        draft: { purpose: "Updated body" },
      },
    },
  ],
};

describe("DashboardWhatsNextPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows status and timeline without dead Track review status CTA while waiting", () => {
    const onNavigate = vi.fn();
    render(
      <DashboardWhatsNextPanel
        row={indexRow({})}
        reviewRows={[]}
        draft={pendingReviewerDraft}
        onPrimaryAction={vi.fn()}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText("Review requested from Iron Vale Systems Inc")).toBeTruthy();
    expect(screen.getByText("0 of 1 approved")).toBeTruthy();
    expect(screen.getByTestId("agreement-progress-timeline")).toBeTruthy();
    expect(screen.getByTestId("dashboard-whats-next-step").textContent).toContain(
      "Wait for reviewer approval",
    );
    expect(screen.getByTestId("creator-dashboard-action-hidden-ag_whats_next")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Track review status" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Prepare signature links" })).toBeNull();

    const viewAgreement = screen.getByRole("button", { name: "View agreement" });
    expect(viewAgreement.getAttribute("data-dashboard-whats-next-cta")).toBe("view_agreement");
    fireEvent.click(viewAgreement);
    expect(onNavigate).toHaveBeenCalledWith("/app/agreements/ag_whats_next/view");
  });

  it("shows Prepare signature links CTA when ready for signing", () => {
    const onPrepare = vi.fn();
    render(
      <DashboardWhatsNextPanel
        row={indexRow({})}
        reviewRows={[]}
        draft={reviewerApprovedDraft}
        onPrimaryAction={vi.fn()}
        onPrepareSignatureLinks={onPrepare}
      />,
    );

    const button = screen.getByRole("button", { name: "Prepare signature links" });
    expect(button.getAttribute("data-dashboard-whats-next-cta")).toBe("prepare_signature_links");
    fireEvent.click(button);
    expect(onPrepare).toHaveBeenCalledWith("ag_whats_next");
  });

  it("shows Review suggested changes CTA when revision is requested", () => {
    const onNavigate = vi.fn();
    render(
      <DashboardWhatsNextPanel
        row={indexRow({})}
        reviewRows={[]}
        draft={revisionRequestedDraft}
        onPrimaryAction={vi.fn()}
        onNavigate={onNavigate}
      />,
    );

    const button = screen.getByRole("button", { name: "Review suggested changes" });
    expect(button.getAttribute("data-dashboard-whats-next-cta")).toBe("review_suggested_changes");
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalledWith("/app/review-changes/ag_whats_next");
    expect(screen.queryByRole("button", { name: "View agreement" })).toBeNull();
  });
});
