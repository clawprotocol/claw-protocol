import { describe, expect, it } from "vitest";
import type { AgreementValidationResult } from "./premiumFullDraftApi";
import {
  buildPremiumFinalizationClarificationAnswers,
  premiumFinalizationAllowsSigning,
  resolvePremiumFinalizationDecision,
} from "./premiumFinalizationFlow";
import type { ProClarificationRoutingState } from "./proClarificationRouting";
import type { GuidedCompletionSession } from "./guidedDealCompletion/types";

function validation(passed: boolean): AgreementValidationResult {
  return {
    passed,
    failures: passed
      ? []
      : [{ code: "empty_required_section", message: "Empty section", severity: "high" }],
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

const noQuestions: ProClarificationRoutingState = {
  mode: "no_questions",
  message: "No additional clarification needed.",
  questions: [],
  skippedStaticFallback: true,
};

const materialQuestions: ProClarificationRoutingState = {
  mode: "material_questions",
  skippedStaticFallback: true,
  questions: [],
};

function session(answer = "Net 30 after invoice"): GuidedCompletionSession {
  return {
    variables: [
      {
        id: "agreement_intelligence_q_payment",
        category: "payment_timing",
        label: "Payment timing",
        question: "Should invoices be Net 15 or Net 30?",
        severity: "important",
        suggestedDefaults: [],
        agreementImpact: "Clarifies a material payment term.",
        requiredForExecution: true,
        applicableAgreementFamilies: ["generic_business_agreement"],
        uiControlType: "text",
        currentValue: null,
        confidence: 1,
        affectsSections: ["payment"],
      },
    ],
    queue: ["agreement_intelligence_q_payment"],
    answered: answer ? { agreement_intelligence_q_payment: answer } : {},
    skipped: new Set(),
    currentIndex: 0,
    completenessPercent: answer ? 100 : 0,
    agreementFamily: "generic_business_agreement",
  };
}

describe("premium finalization flow", () => {
  it("no_questions path skips finalization", () => {
    const decision = resolvePremiumFinalizationDecision({
      routing: noQuestions,
      agreementValidation: validation(true),
      session: null,
      firstDraft: "complete draft",
    });

    expect(decision.shouldFinalize).toBe(false);
    expect(decision.reason).toBe("not_needed");
  });

  it("material questions answered triggers finalization once per new signature", () => {
    const first = resolvePremiumFinalizationDecision({
      routing: materialQuestions,
      agreementValidation: validation(true),
      session: session(),
      firstDraft: "complete draft",
    });
    expect(first.shouldFinalize).toBe(true);
    expect(first.reason).toBe("clarifications_answered");

    const second = resolvePremiumFinalizationDecision({
      routing: materialQuestions,
      agreementValidation: validation(true),
      session: session(),
      firstDraft: "complete draft",
      previousSignature: first.signature,
    });
    expect(second.shouldFinalize).toBe(false);
    expect(second.reason).toBe("loop_guard");
  });

  it("validation_repair_needed triggers before signer handoff", () => {
    const decision = resolvePremiumFinalizationDecision({
      routing: {
        mode: "validation_repair_needed",
        message: "This draft needs a quality pass before signing.",
        questions: [],
        failureCodes: ["empty_required_section"],
        skippedStaticFallback: true,
      },
      agreementValidation: validation(false),
      session: null,
      firstDraft: "draft with TBD",
    });

    expect(decision.shouldFinalize).toBe(true);
    expect(decision.reason).toBe("validation_failed");
  });

  it("same snapshot/answers but changed draft gets a new signature", () => {
    const first = resolvePremiumFinalizationDecision({
      routing: materialQuestions,
      agreementValidation: validation(true),
      session: session("Net 30"),
      firstDraft: "draft one",
    });
    const second = resolvePremiumFinalizationDecision({
      routing: materialQuestions,
      agreementValidation: validation(true),
      session: session("Net 30"),
      firstDraft: "draft two",
      previousSignature: first.signature,
    });

    expect(second.shouldFinalize).toBe(true);
    expect(second.signature).not.toBe(first.signature);
  });

  it("builds clarification answer payload without unanswered variables", () => {
    expect(buildPremiumFinalizationClarificationAnswers(session(""))).toEqual([]);
    expect(buildPremiumFinalizationClarificationAnswers(session("Net 15"))).toEqual([
      {
        question_id: "agreement_intelligence_q_payment",
        question: "Should invoices be Net 15 or Net 30?",
        answer: "Net 15",
      },
    ]);
  });

  it("blocks signing when finalization repair did not succeed", () => {
    const base = {
      finalized: false,
      reason: "validation_failed" as const,
      document_text: "x".repeat(300),
      agreement_validation: validation(true),
      agreement_intelligence: {
        extracted_terms: { parties: [], party_roles: [] },
        ambiguities: [],
        conflicts: [],
        missing_material_terms: [],
        recommended_questions: [],
        quality_flags: [],
      },
      model_call_count: 1,
      repair_attempted: true,
      repair_succeeded: false,
    };

    expect(premiumFinalizationAllowsSigning(base)).toBe(false);
    expect(premiumFinalizationAllowsSigning({ ...base, finalized: true, repair_succeeded: true })).toBe(true);
    expect(
      premiumFinalizationAllowsSigning({
        ...base,
        finalized: true,
        repair_succeeded: true,
        agreement_validation: validation(false),
      }),
    ).toBe(false);
  });
});

