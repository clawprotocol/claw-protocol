/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import {
  computeProTruthSurface,
  proTruthIsPremiumDocumentReady,
  proTruthIsSignerCtaOpen,
  validateProTruthReadonlyText,
} from "./premiumProTruth";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";

const intake = "SaaS website for Client A and Developer B in Oklahoma, $5000, May 2026.";

const saasSubstantiveBody = () =>
  expandOperativeCorpusWithUniqueSupplements(
    [
      "WHEREAS parties agree.",
      "",
      "1. Services for SaaS website in Oklahoma with milestones.",
      "2. Fees $5000 May 2026.",
      "3. IP and confidentiality.",
      "4. Termination.",
      "5. Law Oklahoma.",
    ].join("\n"),
    SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 400,
  );

describe("premiumProTruth (canonical surface)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
  });
  afterEach(() => {
    resetPaidProPipelineTestIsolation();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("validateProTruthReadonlyText matches validatePaidProOutput", () => {
    const c = resolveAgreementIntentContract(intake);
    const text = saasSubstantiveBody();
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

  it("computeProTruthSurface: server_full_document_text + validated body yields premium_success gate", () => {
    const c = resolveAgreementIntentContract(intake);
    const body = saasSubstantiveBody();
    const v = validatePaidProOutput({
      text: body,
      rawIntake: intake,
      intentContract: c,
      draft: null,
      premiumPipelineSource: "server_full_draft",
    });
    expect(v.ok).toBe(true);
    const s = computeProTruthSurface({
      intentContract: c,
      documentText: body,
      renderSource: "server_full_document_text",
      premiumPipelineSource: "server_full_draft",
      intakeText: intake,
      draft: null,
      qualityRetryActive: false,
      serverGenerationDegraded: false,
      allowPaidSubstantiveStitch: true,
      stale: false,
    });
    expect(s.gate.state).toBe("premium_success");
    expect(proTruthIsPremiumDocumentReady(s)).toBe(true);
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
