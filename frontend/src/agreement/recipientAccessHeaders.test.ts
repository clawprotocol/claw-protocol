import { describe, expect, it } from "vitest";
import { recipientAgreementReadHeaders } from "./recipientAccessApi";

describe("recipientAgreementReadHeaders", () => {
  it("returns empty object when explicit token is missing (no session fallback)", () => {
    expect(recipientAgreementReadHeaders("ag_1", "")).toEqual({});
    expect(recipientAgreementReadHeaders("ag_1", null)).toEqual({});
    expect(recipientAgreementReadHeaders("ag_1", "   ")).toEqual({});
  });

  it("sets X-Claw-Recipient-Access-Token from explicit token only", () => {
    expect(recipientAgreementReadHeaders("ag_1", "secret-token")).toEqual({
      "X-Claw-Recipient-Access-Token": "secret-token",
    });
  });
});
