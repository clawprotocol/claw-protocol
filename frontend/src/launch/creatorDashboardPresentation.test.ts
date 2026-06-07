import { describe, expect, it } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  countCreatorDashboardMetrics,
  creatorDashboardPrimaryAction,
  deriveCreatorDashboardStatus,
} from "./creatorDashboardPresentation";

function row(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_test",
    title: "Consulting Agreement",
    updated_at: "2026-01-01T00:00:00Z",
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: null,
    ...p,
  };
}

describe("creatorDashboardPresentation", () => {
  it("maps workspace rows to dashboard statuses and metrics", () => {
    const rows = [
      row({ id: "d1" }),
      row({ id: "d2", review_sent_at: "2026-01-01T00:00:00Z" }),
      row({
        id: "d3",
        review_sent_at: "2026-01-01T00:00:00Z",
        all_reviewers_approved: true,
        reviewer_approved: true,
        review_approvals_required: 2,
        review_approvals_completed: 2,
      }),
      row({ id: "d4", completed_signed: true }),
    ];
    expect(deriveCreatorDashboardStatus(rows[0]!)).toBe("draft");
    expect(deriveCreatorDashboardStatus(rows[1]!)).toBe("in_review");
    expect(deriveCreatorDashboardStatus(rows[2]!)).toBe("ready_for_signing");
    expect(deriveCreatorDashboardStatus(rows[3]!)).toBe("completed");
    expect(countCreatorDashboardMetrics(rows)).toEqual({
      drafts: 1,
      in_review: 1,
      ready_for_signing: 1,
      completed: 1,
    });
  });

  it("surfaces action-oriented CTAs per status", () => {
    expect(creatorDashboardPrimaryAction(row({})).label).toBe("Continue Editing");
    expect(creatorDashboardPrimaryAction(row({ review_sent_at: "2026-01-01T00:00:00Z" })).label).toBe(
      "View Review Status",
    );
    expect(
      creatorDashboardPrimaryAction(
        row({
          all_reviewers_approved: true,
          reviewer_approved: true,
          review_approvals_required: 2,
          review_approvals_completed: 2,
        }),
      ).label,
    ).toBe("Prepare Signature Links");
    expect(creatorDashboardPrimaryAction(row({ has_server_signing_lock: true })).label).toBe(
      "View Signing Status",
    );
    expect(creatorDashboardPrimaryAction(row({ completed_signed: true })).label).toBe("View Agreement");
  });
});
