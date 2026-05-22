import { describe, expect, it } from "vitest";
import {
  filterAppliedIdsFromVisibleQueue,
  isGuidedQueueRebuildBlocked,
  mergeGuidedSessionWhenRebuildBlocked,
} from "./guidedCompletionFreeze";
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

describe("guidedCompletionFreeze", () => {
  it("blocks queue rebuild during applying_all and updated_agreement_ready", () => {
    expect(
      isGuidedQueueRebuildBlocked({
        completionFrozen: false,
        frozenAfterApplyRef: false,
        bulkApplying: false,
        phase: "applying_all",
        finalReviewActive: false,
        createFlowPhase: "draft_ready_for_review",
      }),
    ).toBe(true);
    expect(
      isGuidedQueueRebuildBlocked({
        completionFrozen: false,
        frozenAfterApplyRef: true,
        bulkApplying: false,
        phase: "ready_to_apply",
        finalReviewActive: false,
      }),
    ).toBe(true);
    expect(
      isGuidedQueueRebuildBlocked({
        completionFrozen: false,
        frozenAfterApplyRef: false,
        bulkApplying: false,
        phase: "applied",
        finalReviewActive: false,
        createFlowPhase: "updated_agreement_ready",
      }),
    ).toBe(true);
  });

  it("blocks queue rebuild after apply and final review", () => {
    expect(
      isGuidedQueueRebuildBlocked({
        completionFrozen: true,
        frozenAfterApplyRef: false,
        bulkApplying: false,
        phase: "collecting_answers",
        finalReviewActive: false,
      }),
    ).toBe(true);
    expect(
      isGuidedQueueRebuildBlocked({
        completionFrozen: false,
        frozenAfterApplyRef: false,
        bulkApplying: false,
        phase: "applied",
        finalReviewActive: false,
      }),
    ).toBe(true);
    expect(
      isGuidedQueueRebuildBlocked({
        completionFrozen: false,
        frozenAfterApplyRef: false,
        bulkApplying: false,
        phase: "collecting_answers",
        finalReviewActive: true,
      }),
    ).toBe(true);
  });

  it("prevents answered ids from re-entering visible queue", () => {
    const filtered = filterAppliedIdsFromVisibleQueue(
      ["project_fee_phase_confirmation", "saas_sla", "payment_timing"],
      { project_fee_phase_confirmation: "$120k", saas_sla: "99.5%" },
      new Set(),
    );
    expect(filtered).toEqual(["payment_timing"]);
  });

  it("mergeGuidedSessionWhenRebuildBlocked keeps frozen answer count (test22)", () => {
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
    const frozen = mergeGuidedSessionWhenRebuildBlocked(session, "gen:fp");
    expect(frozen?.queue.length).toBe(0);
    expect(frozen?.frozenTotalQuestions).toBe(5);
    expect(Object.keys(frozen?.answered ?? {}).length).toBe(5);
    expect(freezeGuidedSessionAfterApply(session, "gen:fp").queue.length).toBe(0);
  });
});
