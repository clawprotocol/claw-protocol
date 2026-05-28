import { describe, expect, it } from "vitest";
import { friendlyLowConfidenceCopy } from "./friendlyProCompletionCopy";
import { guidedSessionIntro, importantVariableCount } from "./guidedCompletionEngine";
import { resolveGuidedCompletionRenderState } from "./resolveGuidedCompletionRenderState";
import { buildGuidedCompletionIntro, createGuidedCompletionSession } from "./variablePrioritizationLayer";
import {
  INTERNAL_GUIDED_REPAIR_VARIABLE_ID,
  shouldShowGuidedSessionIntro,
} from "./userAnswerableGuidedQuestion";
import type { DealVariable } from "./types";
import { MINIMAL_SERVICES_INTAKE } from "../paidProMinimalServicesAcceptance.test";

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

describe("guided completion intro null safety", () => {
  it("buildGuidedCompletionIntro(null) returns null", () => {
    expect(buildGuidedCompletionIntro(null)).toBeNull();
    expect(buildGuidedCompletionIntro(undefined)).toBeNull();
  });

  it("guidedSessionIntro and importantVariableCount tolerate null session", () => {
    expect(() => guidedSessionIntro(null)).not.toThrow();
    expect(guidedSessionIntro(null)).toBeNull();
    expect(importantVariableCount(null)).toBe(0);
  });

  it("empty queue session does not show intro", () => {
    const empty = {
      variables: [],
      queue: [],
      answered: {},
      skipped: new Set<string>(),
      currentIndex: 0,
      completenessPercent: 0,
      agreementFamily: "generic_business_agreement" as const,
    };
    expect(shouldShowGuidedSessionIntro(empty)).toBe(false);
    expect(buildGuidedCompletionIntro(empty)).toBeNull();
  });

  it("validation repair pseudo-question does not mount intro", () => {
    const session = createGuidedCompletionSession({
      variables: [repairPseudoVariable()],
      agreementFamily: "generic_business_agreement",
      bodyLen: 900,
    });
    expect(session).toBeNull();
    expect(shouldShowGuidedSessionIntro(null)).toBe(false);
  });

  it("friendlyLowConfidenceCopy with null session and canRender true does not throw", () => {
    expect(() =>
      friendlyLowConfidenceCopy(null, { canRenderGuidedQuestions: true }),
    ).not.toThrow();
    const copy = friendlyLowConfidenceCopy(null, { canRenderGuidedQuestions: true });
    expect(copy.title).toMatch(/ready to review/i);
  });

  it("accepted Pro with explicit null guided session does not auto-build render queue", () => {
    const body = "x".repeat(3200);
    const state = resolveGuidedCompletionRenderState({
      bodyUsable: true,
      bodyText: body,
      intakeText: MINIMAL_SERVICES_INTAKE,
      guidedSession: null,
      panelMountedSurface: "document_editor",
      paidProAuthoritativeCorpusReady: true,
    });
    expect(state.sessionHasRenderableQueue).toBe(false);
    expect(state.canRenderGuidedQuestions).toBe(false);
  });

  it("material guided question still produces intro copy", () => {
    const session = createGuidedCompletionSession({
      variables: [materialTextQuestion()],
      agreementFamily: "generic_business_agreement",
      bodyLen: 900,
    });
    expect(session).not.toBeNull();
    expect(shouldShowGuidedSessionIntro(session)).toBe(true);
    const intro = guidedSessionIntro(session);
    expect(intro?.subline).toMatch(/Net 15|still need/i);
    expect(importantVariableCount(session)).toBeGreaterThan(0);
  });
});
