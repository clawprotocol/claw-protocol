/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordPaidProReviewRender } from "../components/agreements/paidProReviewStability";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth } from "../components/agreements/paidProSourceOfTruth";
import {
  PREMIUM_PRO_REVIEW_SCROLL_ANCHOR_ID,
  resetPremiumReviewScrollResetConsumedForTests,
  resetPremiumReviewScrollToTop,
} from "./premiumPostCheckoutReturnUx";

const FREEZE_BODY = [
  "CONSULTING AGREEMENT",
  "",
  ...Array.from({ length: 30 }, (_, i) => `Section ${i + 1}. Text ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF",
  "",
  "CLIENT:\nAcme\nName:\nTitle:",
  "",
  "SERVICE PROVIDER:\nBeta\nName:\nTitle:",
].join("\n");

describe("resetPremiumReviewScrollToTop", () => {
  beforeEach(() => {
    resetPremiumReviewScrollResetConsumedForTests();
    document.body.innerHTML = "";
    vi.spyOn(console, "info").mockImplementation(() => {});
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
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

  it("preserves scroll when review mounted and corpus transition is signer_metadata_only", async () => {
    clearPaidProSourceOfTruth();
    establishPaidProSourceOfTruth({ text: FREEZE_BODY, source: "server_full_draft" });
    resetPremiumReviewScrollResetConsumedForTests();
    recordPaidProReviewRender(FREEZE_BODY);
    const signerHydrated = FREEZE_BODY.replace("Name:", "Name: Jane Client");
    resetPremiumReviewScrollToTop({
      reason: "payment_success_authoritative_apply",
      afterPlain: signerHydrated,
    });
    await new Promise<void>((r) => {
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });
    expect(console.info).toHaveBeenCalledWith("[premium-review-scroll-reset]", {
      reason: "payment_success_authoritative_apply",
      applied: false,
      preserveScroll: true,
      corpusTransitionClassification: "signer_metadata_only",
      corpusHashUnchanged: false,
    });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("ignores force on payment_success after first apply", async () => {
    resetPremiumReviewScrollResetConsumedForTests();
    resetPremiumReviewScrollToTop({ reason: "payment_success_authoritative_apply" });
    await new Promise<void>((r) => {
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });
    resetPremiumReviewScrollToTop({ reason: "payment_success_authoritative_apply", force: true });
    await new Promise<void>((r) => {
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });
    const applied = (console.info as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === "[premium-review-scroll-reset]" && c[1]?.applied === true,
    );
    expect(applied).toHaveLength(1);
  });
});
