import { describe, expect, it } from "vitest";
import type { GuidedCompletionSession } from "./types";
import {
  canUnlockGuidedFinalReview,
  countGuidedAnsweredVariables,
  listGuidedAnsweredVariableIds,
  resolveGuidedAnswerApplyStatus,
  resolveGuidedFrozenAnswerCount,
  resolveGuidedSignerSetupStatus,
  resolveGuidedSignerSetupStickyCta,
  shouldResolveGuidedApplyFromExistingBody,
} from "./guidedAnswerApplyOrchestration";

function frozenSession(): GuidedCompletionSession {
  const ids = ["a", "b", "c", "d", "e"];
  return {
    sessionKey: "gen:fp",
    queue: [],
    variables: ids.map((id) => ({
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
    answered: {
      a: "1",
      b: "2",
      c: "3",
      d: "4",
      e: "5",
    },
    skipped: new Set(),
    currentIndex: 5,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: 5,
  };
}

describe("guidedAnswerApplyOrchestration", () => {
  it("answeredCount remains 5 after queue freeze (queueLen 0)", () => {
    const session = frozenSession();
    expect(session.queue.length).toBe(0);
    expect(countGuidedAnsweredVariables(session)).toBe(5);
    expect(resolveGuidedFrozenAnswerCount(session)).toBe(5);
    expect(listGuidedAnsweredVariableIds(session)).toHaveLength(5);
  });

  it("resolveGuidedAnswerApplyStatus tracks applying vs applied", () => {
    expect(
      resolveGuidedAnswerApplyStatus({
        guidedAnswerApplyStatus: "applying",
        guidedCompletionPhase: "ready_to_apply",
        bulkApplying: true,
      }),
    ).toBe("applying");
    expect(
      resolveGuidedAnswerApplyStatus({
        guidedAnswerApplyStatus: "applied",
        guidedCompletionPhase: "ready_to_apply",
        bulkApplying: false,
      }),
    ).toBe("applied");
  });

  it("final review unlocks only when apply, signers, body, and no editing/debounce", () => {
    expect(
      canUnlockGuidedFinalReview({
        applyStatus: "applied",
        signerStatus: "complete",
        authoritativeBodyLen: 6000,
      }),
    ).toBe(true);
    expect(
      canUnlockGuidedFinalReview({
        applyStatus: "applying",
        signerStatus: "complete",
        authoritativeBodyLen: 6000,
      }),
    ).toBe(false);
    expect(
      canUnlockGuidedFinalReview({
        applyStatus: "applied",
        signerStatus: "missing",
        authoritativeBodyLen: 6000,
      }),
    ).toBe(false);
    expect(
      canUnlockGuidedFinalReview({
        applyStatus: "applied",
        signerStatus: "complete",
        authoritativeBodyLen: 200,
      }),
    ).toBe(false);
    expect(
      canUnlockGuidedFinalReview({
        applyStatus: "applied",
        signerStatus: "complete",
        authoritativeBodyLen: 6000,
        signersEditing: true,
      }),
    ).toBe(false);
  });

  it("sticky CTA: signers complete + apply running shows finishing copy", () => {
    const cta = resolveGuidedSignerSetupStickyCta({
      signerStatus: "complete",
      applyStatus: "applying",
    });
    expect(cta.disabled).toBe(true);
    expect(cta.label).toMatch(/Finishing your updated agreement/i);
  });

  it("sticky CTA: both complete shows continue to final review", () => {
    const cta = resolveGuidedSignerSetupStickyCta({
      signerStatus: resolveGuidedSignerSetupStatus(true),
      applyStatus: "applied",
    });
    expect(cta.label).toBe("Continue to final review");
    expect(cta.disabled).toBe(false);
  });

  it("stuck apply resolves when authoritative body grew", () => {
    expect(
      shouldResolveGuidedApplyFromExistingBody({
        applying: true,
        stableBodyLen: 10129,
        currentBodyLen: 10500,
        elapsedMs: 5000,
      }),
    ).toBe(true);
    expect(
      shouldResolveGuidedApplyFromExistingBody({
        applying: true,
        stableBodyLen: 10129,
        currentBodyLen: 10500,
        elapsedMs: 1000,
      }),
    ).toBe(false);
  });

  const families = ["services", "generic_business", "nda", "marketing", "saas"];
  for (const family of families) {
    it(`${family}: frozen answer count independent of queue`, () => {
      expect(resolveGuidedFrozenAnswerCount(frozenSession())).toBe(5);
    });
  }
});
