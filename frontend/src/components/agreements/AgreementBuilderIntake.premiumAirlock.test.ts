import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const intake = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");

describe("AgreementBuilderIntake premium generation retry contract", () => {
  it("routes generation retryable pipeline results to modal without rejected_paid_corpus gate", () => {
    expect(intake).toContain("isPremiumGenerationRetryablePipelineResult");
    expect(intake).toContain("isPremiumRetryablePipelineResult");
    expect(intake).toContain('setPremiumPostCheckoutPhase("generation_retry")');
    expect(intake).toContain('premiumRenderSource === "premium_generation_retryable"');
  });

  it("shows user-facing generation retry copy and preserves retry callback", () => {
    expect(intake).toContain("LawDog couldn't build the Pro version yet. Your draft is safe.");
    expect(intake).toContain("Try Pro again");
    expect(intake).toContain("Back to draft");
    expect(intake).toContain("premium_generation_retry_click");
    expect(intake).toContain("logPremiumRetryPreservedContext");
  });

  it("keeps runPremiumModelPassRef on retryable results", () => {
    expect(intake).toContain("const retryableResult = result != null && isPremiumRetryablePipelineResult(result)");
  });
});
