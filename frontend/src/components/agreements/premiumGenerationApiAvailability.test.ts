import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import { validatePaidProCorpusCandidate } from "./paidProCorpusAuthority";
import {
  isPremiumGenerationApiUnavailableForUi,
  isPremiumGenerationApiUnavailablePipelineSource,
  MIN_PAID_PRO_AUTHORITY_LEN,
  PAID_PRO_API_UNAVAILABLE_BODY,
  PAID_PRO_API_UNAVAILABLE_HEADLINE,
  shouldBlockLivePreviewAsPaidProAuthority,
} from "./premiumGenerationApiAvailability";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  isAuthoritativePaidProCorpusForGuided,
  resolvePaidProReviewRenderSurface,
} from "./paidProRenderSurface";
import { proTruthIsSignerCtaOpen, computeProTruthSurface } from "./premiumProTruth";
import { resolveAgreementIntentContract } from "./agreementIntentContract";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: true };

const RED_MESA_INTAKE = `
AI automation services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.
Total fee $95,000 split 50/25/25. Optional support $4,500/mo.
Texas governing law.
`.trim();

function redMesaStarterDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: "AI workflow implementation.",
    payment_terms: "$95,000 total.",
    duration: "30 days notice",
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
  };
}

describe("premiumGenerationApiAvailability", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    vi.unstubAllEnvs();
  });

  it("flags premium_network_retryable as API-unavailable pipeline source", () => {
    expect(isPremiumGenerationApiUnavailablePipelineSource("premium_network_retryable")).toBe(true);
    expect(isPremiumGenerationApiUnavailablePipelineSource("server_full_draft")).toBe(false);
  });

  it("blocks short live preview as paid authority after API failure", () => {
    expect(
      shouldBlockLivePreviewAsPaidProAuthority({
        pipelineSource: "premium_network_retryable",
        previewLen: 714,
      }),
    ).toBe(true);
    expect(
      shouldBlockLivePreviewAsPaidProAuthority({
        pipelineSource: "premium_network_retryable",
        previewLen: MIN_PAID_PRO_AUTHORITY_LEN,
      }),
    ).toBe(false);
  });

  it("pickPremiumPaidReadonlyPlainText returns none when API unavailable (no local fallback authority)", () => {
    const draft = redMesaStarterDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    const pick = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      premiumPipelineOutputBodyText: "",
      draft,
      agreementDocumentText: starter,
      premiumCheckoutCompleted: true,
      intakeText: RED_MESA_INTAKE,
      lastPremiumPipelineRenderSource: "premium_network_retryable",
    });
    expect(pick.plainText).toBe("");
    expect(pick.sourceUsed).toBe("none");
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("does not open signer CTA when readonly pick is empty after API failure", () => {
    const draft = redMesaStarterDraft();
    const contract = resolveAgreementIntentContract(RED_MESA_INTAKE);
    const snap = computeProTruthSurface({
      intentContract: contract,
      documentText: "",
      renderSource: "none",
      premiumPipelineSource: "premium_network_retryable",
      intakeText: RED_MESA_INTAKE,
      draft,
      qualityRetryActive: true,
      serverGenerationDegraded: false,
      allowPaidSubstantiveStitch: false,
      stale: false,
    });
    expect(proTruthIsSignerCtaOpen(snap)).toBe(false);
  });

  it("exposes local-dev API unavailable copy strings", () => {
    expect(PAID_PRO_API_UNAVAILABLE_HEADLINE).toMatch(/API is not reachable/i);
    expect(PAID_PRO_API_UNAVAILABLE_BODY).toMatch(/127\.0\.0\.1:8000/);
  });

  it("isPremiumGenerationApiUnavailableForUi when phase is network recoverable without SoT", () => {
    expect(
      isPremiumGenerationApiUnavailableForUi({
        premiumPostCheckoutPhase: "premium_network_recoverable",
        pipelineSource: "premium_network_retryable",
        hasPaidProSourceOfTruth: false,
      }),
    ).toBe(true);
    expect(
      isPremiumGenerationApiUnavailableForUi({
        premiumPostCheckoutPhase: "premium_network_recoverable",
        hasPaidProSourceOfTruth: true,
      }),
    ).toBe(false);
  });

  it("validatePaidProCorpusCandidate rejects short live preview when pipeline unavailable", () => {
    const draft = redMesaStarterDraft();
    const live = buildAgreementPreviewTextCore(draft, { premiumDeliverablePreview: true });
    const v = validatePaidProCorpusCandidate({
      plainText: live,
      tier: "locally_generated_paid_pro",
      freeBaselinePlain: buildAgreementPreviewTextCore(draft, { starterPreview: true }),
      intakeText: RED_MESA_INTAKE,
      draft,
      pipelineSource: "premium_network_retryable",
    });
    expect(v.ok).toBe(false);
    expect(v.reasons).toContain("api_unavailable_short_live_preview_blocked");
  });

  it("resolvePaidProReviewRenderSurface returns retry for short live preview after API failure", () => {
    const draft = redMesaStarterDraft();
    const live = buildAgreementPreviewTextCore(draft, { premiumDeliverablePreview: true });
    const surface = resolvePaidProReviewRenderSurface({
      pickedPlain: live,
      pickedSource: "live_generated_preview",
      draft,
      intakeText: RED_MESA_INTAKE,
      premiumCheckoutCompleted: true,
      pipelineSource: "premium_network_retryable",
      allowLocalDeterministicFallback: false,
    });
    expect(surface.mode).toBe("premium_unavailable_retry");
  });

  it("successful server draft establishes SoT and enables guided authority", () => {
    const serverBody = "Paid Pro server agreement. ".repeat(200);
    establishPaidProSourceOfTruth({ text: serverBody, source: "server_full_draft" });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const draft = redMesaStarterDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    expect(
      isAuthoritativePaidProCorpusForGuided({
        corpusPlain: serverBody,
        freeBaselinePlain: starter,
        renderSource: "server_full_document_text",
        pipelineSource: "server_full_draft",
      }),
    ).toBe(true);
    const pick = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      draft,
      agreementDocumentText: starter,
      premiumCheckoutCompleted: true,
      intakeText: RED_MESA_INTAKE,
      lastPremiumPipelineRenderSource: "server_full_draft",
    });
    expect(pick.plainText).toBe(serverBody.trim());
    expect(pick.sourceUsed).toBe("server_full_document_text");
  });

  it("logs premium_generation_api_unavailable in dev", () => {
    vi.stubEnv("DEV", true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      draft: redMesaStarterDraft(),
      agreementDocumentText: "",
      premiumCheckoutCompleted: true,
      intakeText: RED_MESA_INTAKE,
      lastPremiumPipelineRenderSource: "premium_network_retryable",
    });
    expect(warn).toHaveBeenCalledWith(
      "[premium_generation_api_unavailable]",
      expect.objectContaining({ fallbackBlocked: true }),
    );
    warn.mockRestore();
  });
});
