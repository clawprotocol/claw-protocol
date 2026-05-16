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
import { persistPremiumRecipientHandoff } from "../../components/agreements/premiumPartyNamesHandoff";
import { OWNER_DONE_ALL_REVIEWERS_APPROVED_BODY_COPY } from "../../components/agreements/draftRecipientReviewSignals";

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
        premium_full_document_text: "PRO_REVIEWED_BODY_FOR_SIGNING",
        audit_log: [{ event_type: "recipient_approved", at: "2026-01-02T00:00:00Z" }],
      }),
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: baseDraft({
        premium_full_document_text: "PRO_REVIEWED_BODY_FOR_SIGNING",
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

    expect(screen.getByRole("heading", { level: 1, name: "All reviewers approved" })).toBeTruthy();
    expect(screen.getByTestId("simple-done-all-approved-body").textContent).toBe(
      OWNER_DONE_ALL_REVIEWERS_APPROVED_BODY_COPY,
    );
    expect(screen.getByTestId("simple-done-finalize-for-signing")).toBeTruthy();
    expect(screen.getByTestId("simple-done-review-primary-actions")).toBeTruthy();
    expect(screen.getByTestId("simple-done-owner-approval-status").textContent).toContain(
      "All reviewers approved — ready to prepare signing.",
    );

    await userEvent.click(screen.getByTestId("simple-done-finalize-for-signing"));
    expect(mockTryNavigatePaidProVs01).toHaveBeenCalledWith(
      expect.objectContaining({
        agreementId,
        logReason: "simple_done_finalize_clean",
        draft: expect.objectContaining({
          premium_full_document_text: "PRO_REVIEWED_BODY_FOR_SIGNING",
        }),
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/app/esign/mock-vs01-doc?agreement_bridge=1");
  });

  it("Resolve in workspace routes to negotiation when open recipient proposals exist", async () => {
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
      expect(screen.getByTestId("simple-done-resolve-in-workspace")).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId("simple-done-resolve-in-workspace"));
    expect(mockTryNavigatePaidProVs01).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(`/app/agreements/${encodeURIComponent(agreementId)}`);
  });

  it("with 4 review links and one approval, does not show Finalize or ready-to-sign for all reviewers", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
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
      recipients: [
        { displayName: "A", reviewHref: "https://example.com/review/a" },
        { displayName: "B", reviewHref: "https://example.com/review/b" },
        { displayName: "C", reviewHref: "https://example.com/review/c" },
        { displayName: "D", reviewHref: "https://example.com/review/d" },
      ],
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("simple-done-owner-approval-status").textContent).toMatch(
        /1 of 4 reviewers approved/,
      );
    });
    expect(screen.queryByTestId("simple-done-finalize-for-signing")).toBeNull();
    expect(screen.getByTestId("simple-done-owner-approval-status").textContent).toContain(
      "1 of 4 reviewers approved. Waiting for remaining reviewers.",
    );
    expect(screen.getByTestId("simple-done-owner-approval-status").textContent).not.toMatch(/ready to sign/i);
  });

  it("with 4 review links and four participant approvals, shows Finalize and all-reviewers ready copy", async () => {
    const parties = [
      { id: "r1", name: "R1", role: "reviewer" as const },
      { id: "r2", name: "R2", role: "reviewer" as const },
      { id: "r3", name: "R3", role: "reviewer" as const },
      { id: "r4", name: "R4", role: "reviewer" as const },
    ];
    const audit_log = parties.map((p) => ({
      event_type: "participant_approved" as const,
      at: "2026-01-02T00:00:00Z",
      value: { participant_id: p.id },
    }));
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({ parties, audit_log }),
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: baseDraft({ parties, audit_log }),
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: parties.map((p) => ({
        displayName: p.name,
        reviewHref: `https://example.com/review/${p.id}`,
        recipientPartyId: p.id,
      })),
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("simple-done-finalize-for-signing")).toBeTruthy();
    });
    expect(screen.getByRole("heading", { level: 1, name: "All reviewers approved" })).toBeTruthy();
    expect(screen.getByTestId("simple-done-all-approved-body").textContent).toBe(
      OWNER_DONE_ALL_REVIEWERS_APPROVED_BODY_COPY,
    );
    expect(screen.getByTestId("simple-done-review-primary-actions")).toBeTruthy();
    expect(screen.getByTestId("simple-done-owner-approval-status").textContent).toContain(
      "4 of 4 reviewers approved. Ready to prepare signing.",
    );
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

  it("Finalize for signing passes recipientSetup emails from premium handoff into VS01 bridge", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
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

    persistPremiumRecipientHandoff({
      party1: { name: "Owner", email: "owner@firm.com", role: "owner" },
      party2: { name: "Pat", email: "pat@review.co", role: "party" },
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
    expect(mockTryNavigatePaidProVs01).toHaveBeenCalledWith(
      expect.objectContaining({
        agreementId,
        logReason: "simple_done_finalize_clean",
        reviewerApprovedCleanHandoff: true,
        recipientSetup: expect.objectContaining({
          recipientPartyEmails: ["owner@firm.com", "pat@review.co"],
        }),
      }),
    );
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
      expect(
        screen.getByText("Nothing has been signed. Copy this private link and send it to each reviewer."),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId("simple-done-finalize-for-signing")).toBeNull();
    const primaries = screen.getAllByRole("button", { name: /Copy review link/i });
    expect(primaries.some((b) => b.className.includes("vs01-btn--primary"))).toBe(true);
  });

  it("multi-reviewer handoff shows per-row table and hides global copy review link", async () => {
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({ audit_log: [] }),
      lockedVersionId: null,
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: [
        { displayName: "A", reviewHref: "https://example.com/review/a?t=1" },
        { displayName: "B", reviewHref: "https://example.com/review/b?t=2" },
      ],
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("paid-pro-reviewer-links-table")).toBeTruthy();
    });
    expect(screen.queryByTestId("simple-done-copy-review-link-primary")).toBeNull();
    expect(screen.queryByTestId("simple-done-open-reviewer-view-global")).toBeNull();
  });

  it("shows loading-only copy when review links pending and multiple reviewers required", async () => {
    const parties = [
      { id: "o", name: "Owner", role: "owner" as const, email: "o@o.com" },
      { id: "r1", name: "R1", role: "reviewer" as const, email: "r1@r.com" },
      { id: "r2", name: "R2", role: "reviewer" as const, email: "r2@r.com" },
    ];
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({ parties, audit_log: [] }),
      lockedVersionId: null,
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: [],
      reviewLinksPending: true,
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("simple-done-review-links-loading-only")).toBeTruthy();
    });
  });

  it("with 4 review links and zero approvals, does not show Finalize for signing", async () => {
    const parties = [
      { id: "r1", name: "R1", role: "reviewer" as const },
      { id: "r2", name: "R2", role: "reviewer" as const },
      { id: "r3", name: "R3", role: "reviewer" as const },
      { id: "r4", name: "R4", role: "reviewer" as const },
    ];
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({ parties, audit_log: [] }),
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: baseDraft({ parties, audit_log: [] }),
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: [
        { displayName: "R1", reviewHref: "https://example.com/review/r1", recipientPartyId: "r1" },
        { displayName: "R2", reviewHref: "https://example.com/review/r2", recipientPartyId: "r2" },
        { displayName: "R3", reviewHref: "https://example.com/review/r3", recipientPartyId: "r3" },
        { displayName: "R4", reviewHref: "https://example.com/review/r4", recipientPartyId: "r4" },
      ],
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("simple-done-owner-approval-status").textContent).toContain("0 of 4 reviewers approved");
    });
    expect(screen.queryByTestId("simple-done-finalize-for-signing")).toBeNull();
  });

  it("with 4 approvals and open proposals, hides Finalize and shows Resolve in workspace as primary", async () => {
    const parties = [
      { id: "r1", name: "R1", role: "reviewer" as const },
      { id: "r2", name: "R2", role: "reviewer" as const },
      { id: "r3", name: "R3", role: "reviewer" as const },
      { id: "r4", name: "R4", role: "reviewer" as const },
    ];
    const audit_log = [
      ...parties.map((p) => ({
        event_type: "participant_approved" as const,
        at: "2026-01-02T00:00:00Z",
        value: { participant_id: p.id },
      })),
      {
        event_type: "recipient_proposal_pending" as const,
        at: "2026-01-02T01:00:00Z",
        value: {
          proposal_id: "p1",
          instruction: "Change term X",
          draft: { title: "Lease" },
        },
      },
    ];
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({ parties, audit_log }),
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: baseDraft({ parties, audit_log }),
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: [
        { displayName: "R1", reviewHref: "https://example.com/review/r1", recipientPartyId: "r1" },
        { displayName: "R2", reviewHref: "https://example.com/review/r2", recipientPartyId: "r2" },
        { displayName: "R3", reviewHref: "https://example.com/review/r3", recipientPartyId: "r3" },
        { displayName: "R4", reviewHref: "https://example.com/review/r4", recipientPartyId: "r4" },
      ],
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("simple-done-resolve-in-workspace")).toBeTruthy();
    });
    expect(screen.queryByTestId("simple-done-finalize-for-signing")).toBeNull();
    expect(screen.getByTestId("simple-done-review-primary-actions")).toBeTruthy();
  });

  it("with 4 approvals but reviewLinksPending, hides Finalize until links settle", async () => {
    const parties = [
      { id: "r1", name: "R1", role: "reviewer" as const },
      { id: "r2", name: "R2", role: "reviewer" as const },
      { id: "r3", name: "R3", role: "reviewer" as const },
      { id: "r4", name: "R4", role: "reviewer" as const },
    ];
    const audit_log = parties.map((p) => ({
      event_type: "participant_approved" as const,
      at: "2026-01-02T00:00:00Z",
      value: { participant_id: p.id },
    }));
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({ parties, audit_log }),
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: baseDraft({ parties, audit_log }),
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: [
        { displayName: "R1", reviewHref: "https://example.com/review/r1", recipientPartyId: "r1" },
        { displayName: "R2", reviewHref: "https://example.com/review/r2", recipientPartyId: "r2" },
        { displayName: "R3", reviewHref: "https://example.com/review/r3", recipientPartyId: "r3" },
        { displayName: "R4", reviewHref: "https://example.com/review/r4", recipientPartyId: "r4" },
      ],
      reviewLinksPending: true,
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("simple-done-review-links-loading-warning")).toBeTruthy();
    });
    expect(screen.queryByTestId("simple-done-finalize-for-signing")).toBeNull();
  });

  it("multi-reviewer row-derived aggregate stays 4/4 when draft.parties omit reviewer roles but handoff rows carry party ids", async () => {
    const audit_log = (["r1", "r2", "r3", "r4"] as const).map((id) => ({
      event_type: "participant_approved" as const,
      at: "2026-01-02T00:00:00Z",
      value: { participant_id: id },
    }));
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({
        parties: [{ id: "o1", name: "Owner", role: "owner" as const }],
        audit_log,
      }),
      lockedVersionId: null,
    });
    const spyDraft = vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: baseDraft({
        parties: [{ id: "o1", name: "Owner", role: "owner" as const }],
        audit_log,
      }),
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: (["r1", "r2", "r3", "r4"] as const).map((id) => ({
        displayName: id.toUpperCase(),
        reviewHref: `https://example.com/review/${id}`,
        recipientPartyId: id,
      })),
    });

    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("simple-done-finalize-for-signing")).toBeTruthy();
    });
    expect(screen.getByTestId("simple-done-owner-approval-status").textContent).toContain(
      "4 of 4 reviewers approved. Ready to prepare signing.",
    );
    expect(screen.getByTestId("simple-done-owner-approval-status").textContent).not.toContain("0 of 4");
    expect(spyDraft).not.toHaveBeenCalled();
  });

  it("preserves agreement id in props after visibility refresh simulation", async () => {
    const parties = [
      { id: "r1", name: "R1", role: "reviewer" as const },
      { id: "r2", name: "R2", role: "reviewer" as const },
    ];
    const spyLock = vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft({ parties, audit_log: [] }),
      lockedVersionId: null,
    });

    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: parties.map((p) => ({
        displayName: p.name,
        reviewHref: `https://example.com/review/${p.id}`,
        recipientPartyId: p.id,
      })),
    });

    const { rerender } = render(<SimpleDonePage agreementId={agreementId} />);
    await waitFor(() => {
      expect(spyLock).toHaveBeenCalled();
    });
    const callsAfterMount = spyLock.mock.calls.length;
    document.dispatchEvent(new Event("visibilitychange"));
    rerender(<SimpleDonePage agreementId={agreementId} />);
    await waitFor(() => {
      expect(spyLock.mock.calls.length).toBeGreaterThanOrEqual(callsAfterMount);
    });
  });
});
