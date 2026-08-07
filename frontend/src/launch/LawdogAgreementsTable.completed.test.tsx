/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { LawdogAgreementsTable } from "./LawdogAgreementsTable";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import * as completedPdf from "../agreement/completedSignedAgreementPdfDownload";
import { initializeNewAgreementSession } from "./newAgreementSessionReset";

vi.mock("./newAgreementSessionReset", () => ({
  initializeNewAgreementSession: vi.fn(),
}));

function completedRow(id = "ag_completed"): WorkspaceIndexAgreement {
  return {
    id,
    title: "Services Agreement",
    updated_at: "2026-06-15T00:00:00.000Z",
    created_at: "2026-06-14T00:00:00.000Z",
    party_count: 2,
    signer_count: 2,
    version_ledger_count: 1,
    completed_signed: true,
    has_server_signing_lock: true,
    locked_version_id: "v1",
    workspace_archived_at: null,
    review_sent_at: "2026-06-13T00:00:00.000Z",
    reviewer_approved: true,
    all_reviewers_approved: true,
    review_approvals_required: 2,
    review_approvals_completed: 2,
  };
}

function openMore(id: string) {
  fireEvent.click(screen.getByTestId(`lawdog-action-more-${id}`));
}

describe("LawdogAgreementsTable completed rows (Test362)", () => {
  afterEach(() => {
    cleanup();
  });

  it("Open routes to signed agreement view, not /app/done", () => {
    const onNavigate = vi.fn();
    render(<LawdogAgreementsTable rows={[completedRow()]} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByTestId("lawdog-action-open-ag_completed"));
    expect(onNavigate).toHaveBeenCalledWith(
      "/app/agreements/ag_completed/view-signed",
      expect.objectContaining({ agreementId: "ag_completed" }),
    );
    expect(onNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
  });

  it("Download is in More menu for completed rows and uses canonical server export", async () => {
    const downloadSpy = vi.spyOn(completedPdf, "downloadCompletedSignedAgreementPdf").mockResolvedValue();
    const onNavigate = vi.fn();
    render(<LawdogAgreementsTable rows={[completedRow()]} onNavigate={onNavigate} />);

    expect(screen.queryByTestId("lawdog-action-download-ag_completed")).toBeNull();
    openMore("ag_completed");
    const download = screen.getByTestId("lawdog-action-download-ag_completed") as HTMLButtonElement;
    expect(download.disabled).toBe(false);
    fireEvent.click(download);
    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agreementId: "ag_completed",
          title: "Services Agreement",
        }),
      );
    });
    expect(downloadSpy.mock.calls[0]?.[0]).not.toHaveProperty("html");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("hides Download PDF in More menu for non-completed rows", () => {
    const onNavigate = vi.fn();
    const draftRow = { ...completedRow("ag_draft"), completed_signed: false };
    render(<LawdogAgreementsTable rows={[draftRow]} onNavigate={onNavigate} />);

    openMore("ag_draft");
    expect(screen.getByTestId("lawdog-action-menu-ag_draft")).toBeTruthy();
    expect(screen.queryByTestId("lawdog-action-download-ag_draft")).toBeNull();
    expect(screen.getByTestId("lawdog-action-archive-ag_draft")).toBeTruthy();
  });

  it("Duplicate from More menu starts new agreement session without done route", () => {
    const onNavigate = vi.fn();
    render(<LawdogAgreementsTable rows={[completedRow()]} onNavigate={onNavigate} />);

    openMore("ag_completed");
    fireEvent.click(screen.getByTestId("lawdog-action-duplicate-ag_completed"));
    expect(initializeNewAgreementSession).toHaveBeenCalledWith({ priorAgreementId: "ag_completed" });
    expect(onNavigate).toHaveBeenCalledWith("/app/create");
    expect(onNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
  });

  it("Archive from More menu delegates to onWorkspaceArchive", () => {
    const onNavigate = vi.fn();
    const onWorkspaceArchive = vi.fn();
    render(
      <LawdogAgreementsTable
        rows={[completedRow()]}
        onNavigate={onNavigate}
        onWorkspaceArchive={onWorkspaceArchive}
      />,
    );

    openMore("ag_completed");
    fireEvent.click(screen.getByTestId("lawdog-action-archive-ag_completed"));
    expect(onWorkspaceArchive).toHaveBeenCalledWith({
      agreementId: "ag_completed",
      title: "Services Agreement",
      archived: true,
    });
    expect(onNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
  });

  it("legacy onArchiveComplete still works when onWorkspaceArchive is absent", async () => {
    const patchSpy = vi.spyOn(agreementWorkspaceApi, "patchWorkspaceArchive").mockResolvedValue(true);
    const onNavigate = vi.fn();
    const onArchiveComplete = vi.fn();
    render(
      <LawdogAgreementsTable
        rows={[completedRow()]}
        onNavigate={onNavigate}
        onArchiveComplete={onArchiveComplete}
      />,
    );

    openMore("ag_completed");
    fireEvent.click(screen.getByTestId("lawdog-action-archive-ag_completed"));
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith("ag_completed", true);
      expect(onArchiveComplete).toHaveBeenCalled();
    });
  });

  it("shows Unarchive in More menu for archived rows", () => {
    const onWorkspaceArchive = vi.fn();
    const archived = {
      ...completedRow("ag_archived"),
      workspace_archived_at: "2026-06-16T00:00:00.000Z",
    };
    render(
      <LawdogAgreementsTable
        rows={[archived]}
        onNavigate={vi.fn()}
        onWorkspaceArchive={onWorkspaceArchive}
      />,
    );

    openMore("ag_archived");
    fireEvent.click(screen.getByTestId("lawdog-action-unarchive-ag_archived"));
    expect(onWorkspaceArchive).toHaveBeenCalledWith({
      agreementId: "ag_archived",
      title: "Services Agreement",
      archived: false,
    });
  });
});
