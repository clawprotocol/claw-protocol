import { describe, expect, it } from "vitest";
import {
  RECIPIENT_LANDING_INTRO_ONE_LINE,
  RECIPIENT_PUBLIC_HERO_SUBTITLE,
  RECIPIENT_PUBLIC_HERO_TITLE,
  RECIPIENT_REVIEW_TRUST_NOTHING_CHANGES,
  formatRecipientInviterContextLine,
} from "./recipientReviewTrustCopy";

describe("recipientReviewTrustCopy hero + trust chips", () => {
  it("uses compact recipient-facing hero strings", () => {
    expect(RECIPIENT_PUBLIC_HERO_TITLE).toBe("Review agreement");
    expect(RECIPIENT_PUBLIC_HERO_SUBTITLE).toContain("Someone shared a draft");
    expect(RECIPIENT_LANDING_INTRO_ONE_LINE).toBe(RECIPIENT_PUBLIC_HERO_SUBTITLE);
  });

  it("uses a single trust chip line for acceptance", () => {
    expect(RECIPIENT_REVIEW_TRUST_NOTHING_CHANGES).toContain("accept or sign");
  });

  it("formats inviter context line", () => {
    expect(formatRecipientInviterContextLine("Acme LLC")).toBe(
      "From Acme LLC · review before anything is final",
    );
  });
});
