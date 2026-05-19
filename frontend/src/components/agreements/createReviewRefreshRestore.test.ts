/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCreateReviewAgreementResumeId,
  clearCreateReviewDraftReadyMarker,
  readCreateReviewDraftReadyMarker,
  writeCreateReviewAgreementResumeId,
  writeCreateReviewDraftReadyMarker,
} from "./agreementIntakeStorage";
import {
  logReviewRefreshRegenerationSkipped,
  shouldSkipHomeAutoGenerateForStoredReview,
} from "./createReviewRefreshRestore";

describe("createReviewRefreshRestore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCreateReviewAgreementResumeId();
    clearCreateReviewDraftReadyMarker();
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

  it("logs regeneration skipped with reason", () => {
    logReviewRefreshRegenerationSkipped("draft_already_ready");
    expect(console.info).toHaveBeenCalledWith("[review-refresh-regeneration-skipped]", {
      reason: "draft_already_ready",
    });
  });
});
