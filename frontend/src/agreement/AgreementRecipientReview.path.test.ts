import { describe, expect, it } from "vitest";
import { agreementMagicLinkPath, parseAgreementReviewPath } from "./AgreementRecipientReview";

describe("Agreement recipient review path parsing", () => {
  it("parses canonical review route without token", () => {
    expect(parseAgreementReviewPath("/agreements/ag_1/review", "")).toEqual({ agreementId: "ag_1" });
  });

  it("treats /app/agreements/:id as recipient route only with token", () => {
    expect(parseAgreementReviewPath("/app/agreements/ag_1", "")).toBeNull();
    expect(parseAgreementReviewPath("/app/agreements/ag_1", "?token=abc")).toEqual({
      agreementId: "ag_1",
      token: "abc",
    });
  });

  it("builds canonical recipient magic link path", () => {
    expect(agreementMagicLinkPath("ag_1", "tok_123")).toBe("/agreements/ag_1/review?t=tok_123");
  });
});
