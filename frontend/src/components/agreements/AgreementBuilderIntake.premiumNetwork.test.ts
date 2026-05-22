import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AgreementBuilderIntake premium network recovery UI", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("shows connection interrupted modal copy and retry actions", () => {
    expect(intake).toContain('PREMIUM_NETWORK_MODAL_TITLE = "Connection interrupted"');
    expect(intake).toContain("Your draft is safe. LawDog lost connection while building the Pro agreement.");
    expect(intake).toContain('premiumPostCheckoutPhase === "network_retry"');
    expect(intake).toContain("Try Pro again");
    expect(intake).toContain("Trying again…");
    expect(intake).toContain("We'll retry the Pro build without losing this draft.");
    expect(intake).toContain("Back to draft");
  });

  it("routes network retryable pipeline results to recoverable state without success telemetry", () => {
    expect(intake).toContain("isPremiumNetworkRetryablePipelineResult");
    expect(intake).toContain('setPremiumPostCheckoutPhase("premium_network_recoverable")');
    expect(intake).toContain("isPremiumNetworkRecoverableResult");
    expect(intake).toContain("isPremiumPipelineRewriteSucceeded");
    expect(intake).toContain("premium_rewrite_retryable");
  });

  it("inline recoverable panel has retry, starter fallback, and copy debug CTAs", () => {
    expect(intake).toContain("premium-network-recoverable-panel");
    expect(intake).toContain("premium-network-recoverable-retry");
    expect(intake).toContain("premium-network-recoverable-starter");
    expect(intake).toContain("premium-network-recoverable-copy-debug");
    expect(intake).toContain("handlePremiumRecoverableContinueWithStarterDraft");
    expect(intake).toContain("buildPremiumNetworkRecoverableDebugInfo");
    expect(intake).toContain("premiumPostCheckoutPhase !== \"premium_network_recoverable\"");
  });

  it("retryable results always apply even when checkout run is stale", () => {
    expect(intake).toContain("retryableReadyForApply");
    expect(intake).toContain("retryableResult: retryableReadyForApply");
  });

  it("guided UX stays inactive until valid premium body exists", () => {
    expect(intake).toContain("guidedBodyUsable &&");
    expect(intake).toContain("canProceedWithPaidProDocument &&");
    expect(intake).toMatch(/showPrimaryGuidedCompletion = Boolean\([\s\S]*guidedBodyUsable/);
  });
});
