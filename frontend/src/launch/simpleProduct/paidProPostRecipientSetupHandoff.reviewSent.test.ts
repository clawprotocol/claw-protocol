import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { fetchAgreementDraft, patchAgreementField, postReviewSentServer } from "../../agreement/agreementWorkspaceApi";
import {
  reviewLinkMintHasUsableUrls,
} from "./simpleDoneReviewRecipientLinks";
import { resolveReviewFirstMintPolicyGate } from "./reviewFirstAccessPolicy";
import {
  peekReviewFirstMintInFlight,
} from "./reviewFirstSendSurface";
import { markSimpleFlowSent } from "../simpleFlowSent";

const reviewSentSuccess = { ok: true, inviteEmailsSent: true };
const reviewSentNoInvite = { ok: true, inviteEmailsSent: false };

vi.mock("../../agreement/agreementWorkspaceApi", () => ({
  postReviewSentServer: vi.fn(async () => reviewSentSuccess),
  patchAgreementField: vi.fn(async () => true),
  fetchAgreementDraft: vi.fn(async () => ({ ok: true, draft: null })),
}));

import {
  executePaidProPostRecipientSetupHandoff,
  maybePostReviewSentAfterReviewFirstHandoff,
} from "./paidProPostRecipientSetupHandoff";
import * as agreementIntakeStorage from "../../components/agreements/agreementIntakeStorage";

vi.mock("./simpleDoneReviewRecipientLinks", () => ({
  mintSimpleDoneReviewRecipientLinkRows: vi.fn(async () => ({
    rows: [{ displayName: "R1", reviewHref: "https://app.example.com/agreements/a1/review?t=tok" }],
    firstErrorStatus: undefined,
    lastMintErrorDetail: undefined,
    lastMintErrorCode: undefined,
  })),
  reviewLinkMintHasUsableUrls: vi.fn(() => true),
  writeSimpleDoneReviewRecipientLinks: vi.fn(),
  reviewLinkMintFailureUserCopy: vi.fn(() => "mint failed"),
}));

vi.mock("./reviewFirstAccessPolicy", () => ({
  resolveReviewFirstMintPolicyGate: vi.fn(async () => ({ ok: true as const, policy: null })),
}));

vi.mock("./reviewFirstSendSurface", () => ({
  mergeDraftWithReviewFirstPinnedCorpus: vi.fn((draft: AgreementDraft) => draft),
  peekReviewFirstPinnedCorpus: vi.fn(() => null),
  peekReviewFirstMintInFlight: vi.fn(() => false),
  setReviewFirstMintInFlight: vi.fn(),
  clearReviewFirstMintInFlight: vi.fn(),
  isReviewFirstSigningTokenSecretNotConfigured: vi.fn(() => false),
  logReviewFirstEnvTokenSecretMissing: vi.fn(),
  resolveReviewFirstMintFailureUserMessage: vi.fn(() => "mint failed"),
}));

vi.mock("../simpleFlowSent", () => ({
  markSimpleFlowSent: vi.fn(),
}));

vi.mock("../../joy/joyTelemetry", () => ({
  emitActionCompleted: vi.fn(),
}));

