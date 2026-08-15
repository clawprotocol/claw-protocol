/** @vitest-environment jsdom */
/**
 * TEST579 — unified review-track handoff → dashboard banner acceptance.
 * Proves: handoff write → session notice → dashboard mount → DOM banner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgreementDraft } from "../agreement/agreementTypes";
import { fetchAgreementDraft, postReviewSentServer } from "../agreement/agreementWorkspaceApi";
import { reviewLinkMintHasUsableUrls } from "./simpleProduct/simpleDoneReviewRecipientLinks";
import { resolveReviewFirstMintPolicyGate } from "./simpleProduct/reviewFirstAccessPolicy";
import { peekReviewFirstMintInFlight } from "./simpleProduct/reviewFirstSendSurface";
import { executePaidProPostRecipientSetupHandoff } from "./simpleProduct/paidProPostRecipientSetupHandoff";
import { AppDashboard } from "./AppDashboard";
import {
  REVIEW_EMAIL_DELIVERY_INCOMPLETE_BODY,
  REVIEW_EMAIL_DELIVERY_INCOMPLETE_TITLE,
  REVIEW_INVITATIONS_SENT_BODY,
  REVIEW_INVITATIONS_SENT_TITLE,
} from "./simpleProduct/reviewDeliveryOwnerRouting";
import {
  clearReviewDeliveryHandoffNoticeForTests,
  REVIEW_DELIVERY_HANDOFF_NOTICE_KEY,
  writeReviewDeliveryHandoffNotice,
} from "./reviewDeliveryHandoffNotice";

const reviewSentSuccess = { ok: true, inviteEmailsSent: true };
const reviewSentNoInvite = { ok: true, inviteEmailsSent: false };

vi.mock("../agreement/agreementWorkspaceApi", () => ({
  postReviewSentServer: vi.fn(async () => reviewSentSuccess),
  patchAgreementField: vi.fn(async () => true),
  fetchAgreementDraft: vi.fn(async () => ({ ok: true, draft: null })),
  fetchWorkspaceIndex: vi.fn(async () => ({ agreements: [], skipped: [], error: null })),
}));

vi.mock("./simpleProduct/simpleDoneReviewRecipientLinks", () => ({
  mintSimpleDoneReviewRecipientLinkRows: vi.fn(async () => ({
    rows: [{ displayName: "R1", reviewHref: "https://app.example.com/agreements/a1/review?t=tok" }],
    attemptedMintCount: 1,
    reusedCount: 0,
    alreadyReady: false,
    firstErrorStatus: undefined,
    lastMintErrorDetail: undefined,
    lastMintErrorCode: undefined,
  })),
  reviewLinkMintHasUsableUrls: vi.fn(() => true),
  writeSimpleDoneReviewRecipientLinks: vi.fn(),
  reviewLinkMintFailureUserCopy: vi.fn(() => "mint failed"),
}));

vi.mock("./simpleProduct/reviewFirstAccessPolicy", () => ({
  resolveReviewFirstMintPolicyGate: vi.fn(async () => ({ ok: true as const, policy: null })),
}));

vi.mock("./simpleProduct/reviewFirstSendSurface", () => ({
  mergeDraftWithReviewFirstPinnedCorpus: vi.fn((draft: AgreementDraft) => draft),
  peekReviewFirstPinnedCorpus: vi.fn(() => null),
  peekReviewFirstMintInFlight: vi.fn(() => false),
  setReviewFirstMintInFlight: vi.fn(),
  clearReviewFirstMintInFlight: vi.fn(),
  isReviewFirstSigningTokenSecretNotConfigured: vi.fn(() => false),
  logReviewFirstEnvTokenSecretMissing: vi.fn(),
  resolveReviewFirstMintFailureUserMessage: vi.fn(() => "mint failed"),
}));

vi.mock("./simpleFlowSent", () => ({
  markSimpleFlowSent: vi.fn(),
}));

vi.mock("../joy/joyTelemetry", () => ({
  emitActionCompleted: vi.fn(),
}));

vi.mock("../components/agreements/guidedDealCompletion/guidedFinalReviewToSigning", () => ({
  logReviewFirstMintStart: vi.fn(),
  logReviewFirstMintSuccess: vi.fn(),
  logReviewFirstMintError: vi.fn(),
}));

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

const baseDraft = {
  title: "Test Agreement",
  jurisdiction: "TX",
  parties: [
    { id: "p_owner", name: "Owner", role: "owner", email: "owner@example.com" },
    { id: "p_r1", name: "R1", role: "reviewer", email: "r1@example.com" },
  ],
  purpose: "P",
  payment_terms: "Net 30",
} as unknown as AgreementDraft;

function stubEmptyWorkspace(): void {
  /* fetchWorkspaceIndex mocked in vi.mock above */
}

