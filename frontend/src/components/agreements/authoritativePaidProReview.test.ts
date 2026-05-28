import { afterEach, describe, expect, it } from "vitest";
import {
  hasAcceptedPaidProAuthority,
  isAuthoritativePaidProReview,
  PAID_PRO_REVIEW_BADGE,
  PAID_PRO_REVIEW_CHIP_STATE,
  PAID_PRO_REVIEW_CHIP_VERSION,
  PAID_PRO_REVIEW_SHELL_TITLE,
  paidProAuthorityBlocksStarterReviewRestore,
  resolveAuthoritativePaidProReviewPlain,
  resolvePaidProAcceptanceRoutingMarkers,
  starterPlainLooksStaleVersusPaidAuthority,
} from "./authoritativePaidProReview";
import { shouldRestoreStoredCreateReviewDraftSnapshot } from "./createReviewRefreshRestore";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import { resolveFreeStarterReviewShellActive, resolveReviewShellChrome } from "./freeStarterReviewShell";
import { resolveIsFreeStreamlineDraftReview } from "./freeStreamlineDraftReview";
import { CreateUiStage } from "./createUiStage";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { CHIP_STATE_INITIAL_READY, CHIP_VERSION_STARTER } from "./draftPreviewLabels";

const PAID_BODY = `PRO AGREEMENT BODY. ${"Section with substantive terms. ".repeat(120)}`;

describe("authoritativePaidProReview", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("isAuthoritativePaidProReview is true after establishPaidProSourceOfTruth", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(isAuthoritativePaidProReview()).toBe(true);
    expect(resolveAuthoritativePaidProReviewPlain().length).toBeGreaterThan(1500);
  });

  it("review and display surfaces read the same paid corpus", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const review = getPaidProDocumentForSurface("review");
    const display = getPaidProDocumentForSurface("display");
    expect(review?.text).toBe(PAID_BODY.trim());
    expect(display?.text).toBe(PAID_BODY.trim());
  });

  it("starterPlainLooksStaleVersusPaidAuthority detects short starter vs paid", () => {
    const starter = "Short starter draft.".repeat(20);
    expect(starterPlainLooksStaleVersusPaidAuthority(starter, PAID_BODY)).toBe(true);
    expect(starterPlainLooksStaleVersusPaidAuthority(PAID_BODY, PAID_BODY)).toBe(false);
  });

  it("free starter shell is blocked when SoT exists even if streamline flag would be true", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(
      resolveFreeStarterReviewShellActive({
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
        paidProAuthoritative: false,
      }),
    ).toBe(false);
    const chrome = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: true,
      isFreeStarterReviewSurface: true,
      premiumPaidDocumentSurface: false,
      paidProAuthoritative: false,
      paidProReviewReadyBase: true,
      guidedCompletionActive: false,
    });
    expect(chrome.title).toBe(PAID_PRO_REVIEW_SHELL_TITLE);
    expect(chrome.badge).toBe(PAID_PRO_REVIEW_BADGE);
    expect(chrome.paidProReviewReady).toBe(true);
    expect(chrome.title).not.toContain("Starter");
  });

  it("resolveIsFreeStreamlineDraftReview is false when SoT exists", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(
      resolveIsFreeStreamlineDraftReview({
        simpleProductFlow: true,
        liveWorkspaceTwoPane: true,
        createProductionTwoPane: true,
        createUiStage: CreateUiStage.DRAFT,
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        paidProAuthoritative: false,
        premiumPaidDocumentSurface: false,
        premiumPersistedFlowActive: false,
        premiumSendPathUnlocked: false,
        hasPaidPremiumCompletionSession: () => false,
        showUpgradeToFullDraftOnReview: false,
      }),
    ).toBe(false);
  });

  it("resolveSimpleProFinalReviewCorpus prefers SoT over rendered starter preview", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const starterPreview = "Starter only.".repeat(40);
    const resolved = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      renderedPreviewPlain: starterPreview,
      pickerPlain: starterPreview,
      agreementDocumentPlain: starterPreview,
      finalReviewAuthorityOnly: true,
    });
    expect(resolved.plainText).toBe(PAID_BODY.trim());
    expect(resolved.plainText).not.toContain("Starter only");
  });

  it("stored draft restore is blocked when paid authority exists", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(paidProAuthorityBlocksStarterReviewRestore()).toBe(true);
    expect(shouldRestoreStoredCreateReviewDraftSnapshot()).toBe(false);
  });

  it("hasAcceptedPaidProAuthority for long server acceptance", () => {
    const body = "x".repeat(16_000);
    establishPaidProSourceOfTruth({ text: body, source: "server_full_draft" });
    expect(hasAcceptedPaidProAuthority()).toBe(true);
    expect(
      resolvePaidProAcceptanceRoutingMarkers({
        premiumRenderSource: "server_full_draft",
        acceptedBodyLen: body.length,
      }).suppressGuidedQuestionPanel,
    ).toBe(true);
  });

  it("exports paid review chip labels distinct from starter", () => {
    expect(PAID_PRO_REVIEW_CHIP_VERSION).not.toBe(CHIP_VERSION_STARTER);
    expect(PAID_PRO_REVIEW_CHIP_STATE).not.toBe(CHIP_STATE_INITIAL_READY);
    expect(PAID_PRO_REVIEW_CHIP_VERSION.toLowerCase()).toContain("pro");
  });
});
