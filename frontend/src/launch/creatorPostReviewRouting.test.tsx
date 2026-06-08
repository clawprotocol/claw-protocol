/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgreementDraft } from "../agreement/agreementTypes";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import * as agreementPublicVerify from "../agreement/agreementPublicVerify";
import type { PublicVerifyPayload } from "../agreement/agreementPublicVerify";
import { SimpleDonePage } from "./simpleProduct/SimpleDonePage";
import { AppDashboard } from "./AppDashboard";
import { AgreementRecipientReview } from "../agreement/AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";

const mockNavigate = vi.fn();

vi.mock("./LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app/done",
    search: "",
    hash: "",
    navigate: mockNavigate,
  }),
}));

vi.mock("./ops/OperatorGrowthDashboard", () => ({
  canAccessOperatorGrowthDashboard: () => false,
}));

vi.mock("./simpleProduct/agreementToVs01SigningBridge", () => ({
  tryNavigatePaidProAgreementSenderFirstVs01Esign: vi.fn(async () => false),
}));

vi.mock("../monetization/usePowerGatedNavigation", () => ({
  usePowerGatedNavigation: () => ({
    navigateToReuse: vi.fn(),
    navigateToWorkProduct: vi.fn(),
  }),
}));

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function allApprovedDraft(id: string): AgreementDraft {
  return {
    id,
    title: "Services Agreement",
    jurisdiction: "CA",
    parties: [
      { id: "p1", name: "Blue Canyon Analytics LLC", role: "owner" },
      { id: "p2", name: "Iron Vale Systems Inc.", role: "party" },
    ],
    purpose: "Services",
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [{ version: 1, created_at: "2026-01-01T00:00:00Z" }],
    audit_log: [
      { event_type: "recipient_approved", at: "2026-01-01T00:00:00Z", value: { participant_id: "p1" } },
      { event_type: "recipient_approved", at: "2026-01-01T00:00:00Z", value: { participant_id: "p2" } },
    ],
  } as AgreementDraft;
}

const verifyPayload: PublicVerifyPayload = {
  agreement_id: "ag_post_review",
  summary: { title: "Services Agreement" },
  participants: [],
  version_history: [],
  signature_status: { fully_executed: false },
  signature_events: [],
  verification: { agreement_hash: "abc" },
};

describe("creator post-review routing", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("redirects creator away from proof-style done page when all reviews are approved", async () => {
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue(verifyPayload);
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: allApprovedDraft("ag_post_review"),
      lockedVersionId: null,
    });

    render(<SimpleDonePage agreementId="ag_post_review" />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/app");
    });
    expect(screen.queryByText("Agreement complete")).toBeNull();
    expect(screen.queryByRole("button", { name: "View verification" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send this agreement" })).toBeNull();
  });

  it("shows dashboard reviews-approved command surface instead of proof language", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchWorkspaceIndex").mockResolvedValue({
      agreements: [
        {
          id: "ag_post_review",
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
        },
      ],
      error: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: allApprovedDraft("ag_post_review"),
    });

    render(<AppDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Reviews approved")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Prepare signature links" })).toBeTruthy();
    expect(
      screen.getByText("Everyone approved this draft. Prepare signature links to start signing."),
    ).toBeTruthy();
    expect(screen.queryByText("Agreement complete")).toBeNull();
    expect(screen.queryByText("View verification")).toBeNull();
    expect(screen.queryByText("Send this agreement")).toBeNull();
  });

  it("routes creator post-approval prepare action to dashboard, not proof page", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const agreementId = "ag_creator_prepare";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : String(input);
      const method = (
        init?.method ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Services Agreement</p><p>Body.</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({
          draft: allApprovedDraft(agreementId),
          signing_lock: null,
        });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p1"
          recipientViewerContext="qa_recipient_simulation"
          qaOwnerReturnPath={`/app/done/${agreementId}`}
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Prepare signature links" })).toBeTruthy();
    });

    await userEvent.click(screen.getByRole("button", { name: "Prepare signature links" }));
    expect(mockNavigate).toHaveBeenCalledWith("/app");
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
  });

  it("keeps public recipient review-complete screen unchanged", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const agreementId = "ag_public_done";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : String(input);
      const method = (
        init?.method ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Services Agreement</p><p>Body.</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({
          draft: allApprovedDraft(agreementId),
          signing_lock: null,
        });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview
          agreementId={agreementId}
          recipientAccessToken="tok_test"
          participantPartyId="p2"
          recipientViewerContext="public_recipient"
        />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("recipient-approved-waiting-header").textContent).toContain(
        "All reviews complete",
      );
    });
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Return to dashboard" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Prepare signature links" })).toBeNull();
  });
});
