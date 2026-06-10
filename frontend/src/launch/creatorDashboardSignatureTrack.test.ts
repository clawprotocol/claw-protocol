import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { resolveCreatorDashboardReviewGate } from "./creatorDashboardReviewGate";
import {
  CREATOR_COMPLETE_SIGNER_DETAILS_LABEL,
  CREATOR_CONTINUE_SIGNING_LABEL,
  deriveCreatorDashboardEffectiveStatus,
  resolveCreatorDashboardSignatureTrackAction,
} from "./creatorDashboardSignatureTrack";
import {
  CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
  CREATOR_TRACK_REVIEW_STATUS_LABEL,
} from "./creatorDashboardCopy";

function indexRow(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_track",
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
    reviewer_approved: true,
    review_approvals_required: 2,
    review_approvals_completed: 0,
    all_reviewers_approved: false,
    ...p,
  };
}

const partyTwoApprovedDraft: AgreementDraft = {
  id: "ag_track",
  title: "Consulting Agreement",
  jurisdiction: "CA",
  parties: [
    { id: "p-blue", name: "Blue Canyon Analytics LLC", role: "party" },
    { id: "p-iron", name: "Iron Vale Systems Inc", role: "reviewer", email: "jki93@me.com" },
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
      value: { participant_id: "p-iron", message: "approved_current_draft" },
    },
  ],
};

describe("creatorDashboardSignatureTrack", () => {
  it("marks ready_for_signing when reviewer approves without changes even if index lags", () => {
    const row = indexRow({});
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: partyTwoApprovedDraft });
    expect(gate.allRequiredReviewPartiesApproved).toBe(true);
    expect(deriveCreatorDashboardEffectiveStatus(row, gate)).toBe("ready_for_signing");
  });

  it("uses Prepare signature links CTA after all reviewers approved", () => {
    const row = indexRow({});
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: partyTwoApprovedDraft });
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, {
      draft: partyTwoApprovedDraft,
    });
    expect(action.kind).toBe("prepare_signature_links");
    expect(action.label).toBe(CREATOR_PREPARE_SIGNATURE_LINKS_LABEL);
  });

  it("does not show Track review status after all reviewers approved", () => {
    const row = indexRow({});
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: partyTwoApprovedDraft });
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, {
      draft: partyTwoApprovedDraft,
    });
    expect(action.label).not.toBe(CREATOR_TRACK_REVIEW_STATUS_LABEL);
    expect(action.kind).not.toBe("focus_review_status");
  });

  it("uses Continue signing when signature links already exist", () => {
    const row = indexRow({ has_server_signing_lock: true });
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: partyTwoApprovedDraft });
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, {
      draft: partyTwoApprovedDraft,
    });
    expect(action.kind).toBe("open_signature_links");
    expect(action.label).toBe(CREATOR_CONTINUE_SIGNING_LABEL);
  });

  it("uses Complete signer details when party legal names are missing", () => {
    const draft: AgreementDraft = {
      ...partyTwoApprovedDraft,
      parties: [
        { id: "p-blue", name: "", role: "party" },
        { id: "p-iron", name: "Iron Vale Systems Inc", role: "reviewer", email: "jki93@me.com" },
      ],
    };
    const row = indexRow({});
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft });
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, { draft });
    expect(action.kind).toBe("complete_signer_details");
    expect(action.label).toBe(CREATOR_COMPLETE_SIGNER_DETAILS_LABEL);
  });

  it("does not advance to signature prep when open change requests exist", () => {
    const draft: AgreementDraft = {
      ...partyTwoApprovedDraft,
      audit_log: [
        {
          event_type: "recipient_proposal_pending",
          at: "2026-06-07T21:00:00.000Z",
          value: {
            proposal_id: "prop-iron",
            proposer_id: "p-iron",
            instruction: "Renumber",
            draft: { purpose: "Updated body" },
          },
        },
      ],
    };
    const row = indexRow({});
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft });
    expect(gate.hasOpenChangeRequests).toBe(true);
    expect(gate.allRequiredReviewPartiesApproved).toBe(false);
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, { draft });
    expect(action.kind).toBe("focus_review_status");
  });
});
