import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("paid Pro review-first send route (no generic /app/send gate)", () => {
  it("SimpleSendPage redirects authoritative review-first away from generic send shell", () => {
    const page = readFileSync(join(__dirname, "SimpleSendPage.tsx"), "utf8");
    expect(page).toContain("shouldSkipPaidProPrepareReviewLinkInterstitial");
    expect(page).toContain("executePaidProPostRecipientSetupHandoff");
    expect(page).toContain("simple_send_review_first_redirect");
    expect(page).toContain("clearPersistedSimpleSendPhase");
    expect(page).toContain('simpleFlowPremiumHandoffIntent !== "review"');
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
  });
});
