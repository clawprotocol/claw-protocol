import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildCommercialFactGraph } from "./proOperationalSynthesis/commercialFactGraph";
import { applyAiWorkflowServicesQualityFloorToFallback } from "./premiumReadonlyRenderCorpus";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { TEST372_FREE_STACKED_PARTY_INTAKE } from "./paidProTest372FreeStarterIdentityRegression.test";
import {
  applyPaidProDomainScopeGuard,
  detectUnsupportedDomainContamination,
  intakeExplicitlyRequestsDomainScope,
  sanitizePaidProDomainScopeContamination,
  shouldApplyAiWorkflowServicesQualityFloor,
} from "./paidProDomainScopeGuard";

const SIMPLE_CONSULTING_INTAKE = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.
Scope: Simple consulting services.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();

const AI_WORKFLOW_INTAKE = `
Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.
Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.
`.trim();

const SOFTWARE_DEV_INTAKE = `
Software development agreement between Acme Corp and DevShop LLC.
Acme needs a custom web application with API integrations. $50,000 fixed fee.
`.trim();

function contaminatedConsultingCorpus(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    "This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
    "Client engages Service Provider to perform AI workflow setup services under the operational terms below.",
    "",
    "1. SERVICES AND COMMERCIAL OBJECTIVE",
    "Service Provider will assist Client with AI workflow setup. The services may include workflow mapping, configuration planning, implementation support, documentation of the configured workflow, and a practical demonstration or acceptance review of the configured workflow.",
    "",
    "2. ACCEPTANCE AND DEMONSTRATION REVIEW",
    "Service Provider will provide a practical demonstration or review of the configured AI workflow setup services.",
    "",
    "3. CONFIDENTIALITY",
    "Each Party shall protect Confidential Information.",
    "",
    "4. GOVERNING LAW",
    "Texas law governs.",
  ].join("\n");
}

describe("paidProDomainScopeGuard", () => {
  it("does not flag simple consulting intake for AI workflow quality floor", () => {
    expect(shouldApplyAiWorkflowServicesQualityFloor(SIMPLE_CONSULTING_INTAKE)).toBe(false);
    expect(intakeExplicitlyRequestsDomainScope(SIMPLE_CONSULTING_INTAKE)).toBe(false);
  });

  it("flags explicit AI workflow intake", () => {
    expect(shouldApplyAiWorkflowServicesQualityFloor(AI_WORKFLOW_INTAKE)).toBe(true);
    expect(intakeExplicitlyRequestsDomainScope(AI_WORKFLOW_INTAKE)).toBe(true);
  });

  it("flags technical software intake without treating it as generic consulting", () => {
    expect(intakeExplicitlyRequestsDomainScope(SOFTWARE_DEV_INTAKE)).toBe(true);
  });

  it("detects unsupported domain contamination in corpus for simple consulting intake", () => {
    const { contaminated, ruleIds } = detectUnsupportedDomainContamination(
      contaminatedConsultingCorpus(),
      SIMPLE_CONSULTING_INTAKE,
    );
    expect(contaminated).toBe(true);
    expect(ruleIds.length).toBeGreaterThan(0);
  });

  it("sanitizes contaminated consulting corpus to neutral services language", () => {
    const { text, repairs } = sanitizePaidProDomainScopeContamination(
      contaminatedConsultingCorpus(),
      SIMPLE_CONSULTING_INTAKE,
      { providerLabel: "Harbor Peak Automation LLC", clientLabel: "Red Mesa Logistics LLC" },
    );
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\bAI workflow\b/i);
    expect(text).not.toMatch(/\bworkflow mapping\b/i);
    expect(text).not.toMatch(/\bconfiguration planning\b/i);
    expect(text).not.toMatch(/\bACCEPTANCE AND DEMONSTRATION\b/i);
    expect(text).toMatch(/CONFIDENTIALITY/i);
    expect(text).toMatch(/GOVERNING LAW/i);
    expect(text).toMatch(/professional consulting/i);
  });

  it("preserves AI workflow language when intake explicitly requests it", () => {
    const corpus = contaminatedConsultingCorpus();
    const guarded = applyPaidProDomainScopeGuard(corpus, AI_WORKFLOW_INTAKE);
    expect(guarded).toMatch(/\bAI workflow\b/i);
    expect(guarded).toMatch(/workflow mapping/i);
  });

  it("does not inject AI workflow quality floor sections for Test372 consulting intake", () => {
    const corpus = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      "1. Services. Strategic business consulting.",
    ].join("\n");
    const out = applyAiWorkflowServicesQualityFloorToFallback(corpus, null, TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(out).not.toMatch(/ACCEPTANCE AND DEMONSTRATION REVIEW/i);
    expect(out).not.toMatch(/configured AI workflow setup/i);
  });

  it("commercial fact graph stays generic for simple consulting intake", () => {
    const draft = {
      title: "Services Agreement",
      purpose: "Simple consulting services",
      jurisdiction: "Texas",
      payment_terms: "$5,000",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
      parties: [
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
    } satisfies ParsedDraftShape;
    const graph = buildCommercialFactGraph(SIMPLE_CONSULTING_INTAKE, draft);
    expect(graph.agreementKind).toBe("services");
    expect(graph.deliverableType).toEqual([]);
    expect(graph.serviceActivity).not.toMatch(/AI workflow/i);
  });

  it("commercial fact graph stays AI-specific when intake requests AI workflow setup", () => {
    const draft = {
      title: "Services Agreement",
      purpose: "AI workflow setup",
      jurisdiction: "Texas",
      payment_terms: "$5,000",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
      parties: [
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
    } satisfies ParsedDraftShape;
    const graph = buildCommercialFactGraph(AI_WORKFLOW_INTAKE, draft);
    expect(graph.agreementKind).toBe("ai_workflow_services");
    expect(graph.deliverableType).toContain("workflow mapping");
  });

  it("review render sanitizer strips unsupported domain language for simple consulting", () => {
    const parties = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: "Red Mesa Logistics LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "alex@redmesa.com",
      recipient2Email: "jordan@harbor.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Alex", "Jordan"],
      partySignerTitles: ["CEO", "President"],
      partyAddresses: ["", ""],
    }).parties;
    const { text } = applyPaidProReviewRenderSanitizer(contaminatedConsultingCorpus(), parties, {
      intakeText: SIMPLE_CONSULTING_INTAKE,
    });
    expect(text).not.toMatch(/\bAI workflow\b/i);
    expect(text).not.toMatch(/\bACCEPTANCE AND DEMONSTRATION\b/i);
    expect(text).toMatch(/CONFIDENTIALITY/i);
  });
});
