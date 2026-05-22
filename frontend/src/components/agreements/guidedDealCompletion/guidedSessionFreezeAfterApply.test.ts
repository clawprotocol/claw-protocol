import { describe, expect, it } from "vitest";
import { freezeGuidedSessionAfterApply } from "./guidedSessionPersistence";
import type { GuidedCompletionSession } from "./types";

function sessionStub(queue: string[], answered: Record<string, string>): GuidedCompletionSession {
  return {
    variables: queue.map((id) => ({
      id,
      category: "compensation",
      label: id,
      question: `Question for ${id}?`,
      severity: "important",
      suggestedDefaults: [],
      agreementImpact: "x",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0.5,
      affectsSections: [],
    })),
    queue,
    answered,
    skipped: new Set(),
    currentIndex: queue.length,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: queue.length,
  };
}

describe("freezeGuidedSessionAfterApply", () => {
  it("keeps frozen queue length after apply (no visible regrowth)", () => {
    const session = sessionStub(
      ["project_fee_phase_confirmation", "saas_sla", "ip_ownership", "renewal_notice", "payment_timing"],
      {
        project_fee_phase_confirmation: "$120k",
        saas_sla: "99.5%",
        ip_ownership: "Client",
        renewal_notice: "30 days",
        payment_timing: "Net 30",
      },
    );
    const frozen = freezeGuidedSessionAfterApply(session, "gen:fp");
    expect(frozen.queue.length).toBe(0);
    expect(Object.keys(frozen.answered).length).toBe(5);
    expect(frozen.frozenTotalQuestions).toBe(5);
  });
});
