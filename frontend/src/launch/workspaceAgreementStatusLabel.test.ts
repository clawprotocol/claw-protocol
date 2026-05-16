import { describe, expect, it } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { workspaceAgreementStatusLabel } from "./AppDashboard";

function row(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "x",
    title: "T",
    updated_at: "2026-01-01T00:00:00Z",
    party_count: 2,
    signer_count: 1,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: null,
    ...p,
  };
}

describe("workspaceAgreementStatusLabel", () => {
  it("returns Signed when completed", () => {
    expect(workspaceAgreementStatusLabel(row({ completed_signed: true }))).toBe("Signed");
  });

  it("returns Ready to sign when server lock exists", () => {
    expect(
      workspaceAgreementStatusLabel(
        row({ has_server_signing_lock: true, locked_version_id: "v1", reviewer_approved: true }),
      ),
    ).toBe("Ready to sign");
  });

  it("returns Reviewer approved — ready to prepare signing when single reviewer path approved but not locked", () => {
    expect(
      workspaceAgreementStatusLabel(
        row({
          reviewer_approved: true,
          review_sent_at: "2026-01-01T00:00:00Z",
          review_approvals_required: 1,
          review_approvals_completed: 1,
          all_reviewers_approved: true,
        }),
      ),
    ).toBe("All reviewers approved — ready to prepare signing");
  });

  it("returns fractional status when some but not all reviewers approved", () => {
    expect(
      workspaceAgreementStatusLabel(
        row({
          reviewer_approved: true,
          review_sent_at: "2026-01-01T00:00:00Z",
          review_approvals_required: 4,
          review_approvals_completed: 1,
          all_reviewers_approved: false,
        }),
      ),
    ).toBe("1 of 4 reviewers approved");
  });

  it("returns Sent when review sent but not approved", () => {
    expect(
      workspaceAgreementStatusLabel(row({ review_sent_at: "2026-01-01T00:00:00Z" })),
    ).toBe("Sent");
  });
});
