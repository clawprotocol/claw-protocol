import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import { tryBuildPaidProLocalDeterministicFallback } from "./paidProLocalDeterministicFallback";
import {
  buildFreeStarterBaselinePlain,
  isAuthoritativePaidProCorpusForGuided,
  isFreeStarterCloneOnPaidPro,
  resolvePaidProReviewRenderSurface,
} from "./paidProRenderSurface";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: true };

const RED_MESA_INTAKE = `
AI automation services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.
Total fee $95,000 split 50/25/25. Optional support $4,500/mo.
Texas governing law. No third-party AI uptime guarantee.
Client owns deliverables after payment. Provider keeps pre-existing tools and templates.
Email notices. 30-day termination.
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
    purpose: "AI workflow implementation and automation support.",
    payment_terms: "$95,000 total with milestone payments.",
    duration: "30 days notice to terminate",
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
  };
}

describe("paid Pro render surface guards", () => {
  it("detects free starter clone by hash on paid checkout", () => {
    const draft = redMesaStarterDraft();
    const starter = buildFreeStarterBaselinePlain(draft);
    expect(starter.length).toBeGreaterThan(200);
    expect(
      isFreeStarterCloneOnPaidPro({
        candidatePlain: starter,
        freeBaselinePlain: starter,
        renderSource: "live_generated_preview",
      }),
    ).toBe(true);
  });

  it("returns premium_unavailable_retry when paid pick is starter clone after checkout", () => {
    const draft = redMesaStarterDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    const surface = resolvePaidProReviewRenderSurface({
      pickedPlain: starter,
      pickedSource: "live_generated_preview",
      draft,
      intakeText: RED_MESA_INTAKE,
      premiumCheckoutCompleted: true,
      paidAuthoritativeFallback: "",
      pipelineSource: "premium_network_retryable",
      allowLocalDeterministicFallback: false,
    });
    expect(surface.mode).toBe("premium_unavailable_retry");
    if (surface.mode === "premium_unavailable_retry") {
      expect(surface.attemptedLen).toBe(starter.length);
      expect(surface.reason).toMatch(/free_starter|all_authority_candidates_failed/);
    }
  });

  it("pickPremiumPaidReadonlyPlainText never surfaces starter hash as paid Pro after checkout", () => {
    const draft = redMesaStarterDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    const pick = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      premiumPipelineOutputBodyText: "",
      draft,
      agreementDocumentText: starter,
      agreementDocumentTextHasPremiumMarkers: false,
      premiumCheckoutCompleted: true,
      intakeText: RED_MESA_INTAKE,
      paidAuthoritativeProBody: null,
      authoritativeHydratedPlainText: "",
      lastPremiumPipelineRenderSource: "premium_network_retryable",
    });
    expect(pick.plainText.length).toBeGreaterThan(1_200);
    expect(pick.plainText).toContain("$95,000");
    expect(
      isFreeStarterCloneOnPaidPro({
        candidatePlain: pick.plainText,
        freeBaselinePlain: starter,
        renderSource: pick.sourceUsed,
      }),
    ).toBe(false);
    expect(pick.sourceUsed).not.toBe("live_generated_preview");
  });

  it("uses deterministic local Pro fallback with Red Mesa intake economics when premium empty", () => {
    const draft = redMesaStarterDraft();
    const local = tryBuildPaidProLocalDeterministicFallback(RED_MESA_INTAKE, draft);
    expect(local).not.toBeNull();
    expect(local).toContain("$95,000");
    expect(local).toMatch(/50% to kickoff and build, 25% to rollout, and 25% to acceptance/);
    expect(local).toContain("$4,500 per month");
    expect(local).toMatch(/Texas/i);
    expect(local).toMatch(/does not guarantee the uptime/i);
    expect(local).toMatch(/pre-existing tools/i);

    const surface = resolvePaidProReviewRenderSurface({
      pickedPlain: "",
      pickedSource: "none",
      draft,
      intakeText: RED_MESA_INTAKE,
      premiumCheckoutCompleted: true,
      allowLocalDeterministicFallback: true,
    });
    expect(surface.mode).toBe("authoritative_pro");
    if (surface.mode === "authoritative_pro") {
      expect(surface.usedLocalDeterministicFallback).toBe(true);
      expect(surface.plainText).toContain("Red Mesa Logistics LLC");
    }

    const contract = resolveAgreementIntentContract(RED_MESA_INTAKE);
    const v = validatePaidProOutput({
      text: local!,
      rawIntake: RED_MESA_INTAKE,
      intentContract: contract,
      draft,
      premiumPipelineSource: "premium_network_retryable",
    });
    expect(v.ok, v.reasons.join(", ")).toBe(true);
  });

  it("does not authorize guided completion on starter baseline only", () => {
    const draft = redMesaStarterDraft();
    const starter = buildFreeStarterBaselinePlain(draft);
    expect(
      isAuthoritativePaidProCorpusForGuided({
        corpusPlain: starter,
        freeBaselinePlain: starter,
        renderSource: "live_generated_preview",
        pipelineSource: "premium_network_retryable",
      }),
    ).toBe(false);
  });
});
