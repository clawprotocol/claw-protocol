/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearCreateReviewAgreementResumeId,
  clearCreateReviewAgreementResumeIdOnly,
  readCreateReviewAgreementResumeId,
  readCreateReviewDraftReadyMarker,
  writeCreateReviewAgreementResumeId,
  writeCreateReviewDraftReadyMarker,
} from "./agreementIntakeStorage";

describe("agreementIntakeStorage create review markers", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    clearCreateReviewAgreementResumeId();
  });

  it("clearCreateReviewAgreementResumeIdOnly keeps draft-ready marker", () => {
    writeCreateReviewAgreementResumeId("agr-123");
    writeCreateReviewDraftReadyMarker();
    clearCreateReviewAgreementResumeIdOnly();
    expect(readCreateReviewAgreementResumeId()).toBeNull();
    expect(readCreateReviewDraftReadyMarker()).toBe(true);
  });

  it("clearCreateReviewAgreementResumeId clears draft-ready marker", () => {
    writeCreateReviewDraftReadyMarker();
    clearCreateReviewAgreementResumeId();
    expect(readCreateReviewDraftReadyMarker()).toBe(false);
  });
});
