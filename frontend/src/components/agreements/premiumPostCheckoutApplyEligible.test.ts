import { describe, expect, it } from "vitest";
import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import {
  authoritativePremiumCompletionMatchesSession,
  authoritativePremiumPipelineResultForUiApply,
  hasUsablePremiumBodyText,
  isPremiumNetworkRecoverableResult,
  isPremiumPipelineRewriteSucceeded,
  isPremiumRecoverablePipelineResult,
} from "./premiumPostCheckoutApplyEligible";

function mockAuthoritativeResult(overrides: Partial<PremiumCompletionResult> = {}): PremiumCompletionResult {
  const body = "y".repeat(12000);
  return {
    premiumDraft: {} as PremiumCompletionResult["premiumDraft"],
    premiumParties: [],
    recipientCandidates: [],
    winningPremiumBodyText: body,
    premiumRenderSource: "server_full_draft",
    premiumReview: null,
    premiumFinalizeAudit: null,
    premiumReviewRoute: null,
    staleIntakeOrGeneration: false,
    agreementGenerationId: "gen-session-abc",
    founderDetailsGateMessage: null,
    proIntentGateMessage: null,
    ...overrides,
  };
}

describe("premiumPostCheckoutApplyEligible", () => {
  it("authoritativePremiumPipelineResultForUiApply is true for accepted server_full_draft + long corpus", () => {
    expect(authoritativePremiumPipelineResultForUiApply(mockAuthoritativeResult())).toBe(true);
  });

  it("authoritativePremiumPipelineResultForUiApply is true for server_full_draft_degraded + long corpus (QA degraded-accept path)", () => {
    expect(
      authoritativePremiumPipelineResultForUiApply(
        mockAuthoritativeResult({ premiumRenderSource: "server_full_draft_degraded" }),
      ),
    ).toBe(true);
  });

  it("authoritativePremiumPipelineResultForUiApply is false when staleIntakeOrGeneration", () => {
    expect(
      authoritativePremiumPipelineResultForUiApply(
        mockAuthoritativeResult({ staleIntakeOrGeneration: true }),
      ),
    ).toBe(false);
  });

  it("authoritativePremiumPipelineResultForUiApply is true when needs_details advisory but corpus is authoritative", () => {
    expect(
      authoritativePremiumPipelineResultForUiApply(
        mockAuthoritativeResult({
          proIntentGateMessage: "Add specifics, then tap Retry Pro draft.",
        }),
      ),
    ).toBe(true);
  });

  it("authoritativePremiumCompletionMatchesSession requires agreementGenerationId match", () => {
    const r = mockAuthoritativeResult({ agreementGenerationId: "gen-a" });
    expect(authoritativePremiumCompletionMatchesSession(r, "gen-a")).toBe(true);
    expect(authoritativePremiumCompletionMatchesSession(r, "gen-b")).toBe(false);
  });

  /**
   * Regression: React effect cleanup can mark runIsCurrent false while ensurePremiumCompletion already
   * returned an authoritative server_full_draft body — apply must still proceed when session matches.
   */
  it("effect-churn guard: session match + authoritative result enables apply despite stale run token", () => {
    const r = mockAuthoritativeResult({ agreementGenerationId: "same-gen" });
    const authoritativeReadyForApply =
      authoritativePremiumPipelineResultForUiApply(r) &&
      authoritativePremiumCompletionMatchesSession(r, "same-gen");
    expect(authoritativeReadyForApply).toBe(true);
  });

  it("network retryable is not rewrite success and not eligible for UI apply", () => {
    const r = mockAuthoritativeResult({
      winningPremiumBodyText: "",
      premiumRenderSource: "premium_network_retryable",
      premiumNetworkRetryable: true,
    });
    expect(isPremiumNetworkRecoverableResult(r)).toBe(true);
    expect(isPremiumRecoverablePipelineResult(r)).toBe(true);
    expect(isPremiumPipelineRewriteSucceeded(r)).toBe(false);
    expect(authoritativePremiumPipelineResultForUiApply(r)).toBe(false);
  });

  it("hasUsablePremiumBodyText rejects short and placeholder bodies", () => {
    expect(hasUsablePremiumBodyText("x".repeat(600))).toBe(true);
    expect(hasUsablePremiumBodyText("x".repeat(100))).toBe(false);
    expect(hasUsablePremiumBodyText("placeholder")).toBe(false);
  });
});
