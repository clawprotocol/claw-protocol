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

  const HARBOR_INTAKE =
    "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. Fixed fee $48,000. Term twelve months starting October 1, 2026. Governing law Delaware. Consultant owns pre-existing tools; Client owns deliverables after payment.";

  it("keeps supplied AI workflow scope and does not introduce Service Provider", () => {
    const liveServer = [
      "1. Services",
      "Consultant will provide consulting and implementation support services to Client focused on AI workflow implementation during the Term. The services are advisory and implementation-related in nature and may include planning, configuration support, workflow design, process recommendations, documentation, and related deliverables created for Client in connection with Client’s AI workflow implementation needs, as agreed by the parties in writing from time to time.",
      "",
      "2. Term",
      "The term of this Agreement begins on October 1, 2026 and continues for twelve (12) months unless earlier terminated in accordance with this Agreement.",
    ].join("\n");
    const { text, repairs } = sanitizePaidProDomainScopeContamination(liveServer, HARBOR_INTAKE, {
      providerLabel: "Harbor Peak Analytics LLC",
      clientLabel: "Ironvale Manufacturing Inc.",
    });
    expect(text).toMatch(/AI workflow implementation/i);
    expect(text).not.toMatch(/Service Provider will perform professional consulting/i);
    expect(text).not.toMatch(/configuration support/i);
    expect(repairs.length).toBeGreaterThan(0);
  });

  it("strips unsupported additions from a mixed valid-scope section", () => {
    const mixed = [
      "1. Services",
      "Consultant will perform AI workflow implementation and also manage CRM campaigns, sales outreach, and configuration support.",
      "",
      "2. Term",
      "The term is twelve (12) months.",
    ].join("\n");
    const { text, repairs } = sanitizePaidProDomainScopeContamination(mixed, HARBOR_INTAKE);
    expect(text).toMatch(/AI workflow implementation/i);
    expect(text).not.toMatch(/CRM campaigns/i);
    expect(text).not.toMatch(/sales outreach/i);
    expect(text).not.toMatch(/configuration support/i);
    expect(text).not.toMatch(/\bplanning\b/i);
    expect(text).not.toMatch(/Service Provider will perform professional consulting/i);
    expect(repairs).toContain("stripped_unsupported_scope_additions");
    const leftover = detectUnsupportedDomainContamination(text, HARBOR_INTAKE);
    expect(leftover.ruleIds).not.toEqual(expect.arrayContaining(["crm_campaigns", "sales_outreach", "configuration_support"]));
  });

  it("does not record a cleanup when AI workflow setup early-return leaves configuration support", () => {
    const corpus = [
      "1. Services",
      "Consultant will perform AI workflow setup and configuration support.",
      "",
      "2. Term",
      "The term is twelve (12) months.",
    ].join("\n");
    const { text, repairs } = sanitizePaidProDomainScopeContamination(corpus, AI_WORKFLOW_INTAKE);
    expect(text).toMatch(/AI workflow setup/i);
    expect(text).not.toMatch(/configuration support/i);
    expect(text).not.toMatch(/\bplanning\b/i);
    expect(repairs.length).toBeGreaterThan(0);
    expect(detectUnsupportedDomainContamination(text, AI_WORKFLOW_INTAKE).ruleIds).not.toContain(
      "configuration_support",
    );
  });

  it("keeps CRM and campaign work when the customer actually requested it", () => {
    const crmIntake = `${HARBOR_INTAKE} Client also asks Consultant to manage CRM campaigns and sales outreach.`;
    const mixed = [
      "1. Services",
      "Consultant will perform AI workflow implementation and also manage CRM campaigns, sales outreach, and configuration support.",
      "",
      "2. Term",
      "The term is twelve (12) months.",
    ].join("\n");
    const { text } = sanitizePaidProDomainScopeContamination(mixed, crmIntake);
    expect(text).toMatch(/AI workflow implementation/i);
    expect(text).toMatch(/CRM campaigns/i);
    expect(text).toMatch(/sales outreach/i);
    expect(text).not.toMatch(/configuration support/i);
  });

  it("still replaces a fully unsupported consulting section with neutral language", () => {
    const { text } = sanitizePaidProDomainScopeContamination(
      contaminatedConsultingCorpus(),
      SIMPLE_CONSULTING_INTAKE,
      { providerLabel: "Harbor Peak Automation LLC", clientLabel: "Red Mesa Logistics LLC" },
    );
    expect(text).not.toMatch(/\bAI workflow\b/i);
    expect(text).toMatch(/professional consulting/i);
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
