/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import * as agreementWorkspaceApi from "../../agreement/agreementWorkspaceApi";
import * as agreementPublicVerify from "../../agreement/agreementPublicVerify";
import type { PublicVerifyPayload } from "../../agreement/agreementPublicVerify";
import { SimpleDonePage } from "./SimpleDonePage";
import { markSimpleFlowSent } from "../simpleFlowSent";
import { writeSimpleDoneReviewRecipientLinks } from "./simpleDoneReviewRecipientLinks";

const { mockNavigate, mockTryNavigatePaidProVs01 } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockTryNavigatePaidProVs01: vi.fn(
    async (opts: { navigate: (to: string) => void | Promise<void>; agreementId: string }) => {
      void opts.navigate(`/app/esign/mock-vs01-doc?agreement_bridge=1`);
      return true;
    },
  ),
}));

vi.mock("./agreementToVs01SigningBridge", () => ({
  tryNavigatePaidProAgreementSenderFirstVs01Esign: mockTryNavigatePaidProVs01,
}));

vi.mock("../LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app/done",
    search: "",
    hash: "",
    navigate: mockNavigate,
  }),
}));

vi.mock("../../monetization/usePowerGatedNavigation", () => ({
  usePowerGatedNavigation: () => ({
    navigateToReuse: vi.fn(),
    navigateToWorkProduct: vi.fn(),
  }),
}));

const agreementId = "ag_simple_done_owner";

function baseDraft(over: Partial<AgreementDraft> = {}): AgreementDraft {
  return {
    id: agreementId,
    title: "Lease",
    jurisdiction: "CA",
    parties: [{ name: "Owner", role: "owner" }, { name: "Pat", role: "party" }],
    purpose: "Services",
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [{ version: 1, created_at: "2026-01-01T00:00:00Z" }],
    audit_log: [],
    ...over,
  } as AgreementDraft;
}

const verifyPayload: PublicVerifyPayload = {
  agreement_id: agreementId,
  summary: { title: "Lease" },
  participants: [],
  version_history: [],
  signature_status: { fully_executed: false },
  signature_events: [],
  verification: { agreement_hash: "abc" },
};

describe("SimpleDonePage owner approval UX", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockTryNavigatePaidProVs01.mockImplementation(async (opts) => {
      void opts.navigate(`/app/esign/mock-vs01-doc?agreement_bridge=1`);
      return true;
    });
    sessionStorage.clear();
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue(verifyPayload);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("shows Finalize for signing and routes to VS01 e-sign bridge when reviewer approved without lock", async () => {
    const spyLock = vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({
        audit_log: [{ event_type: "recipient_approved", at: "2026-01-02T00:00:00Z" }],
      }),
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: baseDraft({
        audit_log: [{ event_type: "recipient_approved", at: "2026-01-02T00:00:00Z" }],
      }),
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: [{ displayName: "Pat", reviewHref: "https://example.com/review/pat" }],
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(spyLock).toHaveBeenCalled();
    });

    expect(
      screen.getByText("Reviewer approved this draft without requesting changes."),
    ).toBeTruthy();
    expect(screen.getByTestId("simple-done-finalize-for-signing")).toBeTruthy();
    expect(screen.getByTestId("simple-done-owner-approval-status").textContent).toContain(
      "Reviewer approved — ready to sign",
    );

    await userEvent.click(screen.getByTestId("simple-done-finalize-for-signing"));
    expect(mockTryNavigatePaidProVs01).toHaveBeenCalledWith(
      expect.objectContaining({
        agreementId,
        logReason: "simple_done_finalize_clean",
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/app/esign/mock-vs01-doc?agreement_bridge=1");
  });

  it("Finalize for signing routes to negotiation workspace when open recipient proposals exist", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({
        audit_log: [
          { event_type: "recipient_approved", at: "2026-01-02T00:00:00Z" },
          {
            event_type: "recipient_proposal_pending",
            at: "2026-01-02T01:00:00Z",
            value: {
              proposal_id: "p1",
              instruction: "Change term X",
              draft: { title: "Lease" },
            },
          },
        ],
      }),
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: baseDraft({
        audit_log: [
          { event_type: "recipient_approved", at: "2026-01-02T00:00:00Z" },
          {
            event_type: "recipient_proposal_pending",
            at: "2026-01-02T01:00:00Z",
            value: {
              proposal_id: "p1",
              instruction: "Change term X",
              draft: { title: "Lease" },
            },
          },
        ],
      }),
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: [{ displayName: "Pat", reviewHref: "https://example.com/review/pat" }],
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("simple-done-finalize-for-signing")).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId("simple-done-finalize-for-signing"));
    expect(mockTryNavigatePaidProVs01).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(`/app/agreements/${encodeURIComponent(agreementId)}`);
  });

  it("shows Continue to signing when signing lock present", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({
        audit_log: [{ event_type: "recipient_approved", at: "2026-01-02T00:00:00Z" }],
      }),
      lockedVersionId: "ver-locked-1",
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: [{ displayName: "Pat", reviewHref: "https://example.com/review/pat" }],
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("simple-done-continue-to-signing")).toBeTruthy();
    });
    expect(screen.getByTestId("simple-done-owner-approval-status").textContent).toContain("Signing version locked");

    await userEvent.click(screen.getByTestId("simple-done-continue-to-signing"));
    expect(mockTryNavigatePaidProVs01).toHaveBeenCalledWith(
      expect.objectContaining({
        agreementId,
        logReason: "simple_done_continue_vs01",
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/app/esign/mock-vs01-doc?agreement_bridge=1");
  });

  it("pre-approval path keeps Copy review link as primary", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({ audit_log: [] }),
      lockedVersionId: null,
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: [{ displayName: "Pat", reviewHref: "https://example.com/review/pat" }],
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByText("Nothing has been signed. Copy this private link and send it to the reviewer.")).toBeTruthy();
    });
    expect(screen.queryByTestId("simple-done-finalize-for-signing")).toBeNull();
    const primaries = screen.getAllByRole("button", { name: /Copy review link/i });
    expect(primaries.some((b) => b.className.includes("vs01-btn--primary"))).toBe(true);
  });
});
