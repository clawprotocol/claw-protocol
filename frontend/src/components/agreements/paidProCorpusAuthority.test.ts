import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import {
  resolvePaidProCorpusAuthority,
  validatePaidProCorpusCandidate,
} from "./paidProCorpusAuthority";
import { tryBuildPaidProLocalDeterministicFallback } from "./paidProLocalDeterministicFallback";
import { resolvePaidProReviewRenderSurface } from "./paidProRenderSurface";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: true };

const RED_MESA_INTAKE = `
AI automation services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.
Total fee $95,000 split 50/25/25. Optional support $4,500/mo.
Texas governing law. No third-party AI uptime guarantee.
Client owns deliverables after payment. Provider keeps pre-existing tools and templates.
Email notices. 30-day termination.
`.trim();

function redMesaDraft(): ParsedDraftShape {
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

function longLocalProBody(): string {
  return [
    "AI Automation Services Agreement",
    "1. Scope. Provider implements AI workflows and automation for Client operations.",
    "2. Fees. Total project fee $95,000 with 50% at kickoff, 25% at rollout, 25% at acceptance.",
    "3. Optional Support. $4,500 per month after go-live if elected in writing.",
    "4. Governing Law. Texas law governs without regard to conflicts rules.",
    "5. Third-Party AI. Provider does not guarantee uptime of third-party AI platforms.",
    "6. Pre-Existing Tools. Provider retains pre-existing tools, libraries, and templates.",
    "7. Confidentiality. Mutual protection of non-public information.",
    "8. Termination. Either party may terminate on 30 days written notice.",
    "9. Notices. Email to designated representatives.",
    "10. Signatures. Electronic signatures permitted.",
    "\n",
    "Operative detail. ".repeat(80),
  ].join("\n");
}

describe("paid Pro corpus authority", () => {
  it("rejects starter clone", () => {
    const draft = redMesaDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    const v = validatePaidProCorpusCandidate({
      plainText: starter,
      tier: "locally_generated_paid_pro",
      freeBaselinePlain: starter,
      intakeText: RED_MESA_INTAKE,
      draft,
    });
    expect(v.ok).toBe(false);
    expect(v.starterClone).toBe(true);
  });

  it("rejects truncated corpus", () => {
    const draft = redMesaDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    const v = validatePaidProCorpusCandidate({
      plainText: "Short agreement.\n1. Scope.\n2. Pay.",
      tier: "locally_generated_paid_pro",
      freeBaselinePlain: starter,
      intakeText: RED_MESA_INTAKE,
      draft,
    });
    expect(v.ok).toBe(false);
    expect(v.reasons.some((r) => r.includes("truncated") || r.includes("too_short"))).toBe(true);
  });

  it("accepts valid local Pro corpus when backend pipeline failed", () => {
    const draft = redMesaDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    const local = longLocalProBody();
    const resolution = resolvePaidProCorpusAuthority({
      candidates: [
        {
          plainText: local,
          tier: "locally_generated_paid_pro",
          sourceLabel: "live_generated_preview",
          pipelineSource: "premium_network_retryable",
        },
      ],
      draft,
      intakeText: RED_MESA_INTAKE,
      freeBaselinePlain: starter,
      allowDeterministicFallback: false,
    });
    expect(resolution.mode).toBe("authoritative");
    if (resolution.mode === "authoritative") {
      expect(resolution.tier).toBe("locally_generated_paid_pro");
      expect(resolution.plainText).toContain("$95,000");
    }
  });

  it("prefers server tier over local when both valid", () => {
    const draft = redMesaDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    const server = longLocalProBody() + "\nServer authoritative addendum with Delaware venue.";
    const local = longLocalProBody();
    const resolution = resolvePaidProCorpusAuthority({
      candidates: [
        { plainText: local, tier: "locally_generated_paid_pro", sourceLabel: "live_generated_preview" },
        {
          plainText: server,
          tier: "server_authoritative_paid_pro",
          sourceLabel: "server_full_document_text",
          pipelineSource: "server_full_draft",
        },
      ],
      draft,
      intakeText: RED_MESA_INTAKE,
      freeBaselinePlain: starter,
      allowDeterministicFallback: false,
    });
    expect(resolution.mode).toBe("authoritative");
    if (resolution.mode === "authoritative") {
      expect(resolution.tier).toBe("server_authoritative_paid_pro");
      expect(resolution.plainText).toContain("Delaware");
    }
  });

  it("sticky corpus persists through refresh when still valid", () => {
    const draft = redMesaDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    const sticky = longLocalProBody();
    const resolution = resolvePaidProCorpusAuthority({
      candidates: [{ plainText: "", tier: "locally_generated_paid_pro", sourceLabel: "none" }],
      draft,
      intakeText: RED_MESA_INTAKE,
      freeBaselinePlain: starter,
      stickyPlainText: sticky,
      stickyTier: "locally_generated_paid_pro",
      allowDeterministicFallback: false,
    });
    expect(resolution.mode).toBe("authoritative");
    if (resolution.mode === "authoritative") {
      expect(resolution.plainText.trim()).toBe(sticky.trim());
    }
  });

  it("deterministic fallback renders as authoritative when premium empty and API is reachable", () => {
    const draft = redMesaDraft();
    const local = tryBuildPaidProLocalDeterministicFallback(RED_MESA_INTAKE, draft);
    expect(local).not.toBeNull();
    const surface = resolvePaidProReviewRenderSurface({
      pickedPlain: "",
      pickedSource: "none",
      draft,
      intakeText: RED_MESA_INTAKE,
      premiumCheckoutCompleted: true,
      pipelineSource: null,
      allowLocalDeterministicFallback: true,
    });
    expect(surface.mode).toBe("authoritative_pro");
    if (surface.mode === "authoritative_pro") {
      expect(surface.authorityTier).toBe("deterministic_paid_pro_fallback");
      expect(surface.plainText).toContain("$4,500");
    }
  });

  it("does not use deterministic fallback as authority when generation API is unavailable", () => {
    const draft = redMesaDraft();
    const surface = resolvePaidProReviewRenderSurface({
      pickedPlain: "",
      pickedSource: "none",
      draft,
      intakeText: RED_MESA_INTAKE,
      premiumCheckoutCompleted: true,
      pipelineSource: "premium_network_retryable",
      allowLocalDeterministicFallback: true,
    });
    expect(surface.mode).toBe("premium_unavailable_retry");
  });

  it("retry panel only when all authority candidates fail", () => {
    const draft = redMesaDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    const surface = resolvePaidProReviewRenderSurface({
      pickedPlain: starter,
      pickedSource: "live_generated_preview",
      draft,
      intakeText: RED_MESA_INTAKE,
      premiumCheckoutCompleted: true,
      allowLocalDeterministicFallback: false,
    });
    expect(surface.mode).toBe("premium_unavailable_retry");
  });

  it("backend outage after payment with valid local corpus still renders Pro review", () => {
    const draft = redMesaDraft();
    const starter = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    const local = longLocalProBody();
    const pick = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      premiumPipelineOutputBodyText: "",
      draft,
      agreementDocumentText: starter,
      premiumCheckoutCompleted: true,
      intakeText: RED_MESA_INTAKE,
      paidAuthoritativeProBody: local,
      authoritativeHydratedPlainText: local,
      lastPremiumPipelineRenderSource: "premium_network_retryable",
      stickyAuthoritativePlainText: local,
    });
    expect(pick.plainText.length).toBeGreaterThan(1_200);
    expect(pick.sourceUsed).toBe("server_full_document_text");
    expect(pick.plainText).toContain("Texas");
  });
});
