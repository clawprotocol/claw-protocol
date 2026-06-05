/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  inferSingleNonOwnerPartyId,
  loadAnyRecipientMagicLinkSessionForAgreement,
  clearReviewFirstSubmitInflightProposalId,
  readReviewFirstSubmitInflightProposalId,
  resolveReviewFirstStageProposerId,
  resolveReviewerEffectiveAccessToken,
  resolveReviewerEffectiveParticipantId,
  reviewerNeedsPersonalizedLink,
  writeReviewFirstSubmitInflightProposalId,
} from "./reviewerTokenPersistence";
import { saveRecipientMagicLinkSession } from "./recipientMagicLinkSession";

describe("reviewerTokenPersistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("recovers token from session after URL query is stripped", () => {
    saveRecipientMagicLinkSession({
      agreementId: "ag_test",
      token: "tok_personal_abc",
      recipientPartyId: "party-2",
    });
    const resolved = resolveReviewerEffectiveAccessToken({
      agreementId: "ag_test",
      urlToken: "",
    });
    expect(resolved.token).toBe("tok_personal_abc");
    expect(resolved.source).toBe("session");
  });

  it("loadAnyRecipientMagicLinkSessionForAgreement returns scoped session row", () => {
    saveRecipientMagicLinkSession({
      agreementId: "ag_scope",
      token: "tok_scope",
      recipientPartyId: "p_scope",
    });
    const row = loadAnyRecipientMagicLinkSessionForAgreement("ag_scope");
    expect(row?.token).toBe("tok_scope");
    expect(row?.recipientPartyId).toBe("p_scope");
  });

  it("resolves participant id from session when prop is empty", () => {
    saveRecipientMagicLinkSession({
      agreementId: "ag_pid",
      token: "tok_pid",
      recipientPartyId: "party-from-session",
    });
    expect(
      resolveReviewerEffectiveParticipantId({
        agreementId: "ag_pid",
        participantPartyId: "",
        recipientAccessToken: "tok_pid",
      }),
    ).toBe("party-from-session");
  });

  it("personal token means submit-capable (not preview-only)", () => {
    expect(
      reviewerNeedsPersonalizedLink({
        entryKind: "review",
        partiesHaveIds: true,
        participantPid: "",
        recipientAccessToken: "tok_personal",
      }),
    ).toBe(false);
  });

  it("preview route without token requires personalized link", () => {
    expect(
      reviewerNeedsPersonalizedLink({
        entryKind: "review",
        partiesHaveIds: true,
        participantPid: "",
        recipientAccessToken: "",
      }),
    ).toBe(true);
  });

  it("Test280 infers single non-owner party when token present but pid missing", () => {
    expect(
      inferSingleNonOwnerPartyId([
        { id: "p-owner", role: "owner" },
        { id: "p-reviewer", role: "party" },
      ]),
    ).toBe("p-reviewer");
    const resolved = resolveReviewFirstStageProposerId({
      agreementId: "ag_infer",
      participantPartyId: "",
      recipientAccessToken: "tok_personal",
      draftParties: [
        { id: "p-owner", role: "owner" },
        { id: "p-reviewer", role: "party" },
      ],
    });
    expect(resolved.proposerId).toBe("p-reviewer");
    expect(resolved.source).toBe("single_non_owner_party");
  });

  it("Test282 persists in-flight proposal id across refresh", () => {
    writeReviewFirstSubmitInflightProposalId("ag_refresh", "prop-inflight-1");
    expect(readReviewFirstSubmitInflightProposalId("ag_refresh")).toBe("prop-inflight-1");
    clearReviewFirstSubmitInflightProposalId("ag_refresh");
    expect(readReviewFirstSubmitInflightProposalId("ag_refresh")).toBe("");
  });

  it("Test280 defers to backend when token present and proposer cannot be resolved locally", () => {
    const resolved = resolveReviewFirstStageProposerId({
      agreementId: "ag_defer",
      participantPartyId: "",
      recipientAccessToken: "tok_personal",
      draftParties: [
        { id: "p-owner", role: "owner" },
        { id: "p-a", role: "party" },
        { id: "p-b", role: "party" },
      ],
    });
    expect(resolved.proposerId).toBe("");
    expect(resolved.source).toBe("deferred_to_backend_token");
  });
});
