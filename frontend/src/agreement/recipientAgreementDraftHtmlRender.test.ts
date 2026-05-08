import { describe, expect, it } from "vitest";
import { purposeLooksLikeFullAgreementTextForRender } from "./recipientAgreementDraftHtmlRender";

describe("purposeLooksLikeFullAgreementTextForRender", () => {
  it("matches backend long-body threshold", () => {
    expect(purposeLooksLikeFullAgreementTextForRender("x".repeat(2399))).toBe(false);
    expect(purposeLooksLikeFullAgreementTextForRender("x".repeat(2400))).toBe(true);
  });
});
