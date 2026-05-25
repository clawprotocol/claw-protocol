import { describe, expect, it } from "vitest";
import {
  buildRecipientAccessMintBody,
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

describe("buildRecipientAccessMintBody", () => {
  it("includes review-first final corpus only for review mint payloads", () => {
    const body = buildRecipientAccessMintBody({
      mode: "review",
      role: "reviewer",
      review_first_document_text: "FINAL_GUIDED_REVIEW_CORPUS_MARKER",
      review_first_document_source: "review_first_pinned_corpus",
    });
    expect(body.review_first_document_text).toBe("FINAL_GUIDED_REVIEW_CORPUS_MARKER");
    expect(body.review_first_document_source).toBe("review_first_pinned_corpus");

    const signBody = buildRecipientAccessMintBody({
      mode: "sign",
      role: "signer",
      review_first_document_text: "FINAL_GUIDED_REVIEW_CORPUS_MARKER",
    });
    expect(signBody).not.toHaveProperty("review_first_document_text");
  });
});
