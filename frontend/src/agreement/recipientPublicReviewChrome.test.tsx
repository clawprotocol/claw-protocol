/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { RECIPIENT_APPROVED_LAWDOG_PROMO_LINE, resolveRecipientReviewHeaderAside } from "./recipientPublicReviewChrome";

describe("recipientPublicReviewChrome", () => {
  it("never renders account aside for public recipient or QA simulation", () => {
    expect(resolveRecipientReviewHeaderAside("public_recipient")).toBeNull();
    expect(resolveRecipientReviewHeaderAside("qa_recipient_simulation")).toBeNull();
  });

  it("promo line avoids account or billing language", () => {
    expect(RECIPIENT_APPROVED_LAWDOG_PROMO_LINE).toMatch(/Reviewed with LawDog/i);
    expect(RECIPIENT_APPROVED_LAWDOG_PROMO_LINE).not.toMatch(/account|billing|plan/i);
  });
});
