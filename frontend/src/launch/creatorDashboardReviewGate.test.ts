import { describe, expect, it } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import type { OwnerReviewPartyStatusRow } from "./simpleProduct/ownerReviewPartyStatusChecklist";
import {
  creatorDashboardWaitingOnReviewer,
  formatCreatorReviewProgressLabel,
  resolveCreatorDashboardReviewGate,
} from "./creatorDashboardReviewGate";

function indexRow(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_gate",
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
    review_approvals_required: 1,
    review_approvals_completed: 1,
    all_reviewers_approved: false,
    ...p,
  };
}

const partyOneApprovedRows: OwnerReviewPartyStatusRow[] = [
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
    status: "not_reviewed",
    statusLabel: "Not reviewed",
  },
];

describe("creatorDashboardReviewGate", () => {
  it("uses authoritative party count from draft rows, not approved count", () => {
    const gate = resolveCreatorDashboardReviewGate(indexRow({}), partyOneApprovedRows);
    expect(gate.requiredPartyCount).toBe(2);
    expect(gate.approvedCount).toBe(1);
    expect(gate.allRequiredReviewPartiesApproved).toBe(false);
    expect(formatCreatorReviewProgressLabel(gate)).toBe("1 of 2 approved");
    expect(creatorDashboardWaitingOnReviewer(gate)).toBe(true);
  });

  it("returns pending hydration without index fallback when draft rows are missing", () => {
    const gate = resolveCreatorDashboardReviewGate(indexRow({}), []);
    expect(gate.source).toBe("pending_hydration");
    expect(gate.authoritative).toBe(false);
    expect(gate.requiredPartyCount).toBe(0);
    expect(gate.approvedCount).toBe(0);
    expect(gate.allRequiredReviewPartiesApproved).toBe(false);
    expect(formatCreatorReviewProgressLabel(gate)).toBeNull();
    expect(creatorDashboardWaitingOnReviewer(gate)).toBe(false);
  });

  it("trusts workspace index when all reviewers approved but draft rows lag", () => {
    const gate = resolveCreatorDashboardReviewGate(
      indexRow({ all_reviewers_approved: true, review_approvals_completed: 2 }),
      partyOneApprovedRows,
    );
    expect(gate.allRequiredReviewPartiesApproved).toBe(true);
    expect(gate.requiredPartyCount).toBe(2);
    expect(gate.approvedCount).toBe(2);
    expect(creatorDashboardWaitingOnReviewer(gate)).toBe(false);
  });

  it("uses workspace index summary when draft rows are still hydrating", () => {
    const gate = resolveCreatorDashboardReviewGate(
      indexRow({ all_reviewers_approved: true, review_approvals_completed: 2 }),
      [],
    );
    expect(gate.source).toBe("workspace_index_summary");
    expect(gate.allRequiredReviewPartiesApproved).toBe(true);
    expect(gate.requiredPartyCount).toBe(2);
  });

  it("marks all approved when every draft party row is approved", () => {
    const gate = resolveCreatorDashboardReviewGate(
      indexRow({ all_reviewers_approved: true, review_approvals_completed: 2 }),
      partyOneApprovedRows.map((row, index) =>
        index === 1 ? { ...row, status: "approved", statusLabel: "Approved" } : row,
      ),
    );
    expect(gate.allRequiredReviewPartiesApproved).toBe(true);
    expect(formatCreatorReviewProgressLabel(gate)).toBe("2 of 2 approved");
  });
});
