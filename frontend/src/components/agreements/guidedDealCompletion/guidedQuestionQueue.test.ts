import { describe, expect, it } from "vitest";
import {
  buildStableGuidedQuestionQueue,
  logGuidedQuestionDedupe,
  logGuidedQuestionQueueBuilt,
  logGuidedQuestionRepeatBlocked,
} from "./guidedQuestionQueue";
import type { DealVariable } from "./types";

function varStub(id: string, label: string, question: string): DealVariable {
  return {
    id,
    category: "compensation",
    label,
    question,
    severity: "important",
    suggestedDefaults: [],
    agreementImpact: "test",
    requiredForExecution: true,
    applicableAgreementFamilies: ["services_agreement"],
    uiControlType: "pills",
    currentValue: null,
    confidence: 0.5,
    affectsSections: ["Fees"],
  };
}

describe("buildStableGuidedQuestionQueue", () => {
  it("dedupes fee family ids and logs queue built", () => {
    const vars = [
      varStub("project_fee_phase_confirmation", "Project fee", "Confirm total project fee and phase split?"),
      varStub("total_fee_confirmation", "Total fee", "What is the total contract fee and currency?"),
      varStub("phase_payment_allocation", "Phase allocation", "How should fees split across phases?"),
      varStub("saas_sla", "SLA", "What support hours and uptime target apply?"),
      varStub("ip_ownership", "IP", "Who should own the work product?"),
      varStub("renewal_notice", "Renewal", "How much notice is required before renewal?"),
    ];
    const result = buildStableGuidedQuestionQueue({ variables: vars });
    expect(result.queue).toContain("project_fee_phase_confirmation");
    expect(result.queue).not.toContain("total_fee_confirmation");
    expect(result.queue.length).toBeLessThanOrEqual(5);
    expect(result.removedIds.length + result.blockedRepeatIds.length).toBeGreaterThanOrEqual(0);
    logGuidedQuestionQueueBuilt({ total: 6, visible: result.queue.length, ids: result.queue });
    logGuidedQuestionDedupe({ removedIds: ["total_fee_confirmation"] });
    logGuidedQuestionRepeatBlocked({ variableId: "total_fee_confirmation" });
  });

  it("blocks re-queuing answered variable ids", () => {
    const vars = [
      varStub("total_fee_confirmation", "Total fee", "What is the total contract fee?"),
      varStub("payment_timing", "Invoice timing", "When are invoices due?"),
    ];
    const result = buildStableGuidedQuestionQueue({
      variables: vars,
      answered: { total_fee_confirmation: "$120,000 USD" },
    });
    expect(result.queue).not.toContain("total_fee_confirmation");
    expect(result.blockedRepeatIds).toContain("total_fee_confirmation");
  });

  it("never shrinks visible progress by reinserting skipped ids", () => {
    const vars = [
      varStub("saas_sla", "SLA", "What support hours and uptime target apply?"),
      varStub("ip_ownership", "IP", "Who should own deliverables?"),
    ];
    const skipped = new Set(["saas_sla"]);
    const result = buildStableGuidedQuestionQueue({ variables: vars, skipped });
    expect(result.queue).not.toContain("saas_sla");
    expect(result.queue[0]).toBe("ip_ownership");
  });
});
