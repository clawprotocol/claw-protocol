import { describe, expect, it } from "vitest";
import type { AgreementIntelligence, AgreementValidationResult } from "./premiumFullDraftApi";
import {
  resolveProClarificationRouting,
  shouldUseProIntelligenceClarificationRouting,
} from "./proClarificationRouting";

function intelligence(over: Partial<AgreementIntelligence> = {}): AgreementIntelligence {
  return {
    extracted_terms: {
      parties: [
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
      party_roles: [
        { party_name: "Red Mesa Logistics LLC", role: "Client" },
        { party_name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
      governing_law: "Texas",
    },
    ambiguities: [],
    conflicts: [],
    missing_material_terms: [],
    recommended_questions: [],
    quality_flags: [],
    ...over,
  };
}

function validation(passed = true): AgreementValidationResult {
  return {
    passed,
    failures: passed
      ? []
      : [
          {
            code: "empty_required_section",
            message: "Draft contains an empty required section.",
            severity: "high",
          },
        ],
    warnings: [],
    minimum_contract_elements: {
      identifiable_parties: true,
      agreement_purpose_or_scope: true,
      exchange_of_value_or_consideration: true,
      obligations_or_performance: true,
      execution_or_acceptance_mechanism: true,
    },
    summary: {
      failure_count: passed ? 0 : 1,
      warning_count: 0,
      checked_at: "2026-05-27T00:00:00.000Z",
    },
  };
}

describe("shouldUseProIntelligenceClarificationRouting", () => {
  it("returns false when neither intelligence nor validation are credible", () => {
    expect(
      shouldUseProIntelligenceClarificationRouting({
        agreementIntelligence: null,
        agreementValidation: null,
      }),
    ).toBe(false);
    expect(
      shouldUseProIntelligenceClarificationRouting({
        agreementValidation: { passed: true } as AgreementValidationResult,
      }),
    ).toBe(false);
  });

  it("returns true when premium validation or intelligence payloads are present", () => {
    expect(
      shouldUseProIntelligenceClarificationRouting({
        agreementIntelligence: intelligence(),
        agreementValidation: null,
      }),
    ).toBe(true);
    expect(
      shouldUseProIntelligenceClarificationRouting({
        agreementIntelligence: null,
        agreementValidation: validation(true),
      }),
    ).toBe(true);
  });
});

describe("resolveProClarificationRouting", () => {
  it("falls back to legacy static guided extraction without credible routing inputs", () => {
    const state = resolveProClarificationRouting({
      agreementValidation: { passed: true } as AgreementValidationResult,
      intakeText: "Texas governing law.",
    });

    expect(state.mode).toBe("legacy_static_fallback_allowed");
    expect(state.skippedStaticFallback).toBe(false);
  });

  it("skips Q&A when Texas governing law is supplied and validation passes", () => {
    const state = resolveProClarificationRouting({
      agreementIntelligence: intelligence(),
      agreementValidation: validation(true),
      intakeText: "AI services agreement. Texas governing law.",
    });

    expect(state.mode).toBe("no_questions");
    expect(state.questions).toHaveLength(0);
  });

  it("complete AI automation intake reaches signer path with zero questions", () => {
    const state = resolveProClarificationRouting({
      agreementIntelligence: intelligence({
        extracted_terms: {
          ...intelligence().extracted_terms,
          payment_terms: {
            total_amount: "$95,000",
            currency: "USD",
            milestones: [
              { label: "Kickoff", percentage: "50%" },
              { label: "Rollout", percentage: "25%" },
              { label: "Acceptance", percentage: "25%" },
            ],
            recurring_support: { amount: "$4,500", cadence: "month" },
          },
          third_party_dependency_terms: { included: true, uptime_disclaimer: true },
          electronic_signatures: true,
        },
      }),
      agreementValidation: validation(true),
      intakeText:
        "Red Mesa / Harbor Peak. $95,000 split 50/25/25, $4,500/mo support, Texas law, no AI uptime guarantee.",
    });

    expect(state.mode).toBe("no_questions");
    expect(state.questions).toHaveLength(0);
  });

  it("shows ambiguous support renewal question only", () => {
    const state = resolveProClarificationRouting({
      agreementIntelligence: intelligence({
        ambiguities: [
          {
            id: "amb_support_renewal",
            topic: "support renewal",
            description: "Support renewal behavior is unclear.",
            severity: "medium",
          },
        ],
        recommended_questions: [
          {
            id: "q_support_renewal",
            topic: "support renewal",
            question: "Does optional support renew month-to-month until cancelled?",
            reason: "Ambiguity: support renewal is unclear.",
            priority: "medium",
          },
        ],
      }),
      agreementValidation: validation(true),
      intakeText: "Optional $4,500/mo support.",
    });

    expect(state.mode).toBe("material_questions");
    expect(state.questions).toHaveLength(1);
    expect(state.questions[0].category).toBe("support");
  });

  it("shows conflict clarification question", () => {
    const state = resolveProClarificationRouting({
      agreementIntelligence: intelligence({
        conflicts: [
          {
            id: "conf_net_terms",
            topic: "payment timing",
            description: "Net 15 and Net 45 both appear.",
            conflicting_values: ["Net 15", "Net 45"],
            severity: "high",
          },
        ],
        recommended_questions: [
          {
            id: "q_net_terms",
            topic: "payment timing",
            question: "Should invoices be due Net 15 or Net 45?",
            reason: "Conflict detected between payment timing terms.",
            priority: "high",
          },
        ],
      }),
      agreementValidation: validation(true),
    });

    expect(state.mode).toBe("material_questions");
    expect(state.questions[0].question).toContain("Net 15");
    expect(state.questions[0].requiredForExecution).toBe(true);
  });

  it("validation failure shows controlled repair-needed state only", () => {
    const state = resolveProClarificationRouting({
      agreementIntelligence: intelligence({
        recommended_questions: [
          {
            id: "q_governing_law",
            topic: "governing law",
            question: "What governing law should apply?",
            reason: "Static fallback.",
            priority: "medium",
          },
        ],
      }),
      agreementValidation: validation(false),
      intakeText: "Texas law.",
    });

    expect(state.mode).toBe("validation_repair_needed");
    expect(state.questions).toHaveLength(1);
    expect(state.questions[0].question).toBe("This draft needs a quality pass before signing.");
  });

  it("prevents static governing-law fallback when law supplied", () => {
    const state = resolveProClarificationRouting({
      agreementIntelligence: intelligence({
        recommended_questions: [
          {
            id: "q_governing_law",
            topic: "governing law",
            question: "What governing law should apply?",
            reason: "Missing governing law.",
            priority: "medium",
          },
        ],
      }),
      agreementValidation: validation(true),
      intakeText: "Texas governing law.",
    });

    expect(state.mode).toBe("no_questions");
    expect(JSON.stringify(state.questions)).not.toMatch(/What governing law should apply/i);
  });

  it("requires change confirmation for questions that change extracted law", () => {
    const state = resolveProClarificationRouting({
      agreementIntelligence: intelligence({
        recommended_questions: [
          {
            id: "q_change_law",
            topic: "governing law",
            question: "Should governing law be Delaware instead?",
            reason: "Conflict: draft and extracted terms differ.",
            priority: "high",
          },
        ],
      }),
      agreementValidation: validation(true),
      intakeText: "Texas governing law.",
    });

    expect(state.mode).toBe("material_questions");
    expect(state.questions[0].question).toContain("previously provided Texas governing law");
  });
});
