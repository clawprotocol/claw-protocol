import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("paid Pro review-first send route (no generic /app/send gate)", () => {
  it("SimpleSendPage redirects authoritative review-first away from generic send shell", () => {
    const page = readFileSync(join(__dirname, "SimpleSendPage.tsx"), "utf8");
    expect(page).toContain("shouldRenderPaidProReviewFirstSendSurface");
    expect(page).toContain("executePaidProPostRecipientSetupHandoff");
    expect(page).toContain("simple_send_review_first_redirect");
    expect(page).toContain("clearPersistedSimpleSendPhase");
    expect(page).toContain("review-first-send-surface");
  });

  it("SimpleSendPage does not open conversion modal for paid Pro review-first continue", () => {
    const page = readFileSync(join(__dirname, "SimpleSendPage.tsx"), "utf8");
    const blockIdx = page.indexOf("onSimpleFlowContinue={async () => {");
    const block = page.slice(blockIdx, blockIdx + 3500);
    expect(block).toContain("shouldSkipPaidProPrepareReviewLinkInterstitial");
    expect(block).toContain("executePaidProPostRecipientSetupHandoff");
    expect(block).toContain("simple_send_review_first_continue");
    expect(block.indexOf("simple_send_review_first_continue")).toBeGreaterThan(-1);
    expect(block.indexOf("simple_send_review_first_continue")).toBeLessThan(
      block.indexOf("setPaywallOpen(true)"),
    );
  });

  it("paid Pro post-recipient handoff mints review links to /app/done for review intent", () => {
    const handoff = readFileSync(join(__dirname, "paidProPostRecipientSetupHandoff.ts"), "utf8");
    expect(handoff).toContain('premiumSendIntent === "review"');
    expect(handoff).toContain("navigate(`/app/done/");
    expect(handoff).toContain("shouldSkipPaidProPrepareReviewLinkInterstitial");
    expect(handoff).toContain("reviewLinkMintFailureUserCopy");
    expect(handoff).toContain("resolveReviewFirstMintFailureUserMessage");
  });

  it("AgreementBuilderIntake never navigates to /app/send for review-only inline send", () => {
    const intake = readFileSync(
      join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    const fnIdx = intake.indexOf("const openPaidProPostInlineSendDestination = React.useCallback");
    const block = intake.slice(fnIdx, fnIdx + 2200);
    expect(block).toContain('effectivePremiumSendMode === "review"');
    expect(block).toContain("intake_inline_send_review_first");
    const reviewBranchEnd = block.indexOf('premiumSendIntent: "review"');
    const navigateSendIdx = block.indexOf("navigate(`/app/send/");
    expect(reviewBranchEnd).toBeGreaterThan(-1);
    expect(navigateSendIdx).toBeGreaterThan(reviewBranchEnd);
  });
});
