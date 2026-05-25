import { describe, expect, it } from "vitest";
import {
  resolveRecipientAccessMintFailureMessage,
  SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE,
  SIGNING_TOKEN_SECRET_NOT_CONFIGURED_USER_MESSAGE,
} from "./recipientAccessMintPayload";

describe("resolveRecipientAccessMintFailureMessage", () => {
  it("returns actionable copy for signing_token_secret_not_configured", () => {
    const msg = resolveRecipientAccessMintFailureMessage({
      status: 422,
      code: SIGNING_TOKEN_SECRET_NOT_CONFIGURED_CODE,
    });
    expect(msg).toBe(SIGNING_TOKEN_SECRET_NOT_CONFIGURED_USER_MESSAGE);
    expect(msg).toContain("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET");
    expect(msg).not.toMatch(/token=[A-Za-z0-9_-]{8,}/);
  });
});
