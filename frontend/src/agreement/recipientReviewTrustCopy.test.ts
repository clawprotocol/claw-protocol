import { describe, expect, it } from "vitest";
import {
  RECIPIENT_SIGN_FULLY_EXECUTED_HEADLINE,
  RECIPIENT_SIGN_ONE_DONE_HEADLINE,
  RECIPIENT_SIGN_RECORD_SUBLINE,
} from "./recipientReviewTrustCopy";

describe("recipientReviewTrustCopy", () => {
  it("avoids protocol / chain jargon and CLAW branding", () => {
    const blob = [
      RECIPIENT_SIGN_FULLY_EXECUTED_HEADLINE,
      RECIPIENT_SIGN_ONE_DONE_HEADLINE,
      RECIPIENT_SIGN_RECORD_SUBLINE,
    ].join(" ");
    const u = blob.toUpperCase();
    expect(u).not.toContain("CLAW");
    expect(u).not.toContain("BLOCKCHAIN");
    expect(u).not.toContain("ATTESTATION");
    expect(u).not.toContain("ANCHORING");
    expect(u).not.toContain("IMMUTABLE");
    expect(u).not.toContain("CANONICAL");
    expect(u).not.toContain("VERIFY");
    expect(u).not.toContain("PROOF");
  });
});
