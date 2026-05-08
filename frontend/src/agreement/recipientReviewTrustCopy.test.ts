import { describe, expect, it } from "vitest";
import {
  RECIPIENT_LANDING_INTRO_ONE_LINE,
  RECIPIENT_PUBLIC_HERO_SUBTITLE,
  RECIPIENT_PUBLIC_HERO_TITLE,
  RECIPIENT_REVIEW_TRUST_NOTHING_CHANGES,
} from "./recipientReviewTrustCopy";

describe("recipientReviewTrustCopy hero + trust chips", () => {
  it("uses compact recipient-facing hero strings", () => {
    expect(RECIPIENT_PUBLIC_HERO_TITLE).toBe("Review agreement");
    expect(RECIPIENT_PUBLIC_HERO_SUBTITLE).toBe(
      "Read the draft. Nothing changes until you choose what to send.",
    );
    expect(RECIPIENT_LANDING_INTRO_ONE_LINE).toBe(RECIPIENT_PUBLIC_HERO_SUBTITLE);
  });

  it("uses a single trust chip line for acceptance", () => {
    expect(RECIPIENT_REVIEW_TRUST_NOTHING_CHANGES).toBe("Nothing changes until accepted.");
  });
});
