import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CreateUiStage } from "./createUiStage";
import {
  buildCommitFreeDraftForReviewPatch,
  resolveIsFreeStreamlineDraftReview,
} from "./freeStreamlineDraftReview";

describe("resolveIsFreeStreamlineDraftReview", () => {
  const base = {
    simpleProductFlow: true,
    liveWorkspaceTwoPane: true,
    createProductionTwoPane: true,
    createUiStage: CreateUiStage.DRAFT,
    createFlowPhase: "draft_ready_for_review" as const,
    hasDraft: true,
    paidProAuthoritative: false,
    premiumPaidDocumentSurface: false,
    premiumPersistedFlowActive: false,
    premiumSendPathUnlocked: false,
    hasPaidPremiumCompletionSession: () => false,
    showUpgradeToFullDraftOnReview: false,
  };

  it("is true for free DRAFT review on simple create two-pane", () => {
    expect(resolveIsFreeStreamlineDraftReview(base)).toBe(true);
  });

  it("is false for paid Pro surfaces", () => {
    expect(resolveIsFreeStreamlineDraftReview({ ...base, paidProAuthoritative: true })).toBe(false);
    expect(resolveIsFreeStreamlineDraftReview({ ...base, premiumPaidDocumentSurface: true })).toBe(false);
  });

  it("is false outside DRAFT stage", () => {
    expect(
      resolveIsFreeStreamlineDraftReview({ ...base, createUiStage: CreateUiStage.RECIPIENTS }),
    ).toBe(false);
  });
});

describe("free streamline draft review wiring (static)", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("uses commitFreeDraftForReview and isFreeStreamlineDraftReview", () => {
    expect(intake).toContain("commitFreeDraftForReview");
    expect(intake).toContain("isFreeStreamlineDraftReview");
    expect(intake).toContain("logFreeReviewSurfaceResolved");
    expect(intake).toContain("logFreeReviewLegacySurfaceBlocked");
    expect(intake).toContain("logFreeReviewApiLateMerge");
  });

  it("renders StarterDraftDocumentSurface from isFreeStreamlineDraftReview", () => {
    expect(intake).toContain("isFreeStreamlineDraftReview");
    expect(intake).toContain("useStarterDocumentPaperSurface");
    expect(intake).toContain("StarterDraftDocumentSurface");
  });

  it("normalizes free hydrate through commitFreeDraftForReview (no intake flash)", () => {
    expect(intake).toContain("freeNonProHydrate");
    expect(intake).toContain('source: displayPhaseRef.current === "review" ? "api_late_merge" : "api_hydrate"');
    expect(intake).not.toMatch(
      /setDisplayPhase\(nextDisplayAfterPersist\)[\s\S]{0,120}commitFreeDraftForReview/,
    );
  });

  it("uses polished AHA headings whenever isFreeStreamlineDraftReview", () => {
    expect(intake).toContain("STARTER_REVIEW_HEADLINE");
    expect(intake).toContain("isFreeStreamlineDraftReview ? (");
    expect(intake).toContain("STARTER_REVIEW_SUBLINE");
    expect(intake).toContain("STARTER_REVIEW_HELPER");
  });

  it("blocks duplicate sticky Continue with Pro when free streamline review is active", () => {
    expect(intake).toContain("hideStickyForStarterProContinuation");
    expect(intake).toContain("isFreeStreamlineDraftReview");
    expect(intake).toContain("freeTrackBlocksRecipientAdvance");
  });

  it("commit patch normalizes review display phase", () => {
    expect(buildCommitFreeDraftForReviewPatch().displayPhase).toBe("review");
    expect(buildCommitFreeDraftForReviewPatch().createFlowPhase).toBe("draft_ready_for_review");
  });
});
