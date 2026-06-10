import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { patchAgreementField, postReviewSentServer } from "../../agreement/agreementWorkspaceApi";
import {
  executePaidProPostRecipientSetupHandoff,
  maybePostReviewSentAfterReviewFirstHandoff,
} from "./paidProPostRecipientSetupHandoff";
import * as reviewDeliveryOwnerRouting from "./reviewDeliveryOwnerRouting";
import {
  mintSimpleDoneReviewRecipientLinkRows,
  reviewLinkMintHasUsableUrls,
} from "./simpleDoneReviewRecipientLinks";
import { resolveReviewFirstMintPolicyGate } from "./reviewFirstAccessPolicy";
import {
  clearReviewFirstMintInFlight,
  peekReviewFirstMintInFlight,
  setReviewFirstMintInFlight,
} from "./reviewFirstSendSurface";
import { markSimpleFlowSent } from "../simpleFlowSent";

vi.mock("../../agreement/agreementWorkspaceApi", () => ({
  postReviewSentServer: vi.fn(async () => true),
  patchAgreementField: vi.fn(async () => true),
}));

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
  });

  it("executePaidProPostRecipientSetupHandoff calls postReviewSentServer exactly once after mint", async () => {
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
    if (result.ok) expect(result.destination).toBe("done");
    expect(mintSimpleDoneReviewRecipientLinkRows).toHaveBeenCalledTimes(1);
    expect(postReviewSentServer).toHaveBeenCalledTimes(1);
    expect(postReviewSentServer).toHaveBeenCalledWith("ag_review_1");
    expect(markSimpleFlowSent).toHaveBeenCalledWith("ag_review_1");
    expect(navigate).toHaveBeenCalledWith("/app/done/ag_review_1");
    expect(setReviewFirstMintInFlight).toHaveBeenCalledWith("ag_review_1");
    expect(clearReviewFirstMintInFlight).toHaveBeenCalled();
  });

  it("routes owner to dashboard when email delivery mode is active", async () => {
    const routingSpy = vi
      .spyOn(reviewDeliveryOwnerRouting, "resolveOwnerPostReviewSendPath")
      .mockReturnValue("/app");
    const navigate = vi.fn();
    const result = await executePaidProPostRecipientSetupHandoff({
      navigate,
      agreementId: "ag_review_email",
      draft: baseDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    expect(routingSpy).toHaveBeenCalledWith("ag_review_email");
    expect(navigate).toHaveBeenCalledWith("/app");
    routingSpy.mockRestore();
  });

  it("maybePostReviewSentAfterReviewFirstHandoff skips when review_sent_at already set", async () => {
    await maybePostReviewSentAfterReviewFirstHandoff(
      "ag_review_2",
      { ...baseDraft, review_sent_at: "2026-06-01T00:00:00.000Z" },
      "test",
    );
    expect(postReviewSentServer).not.toHaveBeenCalled();
  });

  it("maybePostReviewSentAfterReviewFirstHandoff posts when review_sent_at is unset", async () => {
    await maybePostReviewSentAfterReviewFirstHandoff("ag_review_3", baseDraft, "test");
    expect(postReviewSentServer).toHaveBeenCalledTimes(1);
    expect(postReviewSentServer).toHaveBeenCalledWith("ag_review_3");
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

    const result = await executePaidProPostRecipientSetupHandoff({
      navigate: vi.fn(),
      agreementId: "ag_review_roles",
      draft: paidProDraft,
      premiumSendIntent: "review",
      logSource: "simple_pro_send_for_review",
    });

    expect(result.ok).toBe(true);
    expect(patchAgreementField).toHaveBeenCalledTimes(1);
    expect(patchAgreementField).toHaveBeenCalledWith(
      "ag_review_roles",
      "parties",
      expect.arrayContaining([
        expect.objectContaining({ id: "p_client", role: "owner" }),
        expect.objectContaining({ id: "p_provider", role: "reviewer" }),
      ]),
    );
    expect(postReviewSentServer).toHaveBeenCalledWith("ag_review_roles");
  });
});
