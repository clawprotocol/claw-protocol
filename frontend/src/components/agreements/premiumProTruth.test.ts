import { describe, expect, it } from "vitest";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import {
  computeProTruthSurface,
  proTruthIsPremiumDocumentReady,
  proTruthIsSignerCtaOpen,
  validateProTruthReadonlyText,
} from "./premiumProTruth";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";

const intake = "SaaS website for Client A and Developer B in Oklahoma, $5000, May 2026.";

describe("premiumProTruth (canonical surface)", () => {
  it("validateProTruthReadonlyText matches validatePaidProOutput", () => {
    const c = resolveAgreementIntentContract(intake);
    const text = "x".repeat(3000);
    const a = validateProTruthReadonlyText({
      text,
      rawIntake: intake,
      intentContract: c,
      draft: null,
      premiumPipelineSource: "server_full_draft",
    });
    const b = validatePaidProOutput({
      text,
      rawIntake: intake,
      intentContract: c,
      draft: null,
      premiumPipelineSource: "server_full_draft",
    });
    expect(a).toEqual(b);
  });

  it("computeProTruthSurface: empty document is not document-ready and signer CTA is closed", () => {
    const c = resolveAgreementIntentContract(intake);
    const s = computeProTruthSurface({
      intentContract: c,
      documentText: "",
      renderSource: "server_full_document_text",
      premiumPipelineSource: "server_full_draft",
      intakeText: intake,
      draft: null,
      qualityRetryActive: false,
      serverGenerationDegraded: false,
      allowPaidSubstantiveStitch: false,
      stale: false,
    });
    expect(s.validation.ok).toBe(false);
    expect(proTruthIsPremiumDocumentReady(s)).toBe(false);
    expect(proTruthIsSignerCtaOpen(s)).toBe(false);
  });
});
