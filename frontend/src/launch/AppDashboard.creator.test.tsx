/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppDashboard } from "./AppDashboard";
import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import * as creatorDashboardPrepareSignatureLinks from "./creatorDashboardPrepareSignatureLinks";

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

function draftWithParties(): AgreementDraft {
  return {
    id: "ag_ready",
    title: "Services Agreement",
    jurisdiction: "CA",
    parties: [
      { name: "Blue Canyon Analytics LLC", role: "owner" },
      { name: "Iron Vale Systems Inc", role: "party" },
    ],
    purpose: "Services",
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T12:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-05-01T00:00:00.000Z" }],
    audit_log: [
      { event_type: "recipient_approved", at: "2026-05-01T11:00:00.000Z" },
      { event_type: "recipient_approved", at: "2026-05-01T11:30:00.000Z" },
    ],
  } as AgreementDraft;
}

describe("AppDashboard creator-centric surface", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows dashboard copy and prepare signature links CTA after both approvals", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [indexRow({ id: "ag_ready" })],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("creator-dashboard-agreement-list")).toBeTruthy();
    });

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(
      screen.getByText("Track agreements you created, review approvals, and signing readiness."),
    ).toBeTruthy();
    expect(screen.getByTestId("creator-dashboard-primary")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prepare signature links" })).toBeTruthy();
    expect(screen.getByText("Reviews complete")).toBeTruthy();
    expect(screen.getByText(/Next action:/)).toBeTruthy();
    expect(screen.getByText(/2 of 2 approved/)).toBeTruthy();
    expect(screen.getByText(/Signature links not prepared yet/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/Blue Canyon Analytics LLC — Approved/)).toBeTruthy();
    });
    expect(screen.getByText(/Iron Vale Systems Inc — Approved/)).toBeTruthy();
  });

  it("routes Prepare signature links to signature prep", async () => {
    const prepareSpy = vi.spyOn(creatorDashboardPrepareSignatureLinks, "navigateCreatorPrepareSignatureLinks")
      .mockResolvedValue(undefined);
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [indexRow({ id: "ag_ready" })],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
    });

    const user = userEvent.setup();
    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Prepare signature links" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Prepare signature links" }));
    expect(prepareSpy).toHaveBeenCalledWith(
      expect.objectContaining({ agreementId: "ag_ready" }),
    );
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

    expect(screen.getByText("No agreements yet")).toBeTruthy();
    expect(screen.getByText("Create your first agreement to begin.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create agreement" })).toBeTruthy();
  });
});
