import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import { validatePaidProCorpusCandidate } from "./paidProCorpusAuthority";
import {
  isPremiumGenerationApiUnavailableForUi,
  isPremiumGenerationApiUnavailablePipelineSource,
  logPremiumGenerationApiUnavailable,
  MIN_PAID_PRO_AUTHORITY_LEN,
  PAID_PRO_API_UNAVAILABLE_BODY,
  PAID_PRO_API_UNAVAILABLE_HEADLINE,
  PREMIUM_GENERATION_DRAFT_API_PATH,
  shouldBlockLivePreviewAsPaidProAuthority,
} from "./premiumGenerationApiAvailability";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
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
  beforeEach(() => {
    clearCurrentSessionProEntitlementMarkers();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
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
    const v = validatePaidProCorpusCandidate({
      plainText: "x".repeat(200),
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

  it("rejects repeated-placeholder text labeled as server_full_draft", () => {
    const filler = "Paid Pro server agreement. ".repeat(200);
    expect(filler.length).toBeGreaterThan(5_000);
    expect(filler.length).toBeLessThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(() =>
      establishPaidProSourceOfTruth({ text: filler, source: "server_full_draft" }),
    ).toThrow(/mislabeled_server_full_draft_below_substantive_min/);
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("successful server draft establishes SoT and enables guided authority", () => {
    const serverBody = padOperativeCorpusBeforeWitness(
      [
        "SERVICES AGREEMENT",
        "",
        "This Services Agreement is entered into between Red Mesa Logistics LLC (Client) and Harbor Peak Automation LLC (Service Provider).",
        "",
        "1. Scope. Service Provider shall implement AI workflow automation, documentation, training, and deployment support.",
        "2. Payment. Client shall pay a total fee of $95,000, split 50/25/25, plus optional support of $4,500 per month.",
        "3. Term. Either party may terminate on thirty days written notice.",
        "4. Confidentiality. Each party shall protect non-public information.",
        "5. Intellectual Property. Client owns deliverables after payment. Provider retains pre-existing tools.",
        "6. Limitation of Liability. Except for willful misconduct, liability is limited to fees paid in the prior twelve months.",
        "7. Governing Law. This Agreement is governed by the laws of the State of Texas.",
        "8. Notices. Notices shall be sent to each party at its principal business address.",
        "9. Entire Agreement. This Agreement is the entire agreement of the parties.",
        "10. Electronic Signatures. The parties may execute this Agreement electronically.",
        "",
        "IN WITNESS WHEREOF, the Parties execute this Agreement.",
        "CLIENT: Red Mesa Logistics LLC",
        "By: __________________________",
        "SERVICE PROVIDER: Harbor Peak Automation LLC",
        "By: __________________________",
      ].join("\n"),
      SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 400,
    );
    markPaidProPipelineValidationPassed({
      text: serverBody,
      source: "server_full_draft",
    });
    establishPaidProSourceOfTruth({
      text: serverBody,
      source: "server_full_draft",
      draft: redMesaStarterDraft(),
      intakeText: RED_MESA_INTAKE,
    });
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
    expect(pick.plainText).toBe(getPaidProSourceOfTruthText().trim());
    expect(pick.sourceUsed).toBe("server_full_document_text");
  });

  it("logs premium_generation_api_unavailable in dev", () => {
    vi.stubEnv("DEV", true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logPremiumGenerationApiUnavailable({
      endpoint: PREMIUM_GENERATION_DRAFT_API_PATH,
      stage: "pickPremiumPaidReadonlyPlainText",
      fallbackBlocked: true,
      pipelineSource: "premium_network_retryable",
    });
    expect(warn).toHaveBeenCalledWith(
      "[premium_generation_api_unavailable]",
      expect.objectContaining({ fallbackBlocked: true }),
    );
    warn.mockRestore();
  });
});
