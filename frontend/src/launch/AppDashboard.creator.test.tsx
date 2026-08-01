/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppDashboard } from "./AppDashboard";
import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import * as agreementToVs01SigningBridge from "./simpleProduct/agreementToVs01SigningBridge";
import * as creatorDashboardPrepareSignatureLinks from "./creatorDashboardPrepareSignatureLinks";
import { AGREEMENT_CREATE_REVIEW_RESUME_KEY } from "../components/agreements/agreementIntakeStorage";
import { LAWDOG_ENTRY_CONTEXT_KEY } from "./lawdogEntryContext";
import {
  ensureSigningPacketStatusFromHandoff,
  patchSignerPacketStatus,
} from "../vs01/vs01SigningPacketStatusStore";
import type { PaidProVs01PostSignHandoffV1 } from "../vs01/vs01PaidProPostSignHandoff";

const mockNavigate = vi.fn();

const launchNavState = vi.hoisted(() => ({
  pathname: "/app",
  search: "",
  hash: "",
}));

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: launchNavState.pathname,
    search: launchNavState.search,
    hash: launchNavState.hash,
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

function draftWithParties(overrides?: Partial<AgreementDraft>): AgreementDraft {
  return {
    id: "ag_ready",
    title: "Services Agreement",
    jurisdiction: "CA",
    parties: [
      {
        name: "Blue Canyon Analytics LLC",
        role: "owner",
        signerName: "Sarah Mitchell",
        signerTitle: "CEO",
        signerEmail: "sarah@bluecanyon.test",
        email: "sarah@bluecanyon.test",
      },
      {
        name: "Iron Vale Systems Inc",
        role: "party",
        signerName: "Michael Torres",
        signerTitle: "President",
        signerEmail: "iron@example.test",
        email: "iron@example.test",
      },
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
    ...overrides,
  } as AgreementDraft;
}

describe("AppDashboard creator-centric surface", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionStorage.clear();
    mockNavigate.mockClear();
    launchNavState.pathname = "/app";
    launchNavState.search = "";
    launchNavState.hash = "";
  });

  it("auto-launches VS01 from owner email prepare_signature_links deep link and clears query", async () => {
    launchNavState.search = "?prepare_signature_links=ag_ready";
    window.history.replaceState(null, "", "/app?prepare_signature_links=ag_ready");
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    vi.spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign")
      .mockImplementation(async (options) => {
        options.navigate("/app/esign/doc_email_cta?agreement_bridge=1");
        return true;
      });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
      lockedVersionId: null,
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

    render(<AppDashboard />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/app/esign/doc_email_cta?agreement_bridge=1");
    });
    expect(replaceState).toHaveBeenCalledWith(window.history.state, "", "/app");
    replaceState.mockRestore();
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
      expect(screen.getByText("All reviews complete")).toBeTruthy();
    });

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(
      screen.getByText("See what you're working on, what to do next, and how close each agreement is to signing."),
    ).toBeTruthy();
    expect(screen.getByTestId("dashboard-whats-next-panel").getAttribute("data-creator-dashboard-primary")).toBe(
      "true",
    );
    expect(screen.getByTestId("creator-dashboard-action-ag_ready")).toBeTruthy();
    expect(screen.getByText("All reviews complete")).toBeTruthy();
    expect(screen.getByText(/Next step:/)).toBeTruthy();
    expect(screen.getByTestId("agreement-progress-timeline")).toBeTruthy();
  });

  it("hides dead Track review status CTA while waiting on reviewer approval", async () => {
    const pendingDraft = {
      ...draftWithParties(),
      parties: [
        { name: "Blue Canyon Analytics LLC", role: "party", id: "p1" },
        { name: "Iron Vale Systems Inc", role: "reviewer", email: "iron@example.test", id: "p2" },
      ],
      audit_log: [],
    } as AgreementDraft;
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        indexRow({
          id: "ag_pending",
          all_reviewers_approved: false,
          review_approvals_completed: 0,
          review_approvals_required: 1,
          reviewer_approved: false,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: pendingDraft,
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Review requested from Iron Vale Systems Inc")).toBeTruthy();
    });

    const whatsNext = screen.getByTestId("dashboard-whats-next-panel");
    expect(screen.getByText("0 of 1 approved")).toBeTruthy();
    expect(screen.getByTestId("agreement-progress-timeline")).toBeTruthy();
    expect(whatsNext.querySelector('[data-dashboard-whats-next-cta="hidden"]')).toBeTruthy();
    expect(whatsNext.querySelector('button[data-dashboard-whats-next-cta="focus_review_status"]')).toBeNull();
    expect(screen.getByTestId("dashboard-whats-next-step").textContent).toContain("Wait for reviewer approval");
    expect(screen.getByRole("button", { name: "View agreement" })).toBeTruthy();
    expect(screen.getByTestId("creator-dashboard-manage-recipients-ag_pending")).toBeTruthy();
    expect(screen.getByTestId("creator-dashboard-manage-recipients-ag_pending").getAttribute("data-dashboard-whats-next-cta")).toBe(
      "manage_recipients",
    );
    expect(screen.getByTestId("creator-dashboard-view-agreement-ag_pending").getAttribute("data-dashboard-whats-next-cta")).toBe(
      "view_agreement",
    );
  });

  it("shows Prepare and send signing links when reviewer approved on draft but index still in_review", async () => {
    const base = draftWithParties();
    const reviewerApprovedDraft = {
      ...base,
      parties: [
        { ...base.parties![0], id: "p1", role: "party" },
        { ...base.parties![1], id: "p2", role: "reviewer", email: "iron@example.test" },
      ],
      audit_log: [
        {
          event_type: "participant_approved",
          at: "2026-05-01T11:30:00.000Z",
          value: { participant_id: "p2" },
        },
      ],
    } as AgreementDraft;
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        indexRow({
          id: "ag_ready",
          all_reviewers_approved: false,
          review_approvals_completed: 0,
          reviewer_approved: true,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: reviewerApprovedDraft,
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByText("All reviews complete")).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: "Prepare and send signing links" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Track review status" })).toBeNull();
    expect(screen.getByTestId("creator-dashboard-status-pill-ag_ready").textContent).toBe(
      "Ready for Signing",
    );
  });

  it("prepare CTA routes to signature prep when index is approved but draft rows lag", async () => {
    const partialDraft = {
      ...draftWithParties(),
      audit_log: [{ event_type: "recipient_approved", at: "2026-05-01T11:00:00.000Z" }],
    } as AgreementDraft;
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: partialDraft,
      lockedVersionId: null,
    });
    const vs01Spy = vi
      .spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign")
      .mockImplementation(async (options) => {
        options.navigate("/app/esign/doc_index_lag?agreement_bridge=1");
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

    const homeCreateSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByText("All reviews complete")).toBeTruthy();
    });

    expect(screen.getByTestId("creator-dashboard-status-pill-ag_ready").textContent).toBe("Ready for Signing");
    expect(screen.queryByText("Waiting on reviewer")).toBeNull();

    const cta = await waitFor(() => {
      const button = screen.getByRole("button", { name: "Prepare and send signing links" });
      expect(button.getAttribute("data-dashboard-whats-next-cta")).toBe("prepare_signature_links");
      return button;
    });

    await user.click(cta);

    await waitFor(() => {
      expect(vs01Spy).toHaveBeenCalledWith(
        expect.objectContaining({
          agreementId: "ag_ready",
          logReason: "creator_dashboard_prepare_signature_links",
        }),
      );
      expect(mockNavigate).toHaveBeenCalledWith("/app/esign/doc_index_lag?agreement_bridge=1");
    });

    const homeCreateCalls = homeCreateSpy.mock.calls.filter(
      (call) => call[0] === "[home-create-submit]",
    );
    expect(homeCreateCalls).toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalledWith("/app/create");
    homeCreateSpy.mockRestore();
  });

  it("auto-launches prepare signature links when opened via review-complete email deep link", async () => {
    launchNavState.search = "?prepare_signature_links=ag_ready";
    const prepareSpy = vi
      .spyOn(creatorDashboardPrepareSignatureLinks, "navigateCreatorPrepareSignatureLinks")
      .mockResolvedValue({
        navigated: true,
        destination: "/app/esign/doc_email_handoff?agreement_bridge=1",
        bridgeAttempted: true,
        blockReason: null,
        vs01RouteAttempted: true,
      });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
      lockedVersionId: null,
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

    render(<AppDashboard />);

    await waitFor(
      () => {
        expect(prepareSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            agreementId: "ag_ready",
            navigateOnBridgeFailure: false,
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it("routes Prepare and send signing links through VS01 bridge with correct agreementId", async () => {
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
      expect(screen.getByRole("button", { name: "Prepare and send signing links" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Prepare and send signing links" }));

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

  it("QA359: dashboard CTA bridge navigation is not undone by post-bridge replaceState to /app", async () => {
    const esignRoute = "/app/esign/doc_qa359?agreement_bridge=1";
    const replaceStateCalls: string[] = [];
    const pushStateCalls: string[] = [];
    vi.spyOn(window.history, "replaceState").mockImplementation((_state, _title, url) => {
      if (typeof url === "string") replaceStateCalls.push(url);
    });
    vi.spyOn(window.history, "pushState").mockImplementation((_state, _title, url) => {
      if (typeof url === "string") {
        pushStateCalls.push(url);
        const parsed = new URL(url, "http://localhost");
        launchNavState.pathname = parsed.pathname;
        launchNavState.search = parsed.search;
      }
    });
    mockNavigate.mockImplementation((to: string) => {
      window.history.pushState(null, "", to);
    });

    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
      lockedVersionId: null,
    });
    vi.spyOn(agreementToVs01SigningBridge, "tryNavigatePaidProAgreementSenderFirstVs01Esign")
      .mockImplementation(async (options) => {
        options.navigate(esignRoute);
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

    launchNavState.pathname = "/app";
    launchNavState.search = "";
    window.history.replaceState(null, "", "/app");

    const user = userEvent.setup();
    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Prepare and send signing links" })).toBeTruthy();
    });

    replaceStateCalls.length = 0;

    await user.click(screen.getByRole("button", { name: "Prepare and send signing links" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(esignRoute);
    });

    expect(pushStateCalls).toContain(esignRoute);
    expect(launchNavState.pathname).toBe("/app/esign/doc_qa359");
    expect(launchNavState.search).toBe("?agreement_bridge=1");
    expect(replaceStateCalls).not.toContain("/app");
  });

  it("does not call VS01 bridge when only one required reviewer approved", async () => {
    const partialDraft = {
      ...draftWithParties(),
      parties: [
        { name: "Blue Canyon Analytics LLC", role: "owner", id: "p-owner" },
        { name: "Iron Vale Systems Inc", role: "reviewer", id: "p-rev-1" },
        { name: "North Ridge Consulting LLC", role: "reviewer", id: "p-rev-2" },
      ],
      audit_log: [
        {
          event_type: "participant_approved",
          at: "2026-05-01T11:00:00.000Z",
          value: { participant_id: "p-rev-1" },
        },
      ],
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
          review_approvals_required: 2,
          review_approvals_completed: 1,
          all_reviewers_approved: false,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: partialDraft,
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/1 of 2 approved/)).toBeTruthy();
    });

    const whatsNext = screen.getByTestId("dashboard-whats-next-panel");
    expect(whatsNext.querySelector('[data-dashboard-whats-next-cta="hidden"]')).toBeTruthy();
    expect(whatsNext.querySelector('[data-dashboard-whats-next-cta="focus_review_status"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Prepare and send signing links" })).toBeNull();
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
      expect(screen.getByRole("button", { name: "Prepare and send signing links" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "Prepare and send signing links" }));

    await waitFor(() => {
      expect(screen.getByTestId("creator-dashboard-prepare-notice-ag_ready")).toBeTruthy();
    });
    expect(screen.getByTestId("creator-dashboard-prepare-notice-ag_ready").textContent).toContain(
      "Open review link page",
    );
    expect(mockNavigate).not.toHaveBeenCalledWith("/app/done/ag_ready");
  });

  it("falls back to negotiation workspace when VS01 bridge fails with legacy fallback enabled", async () => {
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

    expect(result.destination).toBe("/app/agreements/ag_ready");
    expect(mockLegacyNavigate).toHaveBeenCalledWith("/app/agreements/ag_ready");
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
      expect(screen.getByText(/All required reviews are complete|2 of 2 approved/)).toBeTruthy();
      expect(screen.getByTestId("creator-dashboard-action-ag_ready").getAttribute("data-dashboard-whats-next-cta")).toBe(
        "prepare_signature_links",
      );
    });

    await user.click(screen.getByTestId("creator-dashboard-action-ag_ready"));

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
      expect(screen.getByTestId("dashboard-whats-next-panel")).toBeTruthy();
    });

    expect(screen.getByTestId("dashboard-whats-next-panel").getAttribute("data-agreement-id")).toBe("ag_ready");

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
    expect(screen.queryByRole("button", { name: "View signed agreement" })).toBeNull();
    expect(screen.getByRole("button", { name: "View in agreements" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Prepare and send signing links" })).toBeNull();
  });

  it("promotes audit-signed agreements to completed when workspace index is stale", async () => {
    const agreementId = "ag_audit_signed";
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        indexRow({
          id: agreementId,
          has_server_signing_lock: true,
          all_reviewers_approved: true,
          completed_signed: false,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementAuditSignedFlag").mockResolvedValue(true);
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: draftWithParties(),
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Fully signed/)).toBeTruthy();
      expect(screen.getByTestId(`lawdog-agreement-status-${agreementId}`).textContent).toContain("Completed");
    });

    expect(screen.queryByRole("button", { name: "Continue signing" })).toBeNull();
    expect(screen.queryByRole("button", { name: "View signed agreement" })).toBeNull();
    expect(screen.getByTestId(`lawdog-action-open-${agreementId}`)).toBeTruthy();
  });

  it("shows the requested empty state", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [],
      skipped: [],
      error: null,
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-first-user-onboarding")).toBeTruthy();
    });

    expect(screen.getByText("Create your first agreement")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create first agreement" })).toBeTruthy();
  });

  it("after one persisted draft reload, shows Continue Editing for that agreement (not empty state)", async () => {
    const agreementId = "ag_genesis_persisted_1";
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        indexRow({
          id: agreementId,
          title: "Services Agreement — LawDog / Acme",
          review_sent_at: null,
          reviewer_approved: false,
          all_reviewers_approved: false,
          review_approvals_required: 0,
          review_approvals_completed: 0,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: draftWithParties({ id: agreementId, audit_log: [] }),
    });

    const user = userEvent.setup();
    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue Editing" })).toBeTruthy();
    });

    expect(screen.queryByText("Create your first agreement")).toBeNull();
    expect(screen.getByTestId("dashboard-whats-next-panel").getAttribute("data-agreement-id")).toBe(
      agreementId,
    );

    await user.click(screen.getByRole("button", { name: "Continue Editing" }));
    expect(mockNavigate).toHaveBeenCalledWith(`/app/send/${agreementId}`);
  });

  it("GTM: incomplete signer metadata on paid Pro draft CTA opens signer setup, not /app/send", async () => {
    const agreementId = "9d6d1be0-55dd-415a-bf61-fee9db743674";
    const incompleteDraft = draftWithParties({
      id: agreementId,
      audit_log: [],
      parties: [
        { name: "Blue Canyon Analytics LLC", role: "owner" },
        { name: "Iron Vale Systems Inc", role: "party" },
      ],
    });
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        indexRow({
          id: agreementId,
          title: "Services Agreement — LawDog / Acme",
          review_sent_at: null,
          reviewer_approved: false,
          all_reviewers_approved: false,
          review_approvals_required: 0,
          review_approvals_completed: 0,
        }),
      ],
      skipped: [],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: incompleteDraft,
    });

    const user = userEvent.setup();
    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-whats-next-panel").getAttribute("data-agreement-id")).toBe(
        agreementId,
      );
    });

    const cta = await waitFor(() => {
      const button = screen.getByTestId(`creator-dashboard-action-${agreementId}`);
      expect(button.textContent).toMatch(/Complete signer details/i);
      return button;
    });
    expect(cta.getAttribute("data-dashboard-whats-next-cta")).toBe("complete_signer_details");
    expect(screen.queryByRole("button", { name: "Continue Editing" })).toBeNull();
    await user.click(cta);
    expect(mockNavigate).toHaveBeenCalledWith(
      `/app/create?resume_signer_setup=${encodeURIComponent(agreementId)}`,
    );
    expect(mockNavigate).not.toHaveBeenCalledWith(`/app/send/${agreementId}`);
  });
});
