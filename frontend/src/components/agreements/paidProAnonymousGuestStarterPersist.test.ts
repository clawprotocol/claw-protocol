/** @vitest-environment jsdom */
/**
 * P0: anonymous homepage Starter must persist exactly one guest draft.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCachedAccessToken, setCachedAccessToken } from "../../auth/authAccessTokenCache";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearHomeAnonymousCreateOrigin,
  markHomeAnonymousCreateOrigin,
} from "../../launch/homeAnonymousCreateOrigin";
import {
  shouldAutoPersistReviewAgreementRow,
  shouldPersistAnonymousGuestStarterDraft,
} from "./paidProCreateFlowRouting";
import {
  shouldHydrateStoredAgreementResumeId,
  shouldPreserveAnonymousGuestStarterResumeId,
  shouldSkipHomeAutoGenerateForStoredReview,
} from "./createReviewRefreshRestore";
import { writeCreateReviewAgreementResumeId } from "./agreementIntakeStorage";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionFreeStarterIntent,
} from "./paidProSessionEligibility";

describe("anonymous guest Starter persistence orchestration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearCachedAccessToken();
    clearCurrentSessionProEntitlementMarkers();
    clearHomeAnonymousCreateOrigin();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearCachedAccessToken();
    clearCurrentSessionProEntitlementMarkers();
    clearHomeAnonymousCreateOrigin();
  });

  it("CASE A — homepage guest Starter may persist once", () => {
    markHomeAnonymousCreateOrigin();
    markCurrentSessionFreeStarterIntent();
    expect(shouldPersistAnonymousGuestStarterDraft({ canSaveGuestDraft: true })).toBe(true);
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: false,
        canSaveGuestDraft: true,
      }),
    ).toBe(true);
  });

  it("CASE B — rerender after persist does not request a second draft", () => {
    markHomeAnonymousCreateOrigin();
    markCurrentSessionFreeStarterIntent();
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: true,
        skipFreeStarterCreateSubmit: false,
        canSaveGuestDraft: true,
      }),
    ).toBe(false);
  });

  it("CASE C — guest slot exhausted never claims a persist ID", () => {
    markHomeAnonymousCreateOrigin();
    markCurrentSessionFreeStarterIntent();
    expect(shouldPersistAnonymousGuestStarterDraft({ canSaveGuestDraft: false })).toBe(false);
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: false,
        canSaveGuestDraft: false,
      }),
    ).toBe(false);
  });

  it("does not persist for authenticated non-Pro free-starter sessions", () => {
    markHomeAnonymousCreateOrigin();
    markCurrentSessionFreeStarterIntent();
    setCachedAccessToken("test-access-token");
    expect(shouldPersistAnonymousGuestStarterDraft({ canSaveGuestDraft: true })).toBe(false);
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: false,
        canSaveGuestDraft: true,
      }),
    ).toBe(false);
  });

  it("keeps TEST490 free-starter block when homepage origin is absent", () => {
    markCurrentSessionFreeStarterIntent();
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: false,
      }),
    ).toBe(false);
  });

  it("reload keeps the persisted guest resume id and skips a second generate", () => {
    markHomeAnonymousCreateOrigin();
    markCurrentSessionFreeStarterIntent();
    writeCreateReviewAgreementResumeId("ef858902-0da3-4a81-8c9b-7558fb8a25df");
    expect(shouldPreserveAnonymousGuestStarterResumeId()).toBe(true);
    expect(shouldHydrateStoredAgreementResumeId({ freshHomeHeroHandoff: true })).toBe(true);
    expect(shouldSkipHomeAutoGenerateForStoredReview({ freshHomeHeroHandoff: true })).toBe(true);
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: true,
        skipFreeStarterCreateSubmit: false,
        canSaveGuestDraft: false,
      }),
    ).toBe(false);
  });
});