describe("TEST579 review handoff → dashboard banner (unified)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearReviewDeliveryHandoffNoticeForTests();
    vi.clearAllMocks();
    vi.mocked(peekReviewFirstMintInFlight).mockReturnValue(false);
    vi.mocked(reviewLinkMintHasUsableUrls).mockReturnValue(true);
    vi.mocked(resolveReviewFirstMintPolicyGate).mockResolvedValue({ ok: true, policy: null });
    vi.mocked(postReviewSentServer).mockResolvedValue(reviewSentSuccess);
    vi.mocked(fetchAgreementDraft).mockResolvedValue({ ok: true, draft: null });
    mockNavigate.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("incomplete email delivery: handoff writes notice, navigate, dashboard renders banner", async () => {
    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual_and_email");
    vi.mocked(postReviewSentServer).mockResolvedValue(reviewSentNoInvite);

    const result = await executePaidProPostRecipientSetupHandoff({
      navigate: mockNavigate,
      agreementId: "ag_unified_incomplete",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith("/app?focus=ag_unified_incomplete");
    expect(sessionStorage.getItem(REVIEW_DELIVERY_HANDOFF_NOTICE_KEY)).toBeTruthy();

    stubEmptyWorkspace();
    render(<AppDashboard />);

    const notice = await screen.findByTestId("dashboard-review-delivery-handoff-notice");
    expect(notice).toBeTruthy();
    expect(screen.getByText(REVIEW_EMAIL_DELIVERY_INCOMPLETE_TITLE)).toBeTruthy();
    expect(screen.getByText(REVIEW_EMAIL_DELIVERY_INCOMPLETE_BODY)).toBeTruthy();
    expect(sessionStorage.getItem(REVIEW_DELIVERY_HANDOFF_NOTICE_KEY)).toBeNull();
  });

  it("successful email delivery: handoff writes notice, navigate, dashboard renders banner", async () => {
    const result = await executePaidProPostRecipientSetupHandoff({
      navigate: mockNavigate,
      agreementId: "ag_unified_success",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith("/app");
    expect(sessionStorage.getItem(REVIEW_DELIVERY_HANDOFF_NOTICE_KEY)).toBeTruthy();

    stubEmptyWorkspace();
    render(<AppDashboard />);

    await screen.findByTestId("dashboard-review-delivery-handoff-notice");
    expect(screen.getByText(REVIEW_INVITATIONS_SENT_TITLE)).toBeTruthy();
    expect(screen.getByText(REVIEW_INVITATIONS_SENT_BODY)).toBeTruthy();
  });

  it("dismisses the handoff notice on dashboard", async () => {
    writeReviewDeliveryHandoffNotice({
      agreementId: "ag_dismiss",
      routeReason: "review_email_delivery_incomplete",
    });

    render(<AppDashboard />);
    await screen.findByTestId("dashboard-review-delivery-handoff-notice");

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => {
      expect(screen.queryByTestId("dashboard-review-delivery-handoff-notice")).toBeNull();
    });
  });

  it("handoff never writes review_sent_failed_fallback notice kind", async () => {
    vi.mocked(postReviewSentServer).mockResolvedValue({ ok: false, inviteEmailsSent: false });

    await executePaidProPostRecipientSetupHandoff({
      navigate: mockNavigate,
      agreementId: "ag_unified_fail",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    const raw = sessionStorage.getItem(REVIEW_DELIVERY_HANDOFF_NOTICE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { kind?: string };
    expect(parsed.kind).toBe("review_email_delivery_incomplete");
    expect(parsed.kind).not.toBe("review_sent_failed_fallback");
  });
});
