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

describe("LawdogAgreementsTable completed rows (Test362)", () => {
  afterEach(() => {
    cleanup();
  });

  it("Open routes to signed agreement view, not /app/done", () => {
    const onNavigate = vi.fn();
    render(<LawdogAgreementsTable rows={[completedRow()]} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByTestId("lawdog-action-open-ag_completed"));
    expect(onNavigate).toHaveBeenCalledWith("/app/agreements/ag_completed/view-signed");
    expect(onNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
  });

  it("Download is enabled for completed rows and uses canonical server export", async () => {
    const downloadSpy = vi.spyOn(completedPdf, "downloadCompletedSignedAgreementPdf").mockResolvedValue();
    const onNavigate = vi.fn();
    render(<LawdogAgreementsTable rows={[completedRow()]} onNavigate={onNavigate} />);

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

  it("Download stays disabled for non-completed rows", () => {
    const onNavigate = vi.fn();
    const draftRow = { ...completedRow("ag_draft"), completed_signed: false };
    render(<LawdogAgreementsTable rows={[draftRow]} onNavigate={onNavigate} />);

    const download = screen.getByTestId("lawdog-action-download-ag_draft") as HTMLButtonElement;
    expect(download.disabled).toBe(true);
  });

  it("Duplicate starts new agreement session without done route", () => {
    const onNavigate = vi.fn();
    render(<LawdogAgreementsTable rows={[completedRow()]} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByTestId("lawdog-action-duplicate-ag_completed"));
    expect(initializeNewAgreementSession).toHaveBeenCalledWith({ priorAgreementId: "ag_completed" });
    expect(onNavigate).toHaveBeenCalledWith("/app/create");
    expect(onNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
  });

  it("Archive patches workspace without navigating to done", async () => {
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

    fireEvent.click(screen.getByTestId("lawdog-action-archive-ag_completed"));
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith("ag_completed", true);
      expect(onArchiveComplete).toHaveBeenCalled();
    });
    expect(onNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
  });
});
