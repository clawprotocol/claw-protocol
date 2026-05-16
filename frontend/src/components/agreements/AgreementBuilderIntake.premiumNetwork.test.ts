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
    expect(intake).toContain("Back to draft");
  });

  it("routes network retryable pipeline results to modal without rejected_paid_corpus gate", () => {
    expect(intake).toContain("isPremiumNetworkRetryablePipelineResult");
    expect(intake).toContain('setPremiumPostCheckoutPhase("network_retry")');
    expect(intake).toContain('premiumRenderSource === "premium_network_retryable"');
  });
});
