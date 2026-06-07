/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
      />,
    );

    expect(screen.getByTestId("creator-dashboard-all-approved")).toBeTruthy();
    expect(screen.getByTestId("creator-dashboard-review-party-0").textContent).toContain(
      "Blue Canyon Analytics LLC",
    );
    expect(screen.getByTestId("creator-dashboard-review-party-1").textContent).toContain(
      "Iron Vale Systems Inc.",
    );
    expect(screen.getByRole("button", { name: "Prepare Signature Links" })).toBeTruthy();
  });
});
