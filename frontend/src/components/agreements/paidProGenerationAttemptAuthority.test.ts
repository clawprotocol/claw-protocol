import { describe, it, expect } from "vitest";
import {
  beginPaidProGenerationAttempt,
  rejectSupersededPaidProGenerationWrite,
  resolveCurrentAttemptPremiumValidationCorpus,
} from "./paidProGenerationAttemptAuthority";

describe("paidProGenerationAttemptAuthority", () => {
  it("resolveCurrentAttemptPremiumValidationCorpus prefers wire when processed differs", () => {
    const wire = "y".repeat(6227);
    const processed = "x".repeat(6485);
    const r = resolveCurrentAttemptPremiumValidationCorpus({
      processedDoc: processed,
      wireDocumentText: wire,
      wireServerFullDocumentText: "",
      intakeText: "intake",
    });
    expect(r.source).toBe("wire");
    expect(r.text).toBe(wire);
  });

  it("resolveCurrentAttemptPremiumValidationCorpus keeps processed when wire is thin", () => {
    const processed = "x".repeat(3000);
    const wire = "y".repeat(3000);
    const r = resolveCurrentAttemptPremiumValidationCorpus({
      processedDoc: processed,
      wireDocumentText: wire,
      wireServerFullDocumentText: "",
      intakeText: "intake",
    });
    expect(r.source).toBe("processed");
  });

  it("rejects stale attempt sequence after supersession", () => {
    const first = beginPaidProGenerationAttempt({ agreementGenerationId: "gen-1", premiumRequestIntakeFingerprint: "fp-1" });
    beginPaidProGenerationAttempt({ agreementGenerationId: "gen-2", premiumRequestIntakeFingerprint: "fp-2" });
    expect(
      rejectSupersededPaidProGenerationWrite({
        agreementGenerationId: "gen-2",
        attemptSequence: first.attemptSequence,
      }),
    ).toBe(true);
  });
});
