/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREMIUM_PRO_REVIEW_SCROLL_ANCHOR_ID,
  resetPremiumReviewScrollResetConsumedForTests,
  resetPremiumReviewScrollToTop,
} from "./premiumPostCheckoutReturnUx";

describe("resetPremiumReviewScrollToTop", () => {
  beforeEach(() => {
    resetPremiumReviewScrollResetConsumedForTests();
    document.body.innerHTML = "";
    vi.spyOn(console, "info").mockImplementation(() => {});
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls window to top and focuses review heading once", async () => {
    const heading = document.createElement("h1");
    heading.id = PREMIUM_PRO_REVIEW_SCROLL_ANCHOR_ID;
    heading.scrollIntoView = vi.fn();
    document.body.appendChild(heading);
    const focusSpy = vi.spyOn(heading, "focus");

    resetPremiumReviewScrollToTop({ reason: "payment_success_authoritative_apply" });
    await new Promise<void>((r) => {
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
    expect(focusSpy).toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith("[premium-review-scroll-reset]", {
      reason: "payment_success_authoritative_apply",
      applied: true,
    });

    resetPremiumReviewScrollToTop({ reason: "payment_success_authoritative_apply" });
    await new Promise<void>((r) => {
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });
    expect(console.info).toHaveBeenCalledWith("[premium-review-scroll-reset]", {
      reason: "payment_success_authoritative_apply",
      applied: false,
    });
  });
});
