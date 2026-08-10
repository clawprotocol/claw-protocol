import { describe, expect, it } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  selectDashboardAuditHydrationRows,
  selectDashboardPriorityHydrationRows,
  selectDashboardSigningProgressHydrationRows,
  seedAuditCompletedFromWorkspaceIndex,
  sliceDashboardHomeTableRows,
  DASHBOARD_HOME_TABLE_PAGE_SIZE,
  DASHBOARD_PRIORITY_HYDRATION_LIMIT,
} from "./dashboardLoadBudget";

function row(overrides: Partial<WorkspaceIndexAgreement> = {}): WorkspaceIndexAgreement {
  return {
    id: "ag_1",
    title: "Services Agreement",
    updated_at: "2026-08-01T00:00:00.000Z",
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: null,
    reviewer_approved: false,
    all_reviewers_approved: false,
    review_approvals_required: 2,
    review_approvals_completed: 0,
    ...overrides,
  };
}

describe("dashboardLoadBudget", () => {
  it("does not enqueue audit GETs for index-completed rows", () => {
    const rows = [
      row({ id: "ag_done", completed_signed: true, has_server_signing_lock: true, all_reviewers_approved: true }),
      row({ id: "ag_draft", completed_signed: false }),
      row({
        id: "ag_locked",
        completed_signed: false,
        has_server_signing_lock: true,
        all_reviewers_approved: true,
      }),
    ];
    const candidates = selectDashboardAuditHydrationRows(rows, 5);
    expect(candidates.map((r) => r.id)).toEqual(["ag_locked"]);
    expect(candidates.every((r) => !r.completed_signed)).toBe(true);
  });

  it("seeds completion map from workspace-index without network", () => {
    const seeded = seedAuditCompletedFromWorkspaceIndex([
      row({ id: "a", completed_signed: true }),
      row({ id: "b", completed_signed: false }),
      row({ id: "c", completed_signed: true }),
    ]);
    expect(seeded).toEqual({ a: true, c: true });
  });

  it("skips signing-progress hydration for completed index rows", () => {
    const rows = [
      row({ id: "done", completed_signed: true, has_server_signing_lock: true }),
      row({ id: "locked", completed_signed: false, has_server_signing_lock: true }),
    ];
    expect(selectDashboardSigningProgressHydrationRows(rows, 5).map((r) => r.id)).toEqual(["locked"]);
  });

  it("keeps home table and priority hydration caps", () => {
    const many = Array.from({ length: 17 }, (_, i) => row({ id: `ag_${i}` }));
    expect(sliceDashboardHomeTableRows(many, false)).toHaveLength(DASHBOARD_HOME_TABLE_PAGE_SIZE);
    expect(sliceDashboardHomeTableRows(many, true)).toHaveLength(17);
    const priority = selectDashboardPriorityHydrationRows({
      activeRows: many,
      limit: DASHBOARD_PRIORITY_HYDRATION_LIMIT,
    });
    expect(priority.length).toBeLessThanOrEqual(DASHBOARD_PRIORITY_HYDRATION_LIMIT);
  });
});
