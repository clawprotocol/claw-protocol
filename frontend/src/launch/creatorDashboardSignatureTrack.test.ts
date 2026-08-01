import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { resolveCreatorDashboardReviewGate } from "./creatorDashboardReviewGate";
import {
  CREATOR_VIEW_SIGNING_STATUS_LABEL,
} from "./creatorDashboardCopy";
import {
  CREATOR_COMPLETE_SIGNER_DETAILS_LABEL,
  CREATOR_REVIEW_SUGGESTED_CHANGES_LABEL,
  creatorDashboardShowManageRecipients,
  creatorDashboardWhatsNextShowPrimaryCta,
  creatorDashboardWhatsNextShowViewAgreement,
  creatorDashboardWhatsNextShowViewInAgreements,
  deriveCreatorDashboardEffectiveStatus,
  resolveCreatorDashboardSignatureTrackAction,
  resolveCreatorDashboardViewAgreementPath,
} from "./creatorDashboardSignatureTrack";
import {
  CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
  CREATOR_TRACK_REVIEW_STATUS_LABEL,
} from "./creatorDashboardCopy";
import {
  creatorDashboardPrepareSignatureLinksPath,
  creatorDashboardSignedAgreementViewPath,
  creatorDashboardSigningStatusPath,
} from "./creatorDashboardReviewLinkRouting";

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
    {
      id: "p-blue",
      name: "Blue Canyon Analytics LLC",
      role: "party",
      signerName: "Sarah Mitchell",
      signerTitle: "CEO",
      signerEmail: "sarah@bluecanyon.test",
      email: "sarah@bluecanyon.test",
    },
    {
      id: "p-iron",
      name: "Iron Vale Systems Inc",
      role: "reviewer",
      signerName: "Michael Torres",
      signerTitle: "President",
      signerEmail: "jki93@me.com",
      email: "jki93@me.com",
    },
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
    expect(action.path).toBe(creatorDashboardPrepareSignatureLinksPath(row.id));
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

  it("routes to signing status when signature links already exist", () => {
    const row = indexRow({ has_server_signing_lock: true });
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: partyTwoApprovedDraft });
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, {
      draft: partyTwoApprovedDraft,
    });
    expect(action.kind).toBe("view_signing_status");
    expect(action.label).toBe(CREATOR_VIEW_SIGNING_STATUS_LABEL);
    expect(action.path).toBe(creatorDashboardSigningStatusPath(row.id));
    expect(action.path).not.toContain("/app/send/");
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
    expect(action.path).toContain("/app/create?resume_signer_setup=");
    expect(action.path).not.toContain("/app/send/");
  });

  it("routes ready_for_signing with incomplete signer metadata to signer setup, not prepare/send", () => {
    const draft: AgreementDraft = {
      ...partyTwoApprovedDraft,
      parties: [
        { id: "p-blue", name: "Blue Canyon Analytics LLC", role: "party" },
        { id: "p-iron", name: "Iron Vale Systems Inc", role: "reviewer", email: "jki93@me.com" },
      ],
    };
    const row = indexRow({});
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft });
    expect(deriveCreatorDashboardEffectiveStatus(row, gate)).toBe("ready_for_signing");
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, { draft });
    expect(action.kind).toBe("complete_signer_details");
    expect(action.path).toContain("resume_signer_setup=");
    expect(action.path).not.toContain("/app/send/");
    expect(action.kind).not.toBe("prepare_signature_links");
  });

  it("routes paid Pro draft with incomplete signer metadata away from /app/send Continue Editing", () => {
    const draft: AgreementDraft = {
      ...partyTwoApprovedDraft,
      audit_log: [],
      parties: [
        { id: "p-blue", name: "Blue Canyon Analytics LLC", role: "party" },
        { id: "p-iron", name: "Iron Vale Systems Inc", role: "party" },
      ],
    };
    const row = indexRow({
      review_sent_at: null,
      reviewer_approved: false,
      all_reviewers_approved: false,
      review_approvals_required: 0,
      review_approvals_completed: 0,
    });
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft });
    expect(deriveCreatorDashboardEffectiveStatus(row, gate)).toBe("draft");
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, { draft });
    expect(action.kind).toBe("complete_signer_details");
    expect(action.label).toBe(CREATOR_COMPLETE_SIGNER_DETAILS_LABEL);
    expect(action.path).toBe(`/app/create?resume_signer_setup=${encodeURIComponent(row.id)}`);
    expect(action.path).not.toContain("/app/send/");
  });

  it("uses dashboard focus for manual in-review tracking instead of done page", () => {
    const pendingDraft: AgreementDraft = {
      ...partyTwoApprovedDraft,
      audit_log: [],
    };
    const row = indexRow({ review_approvals_completed: 0 });
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: pendingDraft });
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, {
      draft: pendingDraft,
      manualReviewLinkPage: true,
    });
    expect(action.kind).toBe("focus_review_status");
    expect(action.path).toBe("/app?focus=ag_track");
    expect(action.path).not.toContain("/app/done/");
  });

  it("routes revision requests to review suggested changes on done page", () => {
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
    expect(action.kind).toBe("review_suggested_changes");
    expect(action.label).toBe(CREATOR_REVIEW_SUGGESTED_CHANGES_LABEL);
    expect(action.path).toBe("/app/review-changes/ag_track");
    expect(creatorDashboardWhatsNextShowPrimaryCta(row, gate, action)).toBe(true);
  });

  it("offers view agreement path during normal pending review", () => {
    const pendingDraft: AgreementDraft = {
      ...partyTwoApprovedDraft,
      audit_log: [],
    };
    const row = indexRow({ review_approvals_completed: 0 });
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: pendingDraft });
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, { draft: pendingDraft });
    expect(creatorDashboardWhatsNextShowPrimaryCta(row, gate, action)).toBe(false);
    expect(creatorDashboardWhatsNextShowViewAgreement(row, gate, action)).toBe(true);
    expect(resolveCreatorDashboardViewAgreementPath(row.id)).toBe("/app/agreements/ag_track/view");
  });

  it("hides dead Track review status CTA during normal pending review", () => {
    const pendingDraft: AgreementDraft = {
      ...partyTwoApprovedDraft,
      audit_log: [],
    };
    const row = indexRow({ review_approvals_completed: 0 });
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: pendingDraft });
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, { draft: pendingDraft });
    expect(action.kind).toBe("focus_review_status");
    expect(action.label).toBe(CREATOR_TRACK_REVIEW_STATUS_LABEL);
    expect(creatorDashboardWhatsNextShowPrimaryCta(row, gate, action)).toBe(false);
  });

  it("shows manage recipients when in_review with zero approvals", () => {
    const pendingDraft: AgreementDraft = {
      ...partyTwoApprovedDraft,
      audit_log: [],
    };
    const row = indexRow({ review_approvals_completed: 0 });
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: pendingDraft });
    expect(creatorDashboardShowManageRecipients(row, gate)).toBe(true);
  });

  it("hides manage recipients when all reviewers approved", () => {
    const row = indexRow({});
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: partyTwoApprovedDraft });
    expect(creatorDashboardShowManageRecipients(row, gate)).toBe(false);
  });

  it("hides primary CTA and shows view-in-agreements for completed agreements", () => {
    const row = indexRow({ completed_signed: true });
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: partyTwoApprovedDraft });
    const action = resolveCreatorDashboardSignatureTrackAction(row, gate, { draft: partyTwoApprovedDraft });
    expect(action.path).toBe(creatorDashboardSignedAgreementViewPath(row.id));
    expect(action.path).not.toContain("/app/done/");
    expect(creatorDashboardWhatsNextShowPrimaryCta(row, gate, action)).toBe(false);
    expect(creatorDashboardWhatsNextShowViewInAgreements(row, gate)).toBe(true);
    expect(creatorDashboardWhatsNextShowViewAgreement(row, gate, action)).toBe(false);
  });

  it("shows manage recipients from index while draft hydration is pending", () => {
    const row = indexRow({
      review_approvals_completed: 0,
      reviewer_approved: false,
      all_reviewers_approved: false,
    });
    const gate = resolveCreatorDashboardReviewGate(row, [], { draft: null });
    expect(gate.authoritative).toBe(false);
    expect(creatorDashboardShowManageRecipients(row, gate)).toBe(true);
  });
});
