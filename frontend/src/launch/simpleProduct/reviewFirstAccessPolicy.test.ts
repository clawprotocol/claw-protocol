import { afterEach, describe, expect, it, vi } from "vitest";
import * as recipientAccessApi from "../../agreement/recipientAccessApi";
import { SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE } from "../../agreement/recipientAccessMintPayload";
import {
  clearReviewFirstAccessPolicyCache,
  fetchReviewFirstAccessPolicy,
  isReviewLinkMintEnabledFromPolicy,
  resolveReviewFirstMintPolicyGate,
} from "./reviewFirstAccessPolicy";
import { REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE } from "./reviewFirstSendSurface";

describe("reviewFirstAccessPolicy", () => {
  afterEach(() => {
    clearReviewFirstAccessPolicyCache();
    vi.restoreAllMocks();
  });

  it("isReviewLinkMintEnabledFromPolicy respects review_link_mint_enabled", () => {
    expect(
      isReviewLinkMintEnabledFromPolicy({
        recipient_link_token_required: false,
        mint_key_configured: false,
        signing_token_configured: false,
        review_link_mint_enabled: false,
      }),
    ).toBe(false);
    expect(
      isReviewLinkMintEnabledFromPolicy({
        recipient_link_token_required: false,
        mint_key_configured: false,
        signing_token_configured: true,
        review_link_mint_enabled: true,
      }),
    ).toBe(true);
  });

  it("resolveReviewFirstMintPolicyGate blocks mint when policy disables review links", async () => {
    vi.spyOn(recipientAccessApi, "fetchRecipientAccessPolicy").mockResolvedValue({
      recipient_link_token_required: false,
      mint_key_configured: false,
      signing_token_configured: false,
      review_link_mint_enabled: false,
      signing_token_env_var_detected: null,
    });
    const gate = await resolveReviewFirstMintPolicyGate({
      agreementId: "ag_policy_block",
      source: "test",
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.mintErrorCode).toBe(SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE);
      expect(gate.userMessage).toBe(REVIEW_FIRST_SIGNING_TOKEN_SECRET_USER_MESSAGE);
    }
  });

  it("resolveReviewFirstMintPolicyGate allows mint when policy enables review links", async () => {
    vi.spyOn(recipientAccessApi, "fetchRecipientAccessPolicy").mockResolvedValue({
      recipient_link_token_required: false,
      mint_key_configured: false,
      signing_token_configured: true,
      review_link_mint_enabled: true,
      signing_token_env_var_detected: "CLAW_AGREEMENT_SIGNING_TOKEN_SECRET",
    });
    const gate = await resolveReviewFirstMintPolicyGate({
      agreementId: "ag_policy_ok",
      source: "test",
    });
    expect(gate.ok).toBe(true);
  });

  it("fetchReviewFirstAccessPolicy caches policy for repeat calls", async () => {
    const spy = vi.spyOn(recipientAccessApi, "fetchRecipientAccessPolicy").mockResolvedValue({
      recipient_link_token_required: false,
      mint_key_configured: false,
      signing_token_configured: true,
      review_link_mint_enabled: true,
    });
    await fetchReviewFirstAccessPolicy();
    await fetchReviewFirstAccessPolicy();
    expect(spy).toHaveBeenCalledTimes(1);
    await fetchReviewFirstAccessPolicy({ forceRefresh: true });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
