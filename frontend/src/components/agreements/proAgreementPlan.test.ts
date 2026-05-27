import { describe, expect, it } from "vitest";
import {
  deriveGuidedQuestionsFromPlan,
  renderPaymentClauseFromPlan,
  renderSupportClauseFromPlan,
  selectSafeClauseCandidate,
  validateClauseCandidate,
  validateProAgreementPlan,
  type ProAgreementPlan,
} from "./proAgreementPlan";
import { renderPaymentSection, renderSupportSection } from "./proCommercialProseRenderer";

const TEST102_INTAKE = `
ABC LLC hires Jordan Lee Consulting for AI workflow implementation, dashboard setup, automation support, onboarding assistance, and light ongoing maintenance.
ABC LLC is Client. Jordan Lee Consulting is Service Provider.
$120,000 total project fee. Oklahoma law. No guaranteed third-party AI uptime. 30 days written notice.
`.trim();

const PLAN: ProAgreementPlan = {
  archetype: "ai_automation_services",
  parties: {
    client: { legalName: "ABC LLC", roleLabel: "Client" },
    serviceProvider: { legalName: "Jordan Lee Consulting", roleLabel: "Service Provider" },
    partiesLabel: "Parties",
  },
  commercialFacts: {
    totalProjectFee: "$120,000",
    governingLaw: "Oklahoma law",
    supportModel: "automation support and onboarding assistance, without guaranteed third-party AI uptime",
    terminationNotice: "30 days written notice",
  },
  clauseIntents: ["payment_amount", "ownership_terms", "support_expectations", "governing_law"],
  missingQuestions: [
    { id: "governing_law_notice", semanticIntent: "governing_law", question: "Which state's law governs?" },
    { id: "standard_terms", semanticIntent: "standard_terms", question: "Should standard terms be included?" },
  ],
  style: "plain business prose",
  clauseCandidates: [
    {
      intent: "payment_amount",
      ownerSection: "fees",
      text: "Client will pay Service Provider a total project fee of $120,000 for the services described in this Agreement.",
      requiredFacts: ["$120,000"],
      prohibitedFacts: ["Net 30"],
    },
    {
      intent: "support_expectations",
      ownerSection: "support",
      text: "Service Provider will provide automation support and onboarding assistance, with no guaranteed third-party AI platform uptime.",
      requiredFacts: ["automation support", "onboarding assistance", "third-party AI platform uptime"],
      prohibitedFacts: ["99.9% uptime"],
    },
  ],
};

describe("proAgreementPlan", () => {
  it("validates a safe OpenAI-assisted plan and selects candidate prose through LawDog gates", () => {
    const validation = validateProAgreementPlan(PLAN);
    expect(validation.ok).toBe(true);
    expect(validation.safeClauseCandidates).toHaveLength(2);

    const payment = renderPaymentClauseFromPlan(PLAN, {
      clientRoleLabel: "Client",
      serviceProviderRoleLabel: "Service Provider",
      amount: "$120,000",
    });
    expect(payment.source).toBe("candidate");
    expect(payment.text).toBe("Client will pay Service Provider a total project fee of $120,000 for the services described in this Agreement.");
    expect(payment.text).not.toMatch(/applicable Party|commercial terms include/i);

    const support = renderSupportClauseFromPlan(PLAN, {
      serviceProviderRoleLabel: "Service Provider",
      supportDescription: "automation support",
    });
    expect(support.source).toBe("candidate");
    expect(support.text).toMatch(/Service Provider will provide automation support and onboarding assistance/i);
  });

  it("rejects unsafe candidate prose and falls back to deterministic renderers", () => {
    const unsafe: ProAgreementPlan = {
      ...PLAN,
      archetype: "marketing_services",
      clauseCandidates: [
        {
          intent: "payment_amount",
          ownerSection: "support",
          text: "The applicable Party will pay under standard terms. The commercial terms include $120,000.",
          requiredFacts: ["$120,000"],
          prohibitedFacts: ["standard terms"],
        },
      ],
    };
    const fallback = renderPaymentSection({
      clientRoleLabel: "Client",
      serviceProviderRoleLabel: "Service Provider",
      amount: "$120,000",
    });
    const selected = selectSafeClauseCandidate({
      plan: unsafe,
      intent: "payment_amount",
      ownerSection: "fees",
      fallbackText: fallback,
    });
    expect(selected.source).toBe("deterministic");
    expect(selected.text).toBe(fallback);
    expect(selected.text).not.toMatch(/applicable Party|commercial terms include/i);

    const candidateValidation = validateClauseCandidate(unsafe.clauseCandidates![0], unsafe);
    expect(candidateValidation.defects).toContain("owner_section_mismatch");
    expect(candidateValidation.defects).toContain("generic_renderer_language");
    expect(candidateValidation.defects).toContain("prohibited_fact_present:standard terms");
  });

  it("rejects forbidden archetype facts and unsupported assumptions", () => {
    const unsafe: ProAgreementPlan = {
      ...PLAN,
      clauseCandidates: [
        {
          intent: "ownership_terms",
          ownerSection: "ownership",
          text: "Client owns hardware and pays data center site costs.",
          requiredFacts: ["hardware"],
          prohibitedFacts: ["hardware"],
        },
      ],
    };
    const validation = validateClauseCandidate(unsafe.clauseCandidates![0], unsafe);
    expect(validation.ok).toBe(false);
    expect(validation.defects).toContain("prohibited_fact_present:hardware");
    expect(validation.defects.some((defect) => defect.startsWith("forbidden_archetype_fact:"))).toBe(true);

    const selected = renderSupportClauseFromPlan(unsafe, {
      serviceProviderRoleLabel: "Service Provider",
      supportDescription: "automation support and onboarding assistance",
    });
    expect(selected.source).toBe("deterministic");
    expect(selected.text).toBe(
      renderSupportSection({
        serviceProviderRoleLabel: "Service Provider",
        supportDescription: "automation support and onboarding assistance, without guaranteed third-party AI uptime",
      }),
    );
  });

  it("dedupes guided questions and suppresses facts already stated in test102 intake", () => {
    const derived = deriveGuidedQuestionsFromPlan({
      plan: PLAN,
      intakeText: TEST102_INTAKE,
      deterministicVariables: [
        {
          id: "governing_venue",
          category: "governing_law",
          label: "Venue",
          question: "What venue should apply?",
          severity: "important",
          suggestedDefaults: [],
          agreementImpact: "test",
          requiredForExecution: false,
          applicableAgreementFamilies: ["services_agreement"],
          uiControlType: "pills",
          currentValue: null,
          confidence: 0.5,
          affectsSections: [],
        },
      ],
    });
    expect(derived.variables.map((v) => v.id)).not.toContain("governing_law_notice");
    expect(derived.variables.map((v) => v.id)).not.toContain("standard_terms");
    expect(derived.variables.map((v) => v.id)).not.toContain("governing_venue");
    expect(derived.blockedRepeatIds).toContain("governing_venue");
  });

  it("detects duplicate semantic intents in plans", () => {
    const result = validateProAgreementPlan({ ...PLAN, clauseIntents: ["payment_amount", "payment amount"] });
    expect(result.ok).toBe(false);
    expect(result.defects).toContain("duplicate_semantic_intent:payment_amount");
  });
});
