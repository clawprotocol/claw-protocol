/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCreateReviewAgreementResumeId,
  clearCreateReviewDraftReadyMarker,
  readCreateReviewDraftReadyMarker,
  writeCreateReviewAgreementResumeId,
  writeCreateReviewDraftReadyMarker,
} from "./agreementIntakeStorage";
import { persistStarterReviewBeforeCheckout } from "./checkoutBackRestore";
import {
  logReviewRefreshRegenerationSkipped,
  shouldSkipHomeAutoGenerateForStoredReview,
} from "./createReviewRefreshRestore";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

describe("createReviewRefreshRestore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCreateReviewAgreementResumeId();
    clearCreateReviewDraftReadyMarker();
    sessionStorage.removeItem("claw_checkout_back_starter_review_v1");
  });

  it("skips home auto-generate when draft-ready marker exists", () => {
    writeCreateReviewDraftReadyMarker();
    expect(readCreateReviewDraftReadyMarker()).toBe(true);
    expect(shouldSkipHomeAutoGenerateForStoredReview()).toBe(true);
    expect(console.info).toHaveBeenCalledWith("[review-refresh-regeneration-skipped]", {
      reason: "stored_draft_ready_marker",
    });
  });

  it("skips home auto-generate when agreement resume id exists", () => {
    writeCreateReviewAgreementResumeId("agr-test-123");
    expect(shouldSkipHomeAutoGenerateForStoredReview()).toBe(true);
    expect(console.info).toHaveBeenCalledWith("[review-refresh-regeneration-skipped]", {
      reason: "stored_agreement_resume_id",
    });
  });

  it("does not skip when no stored review state", () => {
    expect(shouldSkipHomeAutoGenerateForStoredReview()).toBe(false);
  });

  it("skips home auto-generate when checkout-back snapshot exists", () => {
    const draft: ParsedDraftShape = {
      title: "NDA",
      jurisdiction: "NY",
      parties: [
        { name: "A", role: "party" },
        { name: "B", role: "party" },
      ],
      purpose: "Mutual confidentiality",
      payment_terms: "N/A",
      payment: { amount: null, cadence: null, valid: false },
      duration: null,
      due_date: null,
      effective_date: null,
      additional_terms: null,
    };
    persistStarterReviewBeforeCheckout({ intakeText: "Mutual NDA between A and B.", draft });
    expect(shouldSkipHomeAutoGenerateForStoredReview()).toBe(true);
  });

  it("logs regeneration skipped with reason", () => {
    logReviewRefreshRegenerationSkipped("draft_already_ready");
    expect(console.info).toHaveBeenCalledWith("[review-refresh-regeneration-skipped]", {
      reason: "draft_already_ready",
    });
  });
});
