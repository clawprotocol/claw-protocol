import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REVIEW_FIRST_SIMPLE_PRO_SOURCE = "simple_pro_send_for_review";

describe("SimpleProFinalReviewScreen review-first routing (static)", () => {
  it("AgreementBuilderIntake handleProSendForReview calls completeGuidedPaidProReviewFirstHandoff not enterFinalReviewRecipientSetup", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const handleIdx = intake.indexOf("const handleProSendForReview = React.useCallback");
    const block = intake.slice(handleIdx, handleIdx + 1200);
    expect(block).toContain('void completeGuidedPaidProReviewFirstHandoff("simple_pro_send_for_review")');
    expect(block).toContain(REVIEW_FIRST_SIMPLE_PRO_SOURCE);
  });

  it("completeGuidedPaidProReviewFirstHandoff suppresses onCreated navigation during review persist", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const handoffIdx = intake.indexOf("const completeGuidedPaidProReviewFirstHandoff = React.useCallback");
    const block = intake.slice(handoffIdx, handoffIdx + 12000);
    expect(block).toContain("runPersistAndOpen(mergedDraft, partyCtx, true, \"review\", \"review\", true)");
    expect(block).toContain(", true)");
    expect(intake).toContain("reviewFirstHandoffPersist = false");
    expect(intake).toContain("suppress_onCreated_for_review_first_persist");
    expect(block).not.toContain("navigate(`/app/send/");
  });

  it("openPaidProPostInlineSendDestination never navigates to /app/send for review intent", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const fnIdx = intake.indexOf("const openPaidProPostInlineSendDestination = React.useCallback");
    const block = intake.slice(fnIdx, fnIdx + 2400);
    const reviewStart = block.indexOf('if (effectivePremiumSendMode === "review")');
    const signatureStart = block.indexOf('if (\n      shouldSkipPaidProPrepareReviewLinkInterstitial');
    const reviewBranch = block.slice(
      reviewStart,
      signatureStart > reviewStart ? signatureStart : reviewStart + 900,
    );
    expect(reviewBranch).toContain("intake_inline_send_review_first");
    expect(reviewBranch).not.toContain("navigate(`/app/send/");
  });
});
