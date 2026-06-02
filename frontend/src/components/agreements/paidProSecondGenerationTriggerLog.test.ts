import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPremiumSecondGenerationTriggerPayload,
  logPremiumSecondGenerationTriggered,
  premiumSecondGenerationTriggerPayloadIsSafe,
} from "./paidProSecondGenerationTriggerLog";
import { clearPremiumGenerationCallAudit, recordPremiumNetworkCall } from "./paidProPremiumGenerationCallAudit";

describe("paidProSecondGenerationTriggerLog", () => {
  beforeEach(() => {
    clearPremiumGenerationCallAudit();
    vi.unstubAllEnvs();
  });

  it("builds attempt 2 after checkout_completion ledger row", () => {
    recordPremiumNetworkCall({
      reason: "checkout_completion",
      intakeFingerprint: "fp-abc",
      agreementGenerationId: "g-1",
      documentTextLen: 6_780,
    });
    const payload = buildPremiumSecondGenerationTriggerPayload({
      reason: "degraded_structural_retry",
      firstDocumentLen: 6_780,
      firstServerFullDocumentLen: 6_780,
      generationOutcome: "degraded",
      agreementValidationPassed: false,
      agreementValidationFailureCodes: ["requested_e_sign_missing", "empty_required_section"],
      clientAcceptanceOk: false,
      clientAcceptanceReasons: ["banned_substring:internal generation"],
      lexicalSimilarityToFreePreview: 0.8123,
      skipStructuralRetryApplied: false,
      traceId: "g-1",
      sessionGenerationId: "g-1",
      intakeFingerprint: "fp-abc",
    });
    expect(payload.attempt).toBe(2);
    expect(payload.reason).toBe("degraded_structural_retry");
    expect(payload.lexicalSimilarityToFreePreview).toBe(0.8123);
    expect(premiumSecondGenerationTriggerPayloadIsSafe(payload)).toBe(true);
  });

  it("does not console.log in test mode but returns payload for assertions", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const payload = logPremiumSecondGenerationTriggered({
      reason: "similarity_regeneration",
      firstDocumentLen: 6_780,
      firstServerFullDocumentLen: 6_780,
      generationOutcome: "ok",
      agreementValidationPassed: false,
      agreementValidationFailureCodes: ["requested_confidentiality_missing"],
      clientAcceptanceOk: true,
      clientAcceptanceReasons: [],
      lexicalSimilarityToFreePreview: 0.91,
      skipStructuralRetryApplied: false,
      traceId: "g-sim",
      sessionGenerationId: "g-sim",
      intakeFingerprint: "fp-sim",
      attempt: 2,
    });
    expect(payload?.reason).toBe("similarity_regeneration");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("emits console line when perf trace env is enabled outside test mode", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumSecondGenerationTriggered({
      reason: "degraded_structural_retry",
      firstDocumentLen: 6_220,
      firstServerFullDocumentLen: 6_220,
      generationOutcome: "degraded",
      agreementValidationPassed: false,
      agreementValidationFailureCodes: [],
      clientAcceptanceOk: false,
      clientAcceptanceReasons: ["degraded_filler:repeated_operative_terms"],
      lexicalSimilarityToFreePreview: null,
      skipStructuralRetryApplied: false,
      traceId: "g-dev",
      sessionGenerationId: "g-dev",
      intakeFingerprint: "fp-dev",
      attempt: 2,
    });
    expect(spy).toHaveBeenCalledWith(
      "[premium-second-generation-triggered]",
      expect.objectContaining({ reason: "degraded_structural_retry", attempt: 2 }),
    );
    spy.mockRestore();
  });
});
