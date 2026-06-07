/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AppDashboard } from "./AppDashboard";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app",
    search: "",
    hash: "",
    navigate: vi.fn(),
  }),
}));

vi.mock("./ops/OperatorGrowthDashboard", () => ({
  canAccessOperatorGrowthDashboard: () => false,
}));

function indexRow(p: Partial<WorkspaceIndexAgreement>): WorkspaceIndexAgreement {
  return {
    id: "ag_creator_1",
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

describe("AppDashboard creator-centric surface", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows greeting, metrics, and prepare signature CTA", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [indexRow({ id: "ag_ready" })],
      error: null,
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("creator-dashboard-agreement-list")).toBeTruthy();
    });

    expect(screen.getByText(/Good (morning|afternoon|evening),/)).toBeTruthy();
    expect(screen.getByTestId("creator-dashboard-metric-ready_for_signing").textContent).toContain("1");
    expect(screen.getByRole("button", { name: "Prepare Signature Links" })).toBeTruthy();
  });

  it("shows the requested empty state", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [],
      error: null,
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("creator-dashboard-empty")).toBeTruthy();
    });

    expect(screen.getByText("No active agreements.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Agreement" })).toBeTruthy();
  });
});
