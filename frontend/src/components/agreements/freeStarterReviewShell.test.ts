import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FREE_STARTER_REVIEW_SUBTITLE,
  FREE_STARTER_REVIEW_TITLE,
  resolveFreeStarterReviewShellActive,
  resolveReviewShellChrome,
  shouldGateGuidedRenderAuthorityForFreeReview,
} from "./freeStarterReviewShell";

describe("resolveFreeStarterReviewShellActive", () => {
  it("is true for free streamline review", () => {
    expect(
      resolveFreeStarterReviewShellActive({
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
        paidProAuthoritative: false,
      }),
    ).toBe(true);
  });

  it("is false when paid Pro surface is active", () => {
    expect(
      resolveFreeStarterReviewShellActive({
        isFreeStreamlineDraftReview: false,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: true,
        paidProAuthoritative: false,
      }),
    ).toBe(false);
  });
});

describe("resolveReviewShellChrome", () => {
  it("home_create_submit starter_review uses free title not Pro", () => {
    const chrome = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: true,
      isFreeStarterReviewSurface: true,
      premiumPaidDocumentSurface: false,
      paidProAuthoritative: true,
      paidProReviewReadyBase: true,
      guidedCompletionActive: false,
    });
    expect(chrome.title).toBe(FREE_STARTER_REVIEW_TITLE);
    expect(chrome.title).not.toContain("Pro agreement");
    expect(chrome.subtitle).toBe(FREE_STARTER_REVIEW_SUBTITLE);
    expect(chrome.paidProReviewReady).toBe(false);
    expect(chrome.blockPaidProShell).toBe(true);
  });

  it("paid pro review keeps Pro shell when not free", () => {
    const chrome = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: false,
      isFreeStarterReviewSurface: false,
      premiumPaidDocumentSurface: true,
      paidProAuthoritative: true,
      paidProReviewReadyBase: true,
      guidedCompletionActive: true,
    });
    expect(chrome.title).toBe("Review your Pro agreement");
    expect(chrome.paidProReviewReady).toBe(true);
  });
});

describe("shouldGateGuidedRenderAuthorityForFreeReview", () => {
  it("gates guided authority on free starter surfaces", () => {
    expect(
      shouldGateGuidedRenderAuthorityForFreeReview({
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
      }),
    ).toBe(true);
  });
});

describe("AgreementBuilderIntake free starter shell wiring", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("gates paidProReviewReady and guided authority for free starter", () => {
    expect(intake).toContain("resolveFreeStarterReviewShellActive");
    expect(intake).toContain("resolveReviewShellChrome");
    expect(intake).toContain("resetStalePaidReviewShellForFreeStarter");
    expect(intake).toContain("shouldGateGuidedRenderAuthorityForFreeReview");
    expect(intake).toContain("FREE_STARTER_REVIEW_TITLE");
    expect(intake).toContain("logFreeReviewPaidShellBlocked");
  });

  it("does not show Pro agreement title on free streamline headings", () => {
    expect(intake).toContain("isFreeStreamlineDraftReview ? (");
    expect(intake).toContain("STARTER_REVIEW_HEADLINE");
    expect(intake).not.toMatch(
      /isFreeStreamlineDraftReview\s*\?[\s\S]{0,200}SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE/,
    );
  });
});
