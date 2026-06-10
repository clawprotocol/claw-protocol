/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppDashboard } from "./AppDashboard";
import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import * as agreementToVs01SigningBridge from "./simpleProduct/agreementToVs01SigningBridge";
import { AGREEMENT_CREATE_REVIEW_RESUME_KEY } from "../components/agreements/agreementIntakeStorage";
import { LAWDOG_ENTRY_CONTEXT_KEY } from "./lawdogEntryContext";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
} from "../vs01/vs01SigningPacketStatusStore";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";

const mockNavigate = vi.fn();

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app",
    search: "",
    hash: "",
    navigate: mockNavigate,
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
    sessionStorage.clear();
    mockNavigate.mockClear();
  });

  it("shows dashboard copy and prepare signature links CTA after both approvals", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [indexRow({ id: "ag_ready" })],
      skipped: [],
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
      screen.getByText("What agreements do you have, what needs attention, and how much value you've generated."),
    ).toBeTruthy();
    expect(screen.getByTestId("creator-dashboard-primary")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Prepare signature links" })).toBeTruthy();
    });
    expect(screen.getByText("Reviews approved")).toBeTruthy();
    expect(screen.getByText(/Next action:/)).toBeTruthy();
    expect(screen.getByText(/2 of 2 approved/)).toBeTruthy();
    expect(screen.getByText(/Signature links not prepared yet/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/Blue Canyon Analytics LLC — Approved/)).toBeTruthy();
    });
    expect(screen.getByText(/Iron Vale Systems Inc — Approved/)).toBeTruthy();
  });

  it("routes Prepare signature links through VS01 bridge with correct agreementId", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
      lockedVersionId: null,
    });
    const vs01Spy = vi
      .spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign")
      .mockImplementation(async (options) => {
        options.navigate("/app/esign/doc_bridge_test?agreement_bridge=1");
        return true;
      });
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [indexRow({ id: "ag_ready" })],
      skipped: [],
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

    await waitFor(() => {
      expect(vs01Spy).toHaveBeenCalledWith(
        expect.objectContaining({
          agreementId: "ag_ready",
          logReason: "creator_dashboard_prepare_signature_links",
          reviewerApprovedCleanHandoff: true,
          recipientSetup: null,
        }),
      );
      expect(mockNavigate).toHaveBeenCalledWith("/app/esign/doc_bridge_test?agreement_bridge=1");
    });
  });

  it("does not call VS01 bridge when only one party approved", async () => {
    const partialDraft = {
      ...draftWithParties(),
      audit_log: [{ event_type: "recipient_approved", at: "2026-05-01T11:00:00.000Z" }],
    } as AgreementDraft;
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: partialDraft,
      lockedVersionId: null,
    });
    const vs01Spy = vi.spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign")
      .mockResolvedValue(true);
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        indexRow({
          id: "ag_partial",
          reviewer_approved: true,
          review_approvals_required: 1,
          review_approvals_completed: 1,
          all_reviewers_approved: false,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: {
        ...partialDraft,
        parties: [
          { name: "Blue Canyon Analytics LLC", role: "owner", id: "p1" },
          { name: "Iron Vale Systems Inc", role: "party", id: "p2" },
        ],
        audit_log: [
          { event_type: "recipient_approved", at: "2026-05-01T11:00:00.000Z", value: { participant_id: "p1" } },
        ],
      },
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/1 of 2 approved/)).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: "Track review status" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Prepare signature links" })).toBeNull();
    expect(vs01Spy).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows bridge failure notice on dashboard instead of bouncing through done page", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
      lockedVersionId: null,
    });
    vi.spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign").mockResolvedValue(
      false,
    );
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [indexRow({ id: "ag_ready" })],
      skipped: [],
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

    await waitFor(() => {
      expect(screen.getByTestId("creator-dashboard-prepare-notice-ag_ready")).toBeTruthy();
    });
    expect(screen.getByTestId("creator-dashboard-prepare-notice-ag_ready").textContent).toContain(
      "Open review link page",
    );
    expect(mockNavigate).not.toHaveBeenCalledWith("/app/done/ag_ready");
  });

  it("falls back to review link page when VS01 bridge fails with legacy fallback enabled", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
      lockedVersionId: null,
    });
    vi.spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign").mockResolvedValue(
      false,
    );

    const mockLegacyNavigate = vi.fn();
    const { navigateCreatorPrepareSignatureLinks } = await import("./creatorDashboardPrepareSignatureLinks");
    const result = await navigateCreatorPrepareSignatureLinks({
      agreementId: "ag_ready",
      navigate: mockLegacyNavigate,
      draft: draftWithParties(),
      navigateOnBridgeFailure: true,
    });

    expect(result.destination).toBe("/app/done/ag_ready");
    expect(mockLegacyNavigate).toHaveBeenCalledWith("/app/done/ag_ready");
  });

  it("prepare click uses cached review rows when signing-lock draft omits party approvals", async () => {
    const draftWithoutAudit = {
      ...draftWithParties(),
      audit_log: [],
      parties: [{ name: "Blue Canyon Analytics LLC", role: "owner" }, { name: "Iron Vale Systems Inc", role: "party" }],
    } as AgreementDraft;
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: draftWithoutAudit,
      lockedVersionId: null,
    });
    const vs01Spy = vi
      .spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign")
      .mockImplementation(async (options) => {
        options.navigate("/app/esign/doc_cached_rows?agreement_bridge=1");
        return true;
      });
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [indexRow({ id: "ag_ready" })],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
    });

    const user = userEvent.setup();
    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/2 of 2 approved/)).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Prepare signature links" }));

    await waitFor(() => {
      expect(vs01Spy).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/app/esign/doc_cached_rows?agreement_bridge=1");
    });
  });

  it("hides stale QA agreements for first-time dashboard focus", async () => {
    sessionStorage.setItem(LAWDOG_ENTRY_CONTEXT_KEY, "new");
    sessionStorage.setItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY, "ag_ready");
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        indexRow({
          id: "ag_stale",
          title: "Old QA draft",
          updated_at: "2026-06-01T00:00:00.000Z",
          review_sent_at: null,
          reviewer_approved: false,
          all_reviewers_approved: false,
          review_approvals_completed: 0,
        }),
        indexRow({ id: "ag_ready" }),
        indexRow({
          id: "ag_old_done",
          completed_signed: true,
          updated_at: "2026-04-01T00:00:00.000Z",
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("creator-dashboard-agreement-ag_ready")).toBeTruthy();
    });

    expect(screen.queryByTestId("creator-dashboard-agreement-ag_stale")).toBeNull();
    expect(screen.queryByTestId("creator-dashboard-agreement-ag_old_done")).toBeNull();
    expect(screen.queryByText("Other agreements")).toBeNull();
  });

  it("shows fully signed dashboard card when local VS01 packet is complete", async () => {
    const agreementId = "ag_ready";
    const handoff: PaidProVs01PostSignHandoffV1 = {
      v: 1,
      agreementId,
      agreementTitle: "Services Agreement",
      vs01DocumentId: "doc_ready",
      receiptId: "",
      receiptHashSha256: null,
      savedAt: new Date().toISOString(),
      signers: [
        {
          counterpartyId: "cp1",
          displayName: "Iron Vale Systems Inc",
          email: "cp@example.test",
          signingUrl: "https://example.test/cp",
          signerRoleId: "role_cp1",
        },
      ],
      ownerSignerRoleId: "role_owner",
      ownerSigningUrl: "https://example.test/sign",
      packetPrepareOnly: true,
      senderMustSignFirst: true,
    };
    localStorage.clear();
    const snap = ensureSigningPacketStatusFromHandoff(handoff, "role_owner");
    for (const key of Object.keys(snap.bySignerKey)) {
      patchSignerPacketStatus(agreementId, key, "signed");
    }

    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [indexRow({ id: agreementId })],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId(`creator-dashboard-signing-status-${agreementId}`)).toBeTruthy();
    });

    expect(screen.getByText(/Fully signed/)).toBeTruthy();
    expect(screen.queryByText(/Signature links not prepared yet/)).toBeNull();
    expect(screen.getByRole("button", { name: "Open agreement workspace" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Prepare signature links" })).toBeNull();
  });

  it("shows the requested empty state", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [],
      skipped: [],
      error: null,
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("creator-dashboard-empty")).toBeTruthy();
    });

    expect(screen.getByText("No agreements yet")).toBeTruthy();
    expect(screen.getByText("Create your first agreement to begin.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create new agreement" })).toBeTruthy();
  });
});
