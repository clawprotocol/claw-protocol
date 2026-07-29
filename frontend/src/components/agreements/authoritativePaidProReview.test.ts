/** @vitest-environment jsdom */
import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  resolvePaidProFinalReviewVisiblePlain,
  suppressPaidProFinalReviewFinalizingState,
  starterPlainLooksStaleVersusPaidAuthority,
} from "./authoritativePaidProReview";
import { shouldRestoreStoredCreateReviewDraftSnapshot } from "./createReviewRefreshRestore";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { resetPaidProReviewSignerMetadataSessionActiveForTests } from "./paidProReviewRenderSessionGate";
import { resolveFreeStarterReviewShellActive, resolveReviewShellChrome } from "./freeStarterReviewShell";
import { resolveIsFreeStreamlineDraftReview } from "./freeStreamlineDraftReview";
import { CreateUiStage } from "./createUiStage";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { CHIP_STATE_INITIAL_READY, CHIP_VERSION_STARTER } from "./draftPreviewLabels";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

/** Substantive wire that remains >10k after tip prepare/establish normalize. */
const PAID_BODY = expandOperativeCorpusWithUniqueSupplements(
  SHARED_ACCEPTED_PAID_BODY,
  SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 1600,
);

describe("authoritativePaidProReview", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    resetPaidProReviewSignerMetadataSessionActiveForTests();
    resetPaidProPipelineTestIsolation();
  });

  it("isAuthoritativePaidProReview is true after establishPaidProSourceOfTruth", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(isAuthoritativePaidProReview()).toBe(true);
    expect(resolveAuthoritativePaidProReviewPlain().length).toBeGreaterThan(1500);
  });

  it("review and display surfaces read the same paid corpus", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const review = getPaidProDocumentForSurface("review");
    const display = getPaidProDocumentForSurface("display");
    // Compare against prepared/established SoT bytes (not obsolete raw fixture whitespace).
    expect(review?.text).toBe(record.text);
    expect(display?.text).toBe(record.text);
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
      paidProAuthoritative: true,
      paidProReviewReadyBase: true,
      guidedCompletionActive: false,
      simpleProductFlow: true,
      liveWorkspaceTwoPane: true,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: "review",
      createFlowPhase: "draft_ready_for_review",
    });
    expect(chrome.title).toBe(PAID_PRO_REVIEW_SHELL_TITLE);
    expect(chrome.badge).toBe(PAID_PRO_REVIEW_BADGE);
    expect(chrome.paidProReviewReady).toBe(true);
    expect(chrome.paidProReviewContentReady).toBe(true);
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
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const starterPreview = "Starter only.".repeat(40);
    const resolved = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      renderedPreviewPlain: starterPreview,
      pickerPlain: starterPreview,
      agreementDocumentPlain: starterPreview,
      finalReviewAuthorityOnly: true,
    });
    expect(resolved.plainText).toBe(record.text);
    expect(resolved.plainText).not.toContain("Starter only");
  });

  it("stored draft restore is blocked when paid authority exists", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(paidProAuthorityBlocksStarterReviewRestore()).toBe(true);
    expect(shouldRestoreStoredCreateReviewDraftSnapshot()).toBe(false);
  });

  it("hasAcceptedPaidProAuthority for long server acceptance", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(record.text.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(hasAcceptedPaidProAuthority()).toBe(true);
    expect(
      resolvePaidProAcceptanceRoutingMarkers({
        premiumRenderSource: "server_full_draft",
        acceptedBodyLen: record.text.length,
      }).suppressGuidedQuestionPanel,
    ).toBe(true);
  });

  it("resolvePaidProFinalReviewVisiblePlain uses SoT when boundary is empty", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    const visible = resolvePaidProFinalReviewVisiblePlain({
      boundaryPlain: "",
      displayCandidatePlain: "",
    });
    expect(visible.length).toBeGreaterThan(10_000);
    expect(visible).toBe(record.text);
  });

  it("resolvePaidProFinalReviewVisiblePlain uses SoT when stale preview is empty", () => {
    const record = establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(
      resolvePaidProFinalReviewVisiblePlain({
        boundaryPlain: "",
        displayCandidatePlain: "",
      }),
    ).toBe(getPaidProSourceOfTruthText());
    expect(record.text.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
  });

  it("suppressPaidProFinalReviewFinalizingState when paid authority exists", () => {
    establishPaidProSourceOfTruth({ text: PAID_BODY, source: "server_full_draft" });
    expect(suppressPaidProFinalReviewFinalizingState()).toBe(true);
  });

  it("resolveAuthoritativePaidProReviewPlain hydrates signature notice fields when authority exists", () => {
    const body = [
      "MUTUAL CONSULTING AGREEMENT",
      "",
      'This Mutual Consulting and Implementation Agreement ("Agreement") is This Agreement is between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").execution by both parties.',
      "",
      ...Array.from({ length: 30 }, (_, i) => `Clause ${i + 1}.`),
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "Blue Canyon Analytics LLC",
      "Name: _________________________",
      "Date: May 30, 2026",
      "",
      "SERVICE PROVIDER:",
      "Iron Vale Systems Inc.",
      "Name: _________________________",
      "Date: May 30, 2026",
    ].join("\n");
    establishPaidProSourceOfTruth({ text: body, source: "server_full_draft" });
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: "Blue Canyon Analytics LLC",
      recipient2Name: "Iron Vale Systems Inc.",
      recipient1Email: "anthemhayek@gmail.com",
      recipient2Email: "irenev34@gmail.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem H Blanchard", "Irene Vail"],
      partySignerTitles: ["Member", "Manager"],
      partyAddresses: [
        "1027 S. Rainbow Blvd., #124, Las Vegas, NV 89132",
        "149 First St., Smithville, AR 75023",
      ],
    });
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: body,
      authority,
      intakeRaw: "",
      surface: "authoritative_paid_pro_review_test",
      repairRecital: true,
    });
    expect(hydrated.rejected).toBe(false);
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
    const plain = resolveAuthoritativePaidProReviewPlain();
    expect(plain).not.toMatch(/Email for Notice:/i);
    expect(plain).not.toMatch(/Email for Notice:/i);
    expect(plain).not.toMatch(/is This Agreement is between/i);
    expect(plain).not.toMatch(/Date:\s*May\s+30,\s*2026/i);
    expect(plain).not.toMatch(/Email for Notice:\s*_{4,}/i);
    const review = getPaidProDocumentForSurface("review");
    expect(review?.signerMetadataApplied).toBe(true);
    expect(review?.text).not.toMatch(/Email for Notice:/i);
  });

  it("exports paid review chip labels distinct from starter", () => {
    expect(PAID_PRO_REVIEW_CHIP_VERSION).not.toBe(CHIP_VERSION_STARTER);
    expect(PAID_PRO_REVIEW_CHIP_STATE).not.toBe(CHIP_STATE_INITIAL_READY);
    expect(PAID_PRO_REVIEW_CHIP_VERSION.toLowerCase()).toContain("draft");
    expect(PAID_PRO_REVIEW_CHIP_VERSION.toLowerCase()).not.toContain("pro");
  });
});
