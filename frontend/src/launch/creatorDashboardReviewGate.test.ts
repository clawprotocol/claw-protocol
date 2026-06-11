import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../agreement/agreementTypes";
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
  it("counts only required reviewer parties, not owner/client", () => {
    const gate = resolveCreatorDashboardReviewGate(indexRow({}), partyOneApprovedRows);
    expect(gate.requiredPartyCount).toBe(1);
    expect(gate.approvedCount).toBe(0);
    expect(gate.allRequiredReviewPartiesApproved).toBe(false);
    expect(formatCreatorReviewProgressLabel(gate)).toBe("0 of 1 approved");
    expect(creatorDashboardWaitingOnReviewer(gate)).toBe(false);
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
      indexRow({ all_reviewers_approved: true, review_approvals_completed: 1 }),
      partyOneApprovedRows,
    );
    expect(gate.allRequiredReviewPartiesApproved).toBe(true);
    expect(gate.requiredPartyCount).toBe(1);
    expect(gate.approvedCount).toBe(1);
    expect(creatorDashboardWaitingOnReviewer(gate)).toBe(false);
  });

  it("uses draft approval aggregate when only reviewer party approved", () => {
    const draft: AgreementDraft = {
      id: "ag_gate",
      title: "Consulting Agreement",
      jurisdiction: "CA",
      parties: [
        { id: "p1", name: "Blue Canyon Analytics LLC", role: "party" },
        { id: "p2", name: "Iron Vale Systems Inc.", role: "reviewer", email: "iron@example.test" },
      ],
      purpose: "Services",
      payment_terms: "Net 30",
      duration: "1y",
      due_date: null,
      effective_date: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T12:00:00.000Z",
      versions: [{ version: 1, created_at: "2026-01-01T00:00:00.000Z" }],
      audit_log: [
        {
          event_type: "participant_approved",
          at: "2026-06-07T00:00:00.000Z",
          value: { participant_id: "p2", message: "approved_current_draft" },
        },
      ],
    };
    const gate = resolveCreatorDashboardReviewGate(indexRow({}), partyOneApprovedRows, { draft });
    expect(gate.allRequiredReviewPartiesApproved).toBe(true);
    expect(gate.approvedCount).toBe(1);
    expect(gate.requiredPartyCount).toBe(1);
  });

  it("uses workspace index summary when draft rows are still hydrating", () => {
    const gate = resolveCreatorDashboardReviewGate(
      indexRow({ all_reviewers_approved: true, review_approvals_completed: 1 }),
      [],
    );
    expect(gate.source).toBe("workspace_index_summary");
    expect(gate.allRequiredReviewPartiesApproved).toBe(true);
    expect(gate.requiredPartyCount).toBe(1);
  });

  it("marks all approved when required reviewer party is approved", () => {
    const gate = resolveCreatorDashboardReviewGate(
      indexRow({ all_reviewers_approved: true, review_approvals_completed: 1 }),
      partyOneApprovedRows.map((row, index) =>
        index === 1 ? { ...row, status: "approved", statusLabel: "Approved" } : row,
      ),
    );
    expect(gate.allRequiredReviewPartiesApproved).toBe(true);
    expect(formatCreatorReviewProgressLabel(gate)).toBe("1 of 1 approved");
  });

  it("blocks signature prep when reviewer requested changes", () => {
    const draft: AgreementDraft = {
      id: "ag_gate",
      title: "Consulting Agreement",
      jurisdiction: "CA",
      parties: [
        { id: "p1", name: "Blue Canyon Analytics LLC", role: "party" },
        { id: "p2", name: "Iron Vale Systems Inc.", role: "reviewer", email: "iron@example.test" },
      ],
      purpose: "Services",
      payment_terms: "Net 30",
      duration: "1y",
      due_date: null,
      effective_date: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T12:00:00.000Z",
      versions: [{ version: 1, created_at: "2026-01-01T00:00:00.000Z" }],
      audit_log: [
        {
          event_type: "recipient_proposal_pending",
          at: "2026-06-07T21:00:00.000Z",
          value: {
            proposal_id: "prop-2",
            proposer_id: "p2",
            instruction: "Update terms",
            draft: { purpose: "Updated" },
          },
        },
      ],
    };
    const gate = resolveCreatorDashboardReviewGate(indexRow({}), [], { draft });
    expect(gate.hasOpenChangeRequests).toBe(true);
    expect(gate.allRequiredReviewPartiesApproved).toBe(false);
  });
});
