/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppDashboard } from "./AppDashboard";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import { AGREEMENT_CREATE_REVIEW_RESUME_KEY } from "../components/agreements/agreementIntakeStorage";
import {
  initializeNewAgreementSession,
  readPerAgreementLocalMarker,
} from "./newAgreementSessionReset";
import {
  isDashboardAccountSurface,
  isPublicTokenAgreementSurface,
  resolveCurrentUser,
} from "../account/currentUser";
import { matchAppPath } from "./routes";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
} from "../vs01/vs01SigningPacketStatusStore";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";
import { deriveCreatorDashboardStatus, deriveCreatorSigningStatusLabel } from "./creatorDashboardPresentation";

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
    id: "ag_1",
    title: "Services Agreement",
    updated_at: "2026-05-01T12:00:00.000Z",
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

describe("dashboard account foundation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    mockNavigate.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("first-time dashboard empty state shows Create new agreement", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [],
      skipped: [],
      error: null,
    });
    render(<AppDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-first-user-onboarding")).toBeTruthy();
    });
    expect(screen.getByTestId("dashboard-create-first-agreement").textContent).toContain(
      "Create first agreement",
    );
  });

  it("create new agreement from dashboard starts clean draft state", async () => {
    sessionStorage.setItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY, "ag_stale");
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [indexRow({ id: "ag_ready", all_reviewers_approved: true })],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: null,
    });
    const user = userEvent.setup();
    render(<AppDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-create-new-agreement")).toBeTruthy();
    });
    await user.click(screen.getByTestId("dashboard-create-new-agreement"));
    expect(sessionStorage.getItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY)).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/app/create");
  });

  it("existing signed agreement remains fully signed after returning to dashboard", async () => {
    const agreementId = "ag_signed_1";
    const handoff: PaidProVs01PostSignHandoffV1 = {
      v: 1,
      agreementId,
      agreementTitle: "Services Agreement",
      vs01DocumentId: "doc_signed_1",
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
      agreements: [
        indexRow({
          id: agreementId,
          completed_signed: true,
          all_reviewers_approved: true,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: {
        id: agreementId,
        parties: [
          { name: "A", role: "owner" },
          { name: "B", role: "party" },
        ],
        audit_log: [{ event_type: "signed" }],
      } as never,
    });

    render(<AppDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId(`lawdog-agreement-status-${agreementId}`).textContent).toContain(
        "Signed",
      );
    });
    expect(screen.getByTestId(`lawdog-action-open-${agreementId}`)).toBeTruthy();
  });

  it("review-approved agreement shows Prepare and send signing links", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        indexRow({
          id: "ag_ready",
          all_reviewers_approved: true,
          review_approvals_completed: 2,
          review_approvals_required: 2,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: {
        id: "ag_ready",
        parties: [
          { name: "A", role: "owner" },
          { name: "B", role: "party" },
        ],
        audit_log: [
          { event_type: "recipient_approved" },
          { event_type: "recipient_approved" },
        ],
      } as never,
    });
    render(<AppDashboard />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Prepare and send signing links" })).toBeTruthy();
    });
  });

  it("in-review agreement shows Track review status for email-mode dashboard", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        indexRow({
          id: "ag_review",
          review_sent_at: "2026-05-01T10:00:00.000Z",
          review_approvals_completed: 0,
          review_approvals_required: 2,
          reviewer_approved: false,
          all_reviewers_approved: false,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: {
        id: "ag_review",
        parties: [
          { id: "p1", name: "Party One", role: "owner" },
          { id: "p2", name: "Party Two", role: "party" },
        ],
        audit_log: [],
      } as never,
    });
    render(<AppDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("creator-dashboard-action-ag_review").textContent).toContain(
        "Track review status",
      );
    });
    expect(screen.getByTestId("creator-dashboard-status-pill-ag_review").textContent).toContain(
      "In Review",
    );
    expect(screen.queryByRole("button", { name: "Continue review" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open review link page" })).toBeNull();
  });

  it("multiple agreements render independently", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        indexRow({ id: "ag_a", title: "Agreement Alpha", all_reviewers_approved: true }),
        indexRow({
          id: "ag_b",
          title: "Agreement Beta",
          review_sent_at: "2026-05-01T10:00:00.000Z",
          review_approvals_completed: 0,
          all_reviewers_approved: false,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockImplementation(async (id) => ({
      ok: true,
      draft: {
        id,
        parties: [
          { id: "p1", name: "A", role: "owner" },
          { id: "p2", name: "B", role: "party" },
        ],
        audit_log:
          id === "ag_a"
            ? [{ event_type: "recipient_approved" }, { event_type: "recipient_approved" }]
            : [],
      } as never,
    }));
    render(<AppDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("lawdog-agreement-row-ag_a")).toBeTruthy();
      expect(screen.getByTestId("lawdog-agreement-row-ag_b")).toBeTruthy();
    });
    expect(screen.getByTestId("dashboard-kpi-cards")).toBeTruthy();
    expect(screen.getAllByText("Agreement Alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Agreement Beta").length).toBeGreaterThan(0);
  });

  it("bad agreement row does not 500 whole dashboard", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [indexRow({ id: "ag_good", title: "Good Agreement" })],
      skipped: [{ id: "ag_bad", reason: "summary_build_failed:ValueError" }],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: null,
    });
    render(<AppDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId("lawdog-agreement-row-ag_good")).toBeTruthy();
    });
    expect(screen.getAllByText("Good Agreement").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("public reviewer route is not a dashboard account surface", () => {
    expect(isPublicTokenAgreementSurface("/agreements/ag_1/review")).toBe(true);
    expect(isDashboardAccountSurface("/agreements/ag_1/review")).toBe(false);
  });

  it("public signer esign route is not a dashboard account surface", () => {
    expect(isPublicTokenAgreementSurface("/app/esign/doc_abc")).toBe(true);
    expect(isDashboardAccountSurface("/app/esign/doc_abc")).toBe(false);
  });

  it("agreement #2 creation does not alter agreement #1 review/signing state", () => {
    const agreement1 = "ag_one";
    localStorage.setItem(`vs01_signing_packet_status_v1:${agreement1}`, JSON.stringify({ fullyExecuted: true }));
    sessionStorage.setItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY, agreement1);

    initializeNewAgreementSession({ priorAgreementId: "ag_two" });

    expect(readPerAgreementLocalMarker("vs01_signing_packet_status_v1:", agreement1)).toContain(
      "fullyExecuted",
    );
    expect(sessionStorage.getItem(AGREEMENT_CREATE_REVIEW_RESUME_KEY)).toBeNull();
  });

  it("resolveCurrentUser provides dev/local fallback without blocking QA", () => {
    localStorage.setItem("claw_org_id", "local-org");
    const user = resolveCurrentUser();
    expect(user.isAuthenticated).toBe(true);
    expect(user.id).toBe("local-org");
  });

  it("dashboard refresh retains Agreement #1 from workspace index", async () => {
    const agreementOne = indexRow({ id: "ag_1", title: "Agreement #1" });
    const fetchMock = vi
      .spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex")
      .mockResolvedValueOnce({
        agreements: [agreementOne],
        skipped: [],
        error: null,
      })
      .mockResolvedValueOnce({
        agreements: [agreementOne],
        skipped: [],
        error: null,
      });
    const { unmount } = render(<AppDashboard />);
    await waitFor(() => {
      expect(screen.getAllByText("Agreement #1").length).toBeGreaterThan(0);
    });
    unmount();
    render(<AppDashboard />);
    await waitFor(() => {
      expect(screen.getAllByText("Agreement #1").length).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("/dashboard alias routes to dashboard kind", () => {
    expect(matchAppPath("/dashboard")).toEqual({ kind: "dashboard" });
    expect(matchAppPath("/app/affiliate")).toEqual({ kind: "affiliate" });
    expect(matchAppPath("/app/settings")).toEqual({ kind: "settings" });
    expect(matchAppPath("/app/signatures")).toEqual({ kind: "signatures" });
  });

  it("deriveCreatorDashboardStatus preserves TEST322 fully signed label path", () => {
    const id = "doc_test322";
    const handoff: PaidProVs01PostSignHandoffV1 = {
      v: 1,
      agreementId: id,
      agreementTitle: "Services Agreement",
      vs01DocumentId: "doc_test322",
      receiptId: "",
      receiptHashSha256: null,
      savedAt: new Date().toISOString(),
      signers: [
        {
          counterpartyId: "cp1",
          displayName: "Counterparty",
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
      patchSignerPacketStatus(id, key, "signed");
    }
    const row = indexRow({ id, completed_signed: false, all_reviewers_approved: true });
    expect(deriveCreatorDashboardStatus(row)).toBe("completed");
    expect(deriveCreatorSigningStatusLabel(row)).toBe("Fully signed");
  });
});