vi.mock("../../components/agreements/guidedDealCompletion/guidedFinalReviewToSigning", () => ({
  logReviewFirstMintStart: vi.fn(),
  logReviewFirstMintSuccess: vi.fn(),
  logReviewFirstMintError: vi.fn(),
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

describe("paid Pro review-first review-sent handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(peekReviewFirstMintInFlight).mockReturnValue(false);
    vi.mocked(reviewLinkMintHasUsableUrls).mockReturnValue(true);
    vi.mocked(resolveReviewFirstMintPolicyGate).mockResolvedValue({ ok: true, policy: null });
    vi.mocked(postReviewSentServer).mockResolvedValue(reviewSentSuccess);
    vi.mocked(fetchAgreementDraft).mockResolvedValue({ ok: true, draft: null });
  });

  it("routes to dashboard after successful review-sent when delivery env is unset", async () => {
    vi.unstubAllEnvs();
    const navigate = vi.fn();

    const result = await executePaidProPostRecipientSetupHandoff({
      navigate,
      agreementId: "ag_review_runtime",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.destination).toBe("dashboard");
      expect(result.ownerRoutePath).toBe("/app");
    }
    expect(navigate).toHaveBeenCalledWith("/app");
  });

  it("persists dashboard resume id after email review send routes to dashboard", async () => {
    const writeResumeSpy = vi.spyOn(agreementIntakeStorage, "writeCreateReviewAgreementResumeId");
    const navigate = vi.fn();

    const result = await executePaidProPostRecipientSetupHandoff({
      navigate,
      agreementId: "ag_review_resume",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    expect(writeResumeSpy).toHaveBeenCalledWith("ag_review_resume");
    writeResumeSpy.mockRestore();
  });

  it("explicit manual mode routes to dashboard after successful review-sent", async () => {
    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual");
    const navigate = vi.fn();
    const result = await executePaidProPostRecipientSetupHandoff({
      navigate,
      agreementId: "ag_review_1",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.destination).toBe("dashboard");
      expect(result.ownerRoutePath).toBe("/app");
    }
    expect(postReviewSentServer).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/app");
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining("/app/done/"));
  });

  it("routes owner to dashboard when email delivery mode env is active and invite sent", async () => {
    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual_and_email");
    const navigate = vi.fn();
    const result = await executePaidProPostRecipientSetupHandoff({
      navigate,
      agreementId: "ag_review_email",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/app");
  });

  it("routes to dashboard focus in email mode when review-sent ok but no invite marker", async () => {
    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual_and_email");
    vi.mocked(postReviewSentServer).mockResolvedValue(reviewSentNoInvite);
    const navigate = vi.fn();

    const result = await executePaidProPostRecipientSetupHandoff({
      navigate,
      agreementId: "ag_review_no_invite",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.destination).toBe("dashboard");
      expect(result.ownerRoutePath).toBe("/app?focus=ag_review_no_invite");
    }
    expect(navigate).toHaveBeenCalledWith("/app?focus=ag_review_no_invite");
  });

  it("review-sent failure routes to dashboard focus when env is unset", async () => {
    vi.unstubAllEnvs();
    vi.mocked(postReviewSentServer).mockResolvedValue({ ok: false, inviteEmailsSent: false });
    const navigate = vi.fn();

    const result = await executePaidProPostRecipientSetupHandoff({
      navigate,
      agreementId: "ag_review_fail_sent",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.destination).toBe("dashboard");
    expect(navigate).toHaveBeenCalledWith("/app?focus=ag_review_fail_sent");
  });

  it("maybePostReviewSentAfterReviewFirstHandoff still posts when mint preset review_sent_at", async () => {
    vi.mocked(fetchAgreementDraft).mockResolvedValue({
      ok: true,
      draft: {
        ...baseDraft,
        review_sent_at: "2026-06-01T00:00:00.000Z",
      },
    });
    const result = await maybePostReviewSentAfterReviewFirstHandoff(
      "ag_review_2",
      { ...baseDraft, review_sent_at: "2026-06-01T00:00:00.000Z" },
      "test",
    );
    expect(postReviewSentServer).toHaveBeenCalledTimes(1);
    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("maybePostReviewSentAfterReviewFirstHandoff skips when invite emails already sent", async () => {
    vi.mocked(fetchAgreementDraft).mockResolvedValue({
      ok: true,
      draft: {
        ...baseDraft,
        review_sent_at: "2026-06-01T00:00:00.000Z",
        review_invite_emails_sent_at: "2026-06-02T00:00:00.000Z",
      },
    });
    const result = await maybePostReviewSentAfterReviewFirstHandoff("ag_review_2", baseDraft, "test");
    expect(postReviewSentServer).not.toHaveBeenCalled();
    expect(result.skipped).toBe("invite_emails_already_sent");
    expect(result.inviteEmailsSent).toBe(true);
  });

  it("maybePostReviewSentAfterReviewFirstHandoff posts when review_sent_at is unset", async () => {
    const result = await maybePostReviewSentAfterReviewFirstHandoff("ag_review_3", baseDraft, "test");
    expect(postReviewSentServer).toHaveBeenCalledTimes(1);
    expect(postReviewSentServer).toHaveBeenCalledWith("ag_review_3");
    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("does not call postReviewSentServer when mint fails", async () => {
    vi.mocked(reviewLinkMintHasUsableUrls).mockReturnValue(false);
    const result = await executePaidProPostRecipientSetupHandoff({
      navigate: vi.fn(),
      agreementId: "ag_review_fail",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });
    expect(result.ok).toBe(false);
    expect(postReviewSentServer).not.toHaveBeenCalled();
    expect(patchAgreementField).not.toHaveBeenCalled();
  });

  it("persists explicit owner role before review-sent for paid Pro client/service_provider parties", async () => {
    vi.stubEnv("VITE_REVIEW_DELIVERY_MODE", "manual");
    const paidProDraft = {
      ...baseDraft,
      parties: [
        {
          id: "p_client",
          name: "Blue Canyon Analytics LLC",
          role: "client",
          email: "owner-user@example.com",
        },
        {
          id: "p_provider",
          name: "Iron Vale Systems Inc.",
          role: "service_provider",
          email: "external-reviewer@example.com",
        },
      ],
    } as unknown as AgreementDraft;

    vi.mocked(fetchAgreementDraft).mockResolvedValue({
      ok: true,
      draft: {
        ...paidProDraft,
        review_sent_at: "2026-06-01T00:00:00.000Z",
        parties: [
          {
            id: "p_client",
            name: "Blue Canyon Analytics LLC",
            role: "client",
          },
          {
            id: "p_provider",
            name: "Iron Vale Systems Inc.",
            role: "service_provider",
          },
        ],
      } as AgreementDraft,
    });

    const result = await executePaidProPostRecipientSetupHandoff({
      navigate: vi.fn(),
      agreementId: "ag_review_roles",
      draft: paidProDraft,
      premiumSendIntent: "review",
      recipientSetup: {
        recipient1Email: "owner-user@example.com",
        recipient2Email: "external-reviewer@example.com",
      },
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    expect(patchAgreementField).toHaveBeenCalledTimes(1);
    const patchedParties = vi.mocked(patchAgreementField).mock.calls[0]?.[2] as Array<{ role: string; email?: string }>;
    expect(patchedParties[0]?.role).toBe("owner");
    expect(patchedParties[0]?.email).toBe("owner-user@example.com");
    expect(patchedParties[1]?.role).toBe("reviewer");
    expect(patchedParties[1]?.email).toBe("external-reviewer@example.com");
    expect(postReviewSentServer).toHaveBeenCalledWith("ag_review_roles");
    expect(markSimpleFlowSent).toHaveBeenCalledWith("ag_review_roles");
  });
});
