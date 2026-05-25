import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldSkipPaidProPrepareReviewLinkInterstitial } from "./paidProPostRecipientSetupHandoff";

describe("paidProPostRecipientSetupHandoff", () => {
  it("exports send-flow diagnostics and VS01 bridge wiring", () => {
    const s = readFileSync(join(__dirname, "paidProPostRecipientSetupHandoff.ts"), "utf8");
    expect(s).toContain("[send-flow-skip-review-link-interstitial]");
    expect(s).toContain("[send-flow-vs01-bridge-start]");
    expect(s).toContain("[send-flow-vs01-bridge-success]");
    expect(s).toContain("[send-flow-vs01-bridge-failed]");
    expect(s).toContain("tryNavigatePaidProAgreementSenderFirstVs01Esign");
    expect(s).toContain("assertGuidedProVs01BridgeCorpusReady");
    expect(s).toContain("resolveGuidedVs01SigningHandoffForBridge");
    expect(s).toContain("mergeAgreementDraftWithGuidedSigningHandoff");
    expect(s).toContain("mintSimpleDoneReviewRecipientLinkRows");
    expect(s).toContain("resolveReviewFirstMintPolicyGate");
    expect(s).toContain("/app/done/");
    expect(s).not.toContain("/app/send/");
  });

  it("SimpleCreatePage uses skip interstitial handoff instead of defaulting to /app/send for paid Pro", () => {
    const page = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
    expect(page).toContain("shouldSkipPaidProPrepareReviewLinkInterstitial");
    expect(page).toContain("executePaidProPostRecipientSetupHandoff");
    expect(page).toContain("Retry prepare signing");
    expect(page).toContain("Back to agreement");
    const onCreated = page.indexOf("onCreated={");
    expect(onCreated).toBeGreaterThanOrEqual(0);
    const slice = page.slice(onCreated, onCreated + 3200);
    const skipIdx = slice.indexOf("shouldSkipPaidProPrepareReviewLinkInterstitial");
    const sendIdx = slice.indexOf("/app/send/");
    expect(skipIdx).toBeGreaterThanOrEqual(0);
    expect(sendIdx === -1 || sendIdx > skipIdx).toBe(true);
  });

  it("AgreementBuilderIntake inline send CTA uses post-recipient handoff before /app/send fallback", () => {
    const intake = readFileSync(
      join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    const block = intake.slice(
      intake.indexOf("openPaidProPostInlineSendDestination"),
      intake.indexOf("openPaidProPostInlineSendDestination") + 2200,
    );
    expect(block).toContain("executePaidProPostRecipientSetupHandoff");
    expect(block).toContain("shouldSkipPaidProPrepareReviewLinkInterstitial");
    const handoffIdx = block.indexOf("executePaidProPostRecipientSetupHandoff");
    const sendIdx = block.indexOf("/app/send/");
    expect(handoffIdx).toBeGreaterThanOrEqual(0);
    expect(sendIdx === -1 || sendIdx > handoffIdx).toBe(true);
  });
});

describe("shouldSkipPaidProPrepareReviewLinkInterstitial", () => {
  it("returns false for non-authoritative drafts", () => {
    expect(
      shouldSkipPaidProPrepareReviewLinkInterstitial({
        draft: { purpose: "free" } as never,
        agreementId: "a1",
        premiumSendIntent: "review",
      }),
    ).toBe(false);
  });
});
