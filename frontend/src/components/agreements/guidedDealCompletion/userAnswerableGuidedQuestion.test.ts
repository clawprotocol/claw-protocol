import { describe, expect, it } from "vitest";
import {
  INTERNAL_GUIDED_REPAIR_VARIABLE_ID,
  isInternalGuidedRepairVariable,
  isUserAnswerableGuidedQuestion,
  stripNonAnswerableFromGuidedSession,
} from "./userAnswerableGuidedQuestion";
import { createGuidedCompletionSession } from "./variablePrioritizationLayer";
import {
  computeGuidedVisibleQuestionAccounting,
  buildVisibleQuestionList,
} from "./guidedVisibleQuestionAccounting";
import { resolveGuidedCompletionRenderState } from "./resolveGuidedCompletionRenderState";
import type { DealVariable } from "./types";

function repairPseudoVariable(): DealVariable {
  return {
    id: INTERNAL_GUIDED_REPAIR_VARIABLE_ID,
    category: "general",
    label: "Quality pass required",
    question: "This draft needs a quality pass before signing.",
    severity: "important",
    suggestedDefaults: [],
    agreementImpact: "Validation failures",
    requiredForExecution: true,
    applicableAgreementFamilies: ["generic_business_agreement"],
    uiControlType: "text",
    currentValue: null,
    confidence: 1,
    affectsSections: [],
    semanticIntent: "validation_repair_needed",
  };
}

function materialTextQuestion(): DealVariable {
  return {
    id: "agreement_intelligence_q_net",
    category: "payment_timing",
    label: "payment timing",
    question: "Should invoices be due Net 15 or Net 45?",
    severity: "important",
    suggestedDefaults: [],
    agreementImpact: "Conflict detected between payment timing terms.",
    requiredForExecution: true,
    applicableAgreementFamilies: ["generic_business_agreement"],
    uiControlType: "text",
    currentValue: null,
    confidence: 0.9,
    affectsSections: ["payment timing"],
    semanticIntent: "payment timing",
  };
}

describe("userAnswerableGuidedQuestion", () => {
  it("treats validation repair pseudo-question as non-answerable", () => {
    const repair = repairPseudoVariable();
    expect(isInternalGuidedRepairVariable(repair)).toBe(true);
    expect(isUserAnswerableGuidedQuestion(repair)).toBe(false);
  });

  it("never counts repair pseudo-question as a visible guided question", () => {
    const session = createGuidedCompletionSession({
      variables: [repairPseudoVariable()],
      agreementFamily: "generic_business_agreement",
      bodyLen: 900,
    });
    expect(session).toBeNull();
  });

  it("still renders material recommended text questions", () => {
    const session = createGuidedCompletionSession({
      variables: [materialTextQuestion()],
      agreementFamily: "generic_business_agreement",
      bodyLen: 900,
    });
    expect(session).not.toBeNull();
    const accounting = computeGuidedVisibleQuestionAccounting(session!);
    expect(accounting.visibleQuestionCount).toBe(1);
    expect(buildVisibleQuestionList(session!)).toHaveLength(1);
    const render = resolveGuidedCompletionRenderState({
      bodyUsable: true,
      bodyText: "x".repeat(600),
      guidedSession: session,
      panelMountedSurface: "document_editor",
    });
    expect(render.sessionHasRenderableQueue).toBe(true);
    expect(render.unresolvedRenderableCount).toBe(1);
  });

  it("strips repair pseudo-questions from persisted sessions", () => {
    const material = materialTextQuestion();
    const base = createGuidedCompletionSession({
      variables: [material],
      agreementFamily: "generic_business_agreement",
      bodyLen: 900,
    });
    expect(base).not.toBeNull();
    const polluted = {
      ...base!,
      variables: [repairPseudoVariable(), material],
      queue: [INTERNAL_GUIDED_REPAIR_VARIABLE_ID, material.id],
      frozenTotalQuestions: 2,
    };
    const stripped = stripNonAnswerableFromGuidedSession(polluted);
    expect(stripped?.queue).toEqual([material.id]);
    expect(stripped?.variables.map((v) => v.id)).toEqual([material.id]);
  });
});
