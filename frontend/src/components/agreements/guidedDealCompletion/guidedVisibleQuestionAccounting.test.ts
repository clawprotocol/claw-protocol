import { describe, expect, it } from "vitest";
import { applyGuidedAnswerTransaction, skipGuidedVariable } from "./guidedCompletionEngine";
import { createGuidedCompletionSession } from "./variablePrioritizationLayer";
import { extractDealVariables } from "./missingVariableExtractor";
import {
  computeGuidedVisibleQuestionAccounting,
  formatGuidedProgressLabel,
} from "./guidedVisibleQuestionAccounting";

const INTAKE = "Monthly support $6k with client owning IP.";

function sessionWithFive() {
  const variables = extractDealVariables({
    intakeRaw: INTAKE,
    body: "1. SERVICES\n\n2. FEES\n\n3. CONF\n\n4. IP\n\n5. SLA\n\n6. TERM",
  });
  return createGuidedCompletionSession({
    variables: variables.slice(0, 5),
    agreementFamily: "generic_business_agreement",
    bodyLen: 400,
  });
}

describe("guidedVisibleQuestionAccounting", () => {
  it("counts skips in resolved progress", () => {
    const session = sessionWithFive();
    if (!session) return;
    const first = session.queue[0];
    let next = skipGuidedVariable(session, first);
    const accounting = computeGuidedVisibleQuestionAccounting(next);
    expect(accounting.skippedVisibleQuestionCount).toBe(1);
    expect(accounting.resolvedVisibleQuestionCount).toBe(1);
    expect(formatGuidedProgressLabel(accounting)).toBe(
      `1 of ${accounting.visibleQuestionCount} completed`,
    );
  });

  it("marks collection complete when all visible questions answered or skipped", () => {
    const session = sessionWithFive();
    if (!session) return;
    let next = session;
    for (const id of next.queue) {
      if (computeGuidedVisibleQuestionAccounting(next).visibleQuestions.some((q) => q.id === id)) {
        next = applyGuidedAnswerTransaction(next, id, "Choice", 400);
      }
    }
    expect(computeGuidedVisibleQuestionAccounting(next).isCollectionComplete).toBe(true);
  });
});
