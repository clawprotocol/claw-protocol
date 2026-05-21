import { describe, expect, it } from "vitest";
import {
  buildBulkApplyChecklist,
  buildFinalAppliedAreaLabels,
  resolveGuidedQuestionConfig,
  resolveOptionDisplayCopy,
} from "./guidedQuestionConfig";
import { applyGuidedAnswerTransaction, buildGuidedSessionFromAgreement } from "./guidedCompletionEngine";
import { createGuidedCompletionSession } from "./variablePrioritizationLayer";
import { extractDealVariables } from "./missingVariableExtractor";

const INTAKE = "About $6k/month for automation. Client owns deliverables. Need support SLA.";

describe("guidedQuestionConfig", () => {
  it("maps payment_timing to fees checklist label", () => {
    const cfg = resolveGuidedQuestionConfig("payment_timing");
    expect(cfg.bulkApplyChecklistLabel).toMatch(/Fees/i);
    expect(cfg.finalAppliedAreaLabel).toMatch(/Fees/i);
  });

  it("resolveOptionDisplayCopy returns distinct why and lawDogWill", () => {
    const copy = resolveOptionDisplayCopy({
      variableId: "payment_timing",
      pillId: "monthly",
      pillLabel: "$6,000/month",
      pillValue: "6000 monthly",
      intakeRaw: INTAKE,
    });
    expect(copy.why).toBeTruthy();
    expect(copy.lawDogWill).toMatch(/LawDog will|Section 2|Fees/i);
    expect(copy.lawDogWill).not.toBe(copy.why);
  });

  it("buildFinalAppliedAreaLabels dedupes areas", () => {
    const variables = extractDealVariables({
      intakeRaw: INTAKE,
      body: "1. S\n2. F\n3. C\n4. IP\n5. SLA\n6. T",
    });
    let session = createGuidedCompletionSession({
      variables: variables.slice(0, 3),
      agreementFamily: "generic_business_agreement",
      bodyLen: 200,
    });
    if (!session) return;
    session = applyGuidedAnswerTransaction(session, session.queue[0], "a", 200);
    session = applyGuidedAnswerTransaction(session, session.queue[1], "b", 200);
    const areas = buildFinalAppliedAreaLabels(session);
    expect(areas.length).toBeGreaterThan(0);
    expect(new Set(areas).size).toBe(areas.length);
  });

  it("buildBulkApplyChecklist returns checklist rows", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: INTAKE,
      body: "1. S\n2. F\n3. C\n4. IP\n5. SLA\n6. T",
    });
    if (!session) return;
    const items = buildBulkApplyChecklist(session);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].label.length).toBeGreaterThan(2);
  });
});
