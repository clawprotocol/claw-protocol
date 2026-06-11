import { describe, expect, it } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import type { OwnerReviewPartyStatusRow } from "./simpleProduct/ownerReviewPartyStatusChecklist";
import {
  deriveAgreementProgressTimeline,
  deriveDashboardWhatsNextPresentation,
  deriveWhatsNextHeadline,
} from "./dashboardWhatsNextPresentation";
import { deriveCreatorDashboardStatusPillFromGate } from "./creatorDashboardPresentation";
import { resolveCreatorDashboardReviewGate } from "./creatorDashboardReviewGate";

function row(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_test",
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
    review_approvals_required: 2,
    review_approvals_completed: 1,
    all_reviewers_approved: false,
    ...p,
  };
}

function reviewRows(): OwnerReviewPartyStatusRow[] {
  return [
    {
      partyIndex: 0,
      partyId: "p0",
      partyLabel: "Party 1",
      displayName: "Blue Canyon Analytics LLC",
      status: "approved",
      statusLabel: "Approved",
    },
    {
      partyIndex: 1,
      partyId: "p1",
      partyLabel: "Party 2",
      displayName: "Iron Vale Systems Inc",
      status: "not_reviewed",
      statusLabel: "Not reviewed",
    },
  ];
}

describe("dashboardWhatsNextPresentation", () => {
  it("headline names pending reviewer during in_review", () => {
    const gate = resolveCreatorDashboardReviewGate(row({}), reviewRows());
    expect(deriveWhatsNextHeadline(row({}), gate)).toBe("Review requested from Iron Vale Systems Inc");
  });

  it("timeline marks review sent current when approvals incomplete", () => {
    const gate = resolveCreatorDashboardReviewGate(row({}), reviewRows());
    const timeline = deriveAgreementProgressTimeline(row({}), gate);
    expect(timeline.find((s) => s.id === "review_sent")?.state).toBe("complete");
    expect(timeline.find((s) => s.id === "reviews_approved")?.state).toBe("current");
  });

  it("presentation surfaces next step for partial review", () => {
    const gate = resolveCreatorDashboardReviewGate(row({}), reviewRows());
    const presentation = deriveDashboardWhatsNextPresentation(row({}), gate);
    expect(presentation.progressLine).toBe("1 of 2 approved");
    expect(presentation.nextStepLabel).toBe("Wait for remaining reviewer");
  });

  it("two-party reviewer approval shows all reviews complete presentation", () => {
    const draft = {
      parties: [
        { id: "p-blue", name: "Blue Canyon Analytics LLC", role: "party" },
        { id: "p-iron", name: "Iron Vale Systems Inc", role: "reviewer", email: "iron@example.test" },
      ],
      audit_log: [
        {
          event_type: "participant_approved",
          at: "2026-06-07T00:00:00.000Z",
          value: { participant_id: "p-iron" },
        },
      ],
    } as import("../agreement/agreementTypes").AgreementDraft;
    const r = row({ all_reviewers_approved: false, review_approvals_completed: 0 });
    const gate = resolveCreatorDashboardReviewGate(r, [], { draft });
    const presentation = deriveDashboardWhatsNextPresentation(r, gate);
    const pill = deriveCreatorDashboardStatusPillFromGate(r, gate);
    expect(gate.requiredPartyCount).toBe(1);
    expect(gate.approvedCount).toBe(1);
    expect(presentation.headline).toBe("All reviews complete");
    expect(presentation.nextStepLabel).toBe("Prepare signature links");
    expect(pill).toBe("Ready for Signing");
  });

  it("does not show waiting-on-reviewer pill when index says all reviewers approved", () => {
    const r = row({ all_reviewers_approved: true, review_approvals_completed: 2 });
    const gate = resolveCreatorDashboardReviewGate(r, reviewRows());
    const presentation = deriveDashboardWhatsNextPresentation(r, gate);
    const pill = deriveCreatorDashboardStatusPillFromGate(r, gate);
    expect(presentation.headline).toBe("All reviews complete");
    expect(presentation.nextStepLabel).toBe("Prepare signature links");
    expect(pill).toBe("Ready for Signing");
    expect(pill).not.toBe("Waiting on reviewer");
  });

  it("pending reviewer with zero approvals suggests waiting, not track review", () => {
    const draft = {
      id: "ag_test",
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
    } as import("../agreement/agreementTypes").AgreementDraft;
    const r = row({ review_approvals_completed: 0, reviewer_approved: false });
    const gate = resolveCreatorDashboardReviewGate(r, [], { draft });
    const presentation = deriveDashboardWhatsNextPresentation(r, gate);
    expect(presentation.headline).toBe("Review requested from Iron Vale Systems Inc");
    expect(presentation.progressLine).toBe("0 of 1 approved");
    expect(presentation.nextStepLabel).toBe("Wait for reviewer approval");
  });

  it("ready for signing headline and next step", () => {
    const approvedRows: OwnerReviewPartyStatusRow[] = [
      {
        partyIndex: 0,
        partyId: "p0",
        partyLabel: "Party 1",
        displayName: "Blue Canyon Analytics LLC",
        status: "approved",
        statusLabel: "Approved",
      },
      {
        partyIndex: 1,
        partyId: "p1",
        partyLabel: "Party 2",
        displayName: "Iron Vale Systems Inc",
        status: "approved",
        statusLabel: "Approved",
      },
    ];
    const r = row({ all_reviewers_approved: true, review_approvals_completed: 2 });
    const gate = resolveCreatorDashboardReviewGate(r, approvedRows);
    const presentation = deriveDashboardWhatsNextPresentation(r, gate);
    expect(presentation.headline).toBe("All reviews complete");
    expect(presentation.nextStepLabel).toBe("Prepare signature links");
  });
});
