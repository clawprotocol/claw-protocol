import { describe, expect, it } from "vitest";
import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import { paidProCheckoutCompletionHasVisibleOutcome } from "./premiumPostCheckoutApplyEligible";

function baseResult(overrides: Partial<PremiumCompletionResult>): PremiumCompletionResult {
  return {
    premiumDraft: {
      title: "Agreement",
      jurisdiction: "Delaware",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: "",
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    },
    premiumParties: [],
    recipientCandidates: [],
    winningPremiumBodyText: "",
    premiumRenderSource: "rejected_paid_corpus",
    premiumReview: null,
    premiumFinalizeAudit: null,
    premiumReviewRoute: null,
    ...overrides,
  };
}

describe("paidProCheckoutCompletionHasVisibleOutcome", () => {
  it("treats degraded local recovery with body as a visible checkout outcome", () => {
    const body = "x".repeat(600);
    expect(
      paidProCheckoutCompletionHasVisibleOutcome(
        baseResult({
          premiumRenderSource: "premium_degraded_server_local_recovery",
          premiumDegradedServerLocalRecovery: true,
          premiumDegradedServerRecoverable: true,
          winningPremiumBodyText: body,
        }),
      ),
    ).toBe(true);
  });

  it("treats explicit recoverable retry without body as visible", () => {
    expect(
      paidProCheckoutCompletionHasVisibleOutcome(
        baseResult({
          premiumRenderSource: "rejected_paid_corpus",
          premiumDegradedServerRecoverable: true,
          proIntentGateMessage: "Retry Pro draft",
        }),
      ),
    ).toBe(true);
  });

  it("rejects silent empty rejected corpus with no recovery flags", () => {
    expect(
      paidProCheckoutCompletionHasVisibleOutcome(
        baseResult({
          premiumRenderSource: "rejected_paid_corpus",
          winningPremiumBodyText: "",
        }),
      ),
    ).toBe(false);
  });
});
