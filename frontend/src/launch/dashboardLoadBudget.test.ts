import { describe, expect, it } from "vitest";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  DASHBOARD_HOME_TABLE_PAGE_SIZE,
  DASHBOARD_PRIORITY_HYDRATION_LIMIT,
  selectDashboardPriorityHydrationRows,
  sliceDashboardHomeTableRows,
} from "./dashboardLoadBudget";

function row(id: string, overrides: Partial<WorkspaceIndexAgreement> = {}): WorkspaceIndexAgreement {
  return {
    id,
    title: `Agreement ${id}`,
    updated_at: "2026-08-01T12:00:00.000Z",
    party_count: 2,
    signer_count: 0,
    version_ledger_count: 0,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: null,
    ...overrides,
  };
}

describe("dashboardLoadBudget", () => {
  it("caps priority hydration and prefers featured + attention", () => {
    const active = Array.from({ length: 12 }, (_, i) => row(`ag_${i}`));
    const selected = selectDashboardPriorityHydrationRows({
      featuredId: "ag_7",
      attentionRows: [active[3], active[4]],
      activeRows: active,
      limit: DASHBOARD_PRIORITY_HYDRATION_LIMIT,
    });
    expect(selected).toHaveLength(DASHBOARD_PRIORITY_HYDRATION_LIMIT);
    expect(selected.map((r) => r.id)).toEqual(["ag_7", "ag_3", "ag_4", "ag_0"]);
  });

  it("slices home table until show-all", () => {
    const rows = Array.from({ length: 9 }, (_, i) => row(`ag_${i}`));
    expect(sliceDashboardHomeTableRows(rows, false)).toHaveLength(DASHBOARD_HOME_TABLE_PAGE_SIZE);
    expect(sliceDashboardHomeTableRows(rows, true)).toHaveLength(9);
  });
});
