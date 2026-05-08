import { describe, expect, it } from "vitest";
import {
  RECIPIENT_LANDING_INTRO_ONE_LINE,
  RECIPIENT_PUBLIC_HERO_SUBTITLE,
  RECIPIENT_PUBLIC_HERO_TITLE,
  RECIPIENT_REVIEW_TRUST_NOTHING_CHANGES,
  RECIPIENT_REVIEW_TRUST_SECURE_ESIGN,
} from "./recipientReviewTrustCopy";

describe("recipientReviewTrustCopy hero + trust chips", () => {
  it("uses compact recipient-facing hero strings", () => {
    expect(RECIPIENT_PUBLIC_HERO_TITLE).toBe("Review agreement");
    expect(RECIPIENT_PUBLIC_HERO_SUBTITLE).toBe("Read it, request edits, or approve it.");
    expect(RECIPIENT_LANDING_INTRO_ONE_LINE).toContain("Nothing changes until accepted");
  });

  it("limits trust strip to secure signing and acceptance line", () => {
    expect(RECIPIENT_REVIEW_TRUST_SECURE_ESIGN).toBe("Secure e-signing");
    expect(RECIPIENT_REVIEW_TRUST_NOTHING_CHANGES).toBe("Nothing changes until accepted");
  });
});
