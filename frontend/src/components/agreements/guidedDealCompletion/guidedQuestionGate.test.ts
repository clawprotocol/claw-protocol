import { describe, expect, it } from "vitest";
import type { DealVariable, GuidedCompletionSession } from "./types";
import {
  countUnresolvedGuidedQuestions,
  isFatalGuidedDealVariable,
  resolveGuidedQuestionGateDecision,
} from "./guidedQuestionGate";
import { SEND_HANDOFF_AUTHORITATIVE_MIN_LEN } from "../paidProAuthorityConstants";

const RED_MESA_INTAKE =
  "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup services. Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.";

const RED_MESA_BODY =
  "AI WORKFLOW SETUP SERVICES AGREEMENT\n\n" +
  "Between Red Mesa Logistics LLC and Harbor Peak Automation LLC.\n" +
  "Fee: $5,000. Texas law. Electronic signatures allowed.\n" +
  " ".repeat(SEND_HANDOFF_AUTHORITATIVE_MIN_LEN);

function variable(partial: Partial<DealVariable> & Pick<DealVariable, "id" | "question">): DealVariable {
  return {
    category: partial.category ?? "general",
    label: partial.label ?? partial.id,
    severity: partial.severity ?? "important",
    suggestedDefaults: partial.suggestedDefaults ?? [{ id: "a", label: "A", value: "A" }],
    agreementImpact: "",
    requiredForExecution: partial.requiredForExecution ?? false,
    applicableAgreementFamilies: ["consulting_agreement"],
    uiControlType: "pills",
    currentValue: null,
    confidence: 0.5,
    affectsSections: [],
    ...partial,
  };
}

function sessionWith(vars: DealVariable[]): GuidedCompletionSession {
  return {
    variables: vars,
    queue: vars.map((v) => v.id),
    answered: {},
    skipped: new Set(),
    currentIndex: 0,
    completenessPercent: 0,
    agreementFamily: "consulting_agreement",
  };
}

describe("guidedQuestionGate", () => {
  it("treats signer email and support questions as optional", () => {
    expect(
      isFatalGuidedDealVariable(
        variable({
          id: "signer_email",
          category: "notices",
          question: "What signer email should we use for Party 1?",
          severity: "important",
        }),
      ),
    ).toBe(false);
    expect(
      isFatalGuidedDealVariable(
        variable({
          id: "support",
          category: "support",
          question: "What support period should apply after go-live?",
          severity: "important",
        }),
      ),
    ).toBe(false);
  });

  it("treats missing payment as fatal when required", () => {
    expect(
      isFatalGuidedDealVariable(
        variable({
          id: "pay",
          category: "compensation",
          question: "What is the total payment amount for this agreement?",
          severity: "critical",
          requiredForExecution: true,
        }),
      ),
    ).toBe(true);
  });

  it("Red Mesa Pro with only optional guided questions allows material review", () => {
    const session = sessionWith([
      variable({
        id: "o1",
        category: "support",
        question: "How long should post-launch support continue?",
        severity: "optional",
      }),
      variable({
        id: "o2",
        category: "ip_ownership",
        question: "Should ownership nuance include background IP carve-outs?",
        severity: "optional",
      }),
    ]);
    const decision = resolveGuidedQuestionGateDecision({
      session,
      corpusLen: RED_MESA_BODY.length,
      intakeText: RED_MESA_INTAKE,
      bodyText: RED_MESA_BODY,
    });
    expect(decision.optionalCount).toBe(2);
    expect(decision.fatalCount).toBe(0);
    expect(decision.blocked).toBe(false);
    expect(decision.materialReviewAllowed).toBe(true);
  });

  it("fatal party gap blocks when corpus is not material", () => {
    const session = sessionWith([
      variable({
        id: "party",
        category: "general",
        question: "Who are the parties to this agreement?",
        severity: "critical",
        requiredForExecution: true,
      }),
    ]);
    const decision = resolveGuidedQuestionGateDecision({
      session,
      corpusLen: 120,
      intakeText: "draft an agreement",
      bodyText: "short stub",
    });
    expect(decision.fatalCount).toBe(1);
    expect(decision.blocked).toBe(true);
    expect(decision.materialReviewAllowed).toBe(false);
  });

  it("countUnresolvedGuidedQuestions splits fatal vs optional", () => {
    const session = sessionWith([
      variable({
        id: "f1",
        category: "compensation",
        question: "What payment amount applies?",
        severity: "critical",
        requiredForExecution: true,
      }),
      variable({
        id: "o1",
        category: "support",
        question: "Preferred support period?",
        severity: "optional",
      }),
    ]);
    const counts = countUnresolvedGuidedQuestions(session);
    expect(counts.fatalCount).toBe(1);
    expect(counts.optionalCount).toBe(1);
  });
});
