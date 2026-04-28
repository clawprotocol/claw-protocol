import { describe, expect, it } from "vitest";
import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import {
  authoritativePremiumCompletionMatchesSession,
  authoritativePremiumPipelineResultForUiApply,
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

  it("authoritativePremiumPipelineResultForUiApply is false when staleIntakeOrGeneration", () => {
    expect(
      authoritativePremiumPipelineResultForUiApply(
        mockAuthoritativeResult({ staleIntakeOrGeneration: true }),
      ),
    ).toBe(false);
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
});
