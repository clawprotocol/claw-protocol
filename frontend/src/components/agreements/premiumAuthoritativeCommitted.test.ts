import { beforeEach, describe, expect, it } from "vitest";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import { persistPremiumCompletionSnapshot, clearPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import { resolveAuthoritativePremiumCommitted } from "./premiumAuthoritativeCommitted";

describe("resolveAuthoritativePremiumCommitted", () => {
  beforeEach(() => {
    clearPremiumCompletionSnapshot();
  });

  it("treats premiumAccepted degraded recovery snapshot as committed", () => {
    const body = "MUTUAL CONSULTING AGREEMENT\n\n".repeat(220) + "\nIN WITNESS WHEREOF\n";
    persistPremiumCompletionSnapshot({
      premiumDraft: {
        title: "Agreement",
        jurisdiction: "DE",
        parties: [],
        purpose: "",
        payment_terms: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: { amount: null, cadence: null, valid: false },
      },
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: body,
      premiumReadonlyPlainText: body,
      premiumReview: null,
      premiumFinalizeAudit: null,
      premiumReviewRoute: null,
      agreementGenerationId: "gen-recovery-committed",
      intakeTextFingerprint: "fp",
      premiumPipelineRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
      premiumAccepted: true,
    });
    const snap = {
      premiumWinningBodyText: body,
      premiumPipelineRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
      premiumAccepted: true,
    };
    const resolved = resolveAuthoritativePremiumCommitted({
      winningPremiumBodyText: body,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
      snapshot: snap as never,
    });
    expect(resolved.committed).toBe(true);
    expect(resolved.bodyLen).toBeGreaterThan(4_000);
  });
});
