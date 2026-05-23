import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GuidedCompletionSession } from "./types";
import {
  isGuidedApplyEquivalentForFinalReview,
  pickBestAuthoritativeCorpusPlain,
  resolveGuidedFinalReviewApplyReadiness,
  resolveGuidedFinalReviewApplyReadinessFromSession,
  resolveGuidedSyncApplyFromCorpus,
} from "./guidedFinalReviewApplyReadiness";
import { evaluateGuidedFinalReviewUnlockGate } from "./guidedFinalReviewTransition";
import { resolveGuidedSignerSetupStatus } from "./guidedAnswerApplyOrchestration";
import {
  corpusMatchesFreeBasicDraft,
  shouldRejectFreeBasicDraftForPaidProPick,
} from "../premiumReadonlyRenderCorpus";

function completeSession(answerCount = 3): GuidedCompletionSession {
  const answered: Record<string, string> = {};
  const queue: string[] = [];
  for (let i = 0; i < answerCount; i++) {
    const id = `q${i}`;
    queue.push(id);
    answered[id] = `Answer ${i} with $6,000 monthly and confidentiality terms`;
  }
  return {
    sessionKey: "gen:test",
    queue: [...queue],
    variables: queue.map((id) => ({
      id,
      category: "compensation",
      label: id,
      question: `Question ${id}?`,
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
    answered,
    skipped: new Set(),
    currentIndex: answerCount,
    completenessPercent: 100,
    agreementFamily: "services_agreement",
    frozenTotalQuestions: answerCount,
  };
}

describe("guidedFinalReviewApplyReadiness (test31)", () => {
  it("recovers idle apply when all questions answered and full authoritative body exists", () => {
    const session = completeSession();
    const readiness = resolveGuidedFinalReviewApplyReadinessFromSession({
      applyStatus: "idle",
      guidedCompletionPhase: "ready_to_apply",
      session,
      authoritativeBodyLen: 3012,
    });
    expect(readiness.status).toBe("ready");
    expect(readiness.appliedEquivalent).toBe(true);
  });

  it("does not block unlock gate on apply_not_complete after recovery conditions", () => {
    const gate = evaluateGuidedFinalReviewUnlockGate({
      applyStatus: "idle",
      signerStatus: resolveGuidedSignerSetupStatus(true),
      authoritativeBodyLen: 3012,
      guidedCompletionPhase: "ready_to_apply",
      guidedSessionComplete: true,
      answeredCount: 5,
    });
    expect(gate.ok).toBe(true);
    expect(gate.reason).toBeNull();
  });

  it("sync apply from existing corpus accepts full Pro body without refine", () => {
    const session = completeSession(5);
    const corpus =
      `LawDog is not a law firm.\nNot legal advice.\n\n` +
      "1. Services\nAI automation support.\n\n".repeat(40) +
      "2. Fees\n$6,000 monthly net 15.\n\n".repeat(20) +
      "3. Confidentiality\nMutual duties.\n\n".repeat(20) +
      "5. Support\n99.9% monthly uptime.\n\n".repeat(20);
    const outcome = resolveGuidedSyncApplyFromCorpus({
      session,
      corpusPlain: corpus,
      stableBeforePlain: corpus,
    });
    expect(outcome.status).toBe("applied");
  });

  it("pickBestAuthoritativeCorpusPlain prefers longest candidate", () => {
    expect(pickBestAuthoritativeCorpusPlain(["short", "x".repeat(2500), "mid"])).toHaveLength(2500);
  });

  it("rejects free basic draft hash for paid Pro picker when authoritative fallback exists", () => {
    const free = "Free starter preview body ".repeat(40);
    expect(
      shouldRejectFreeBasicDraftForPaidProPick({
        selectedPlain: free,
        freeBaselinePlain: free,
        premiumCheckoutCompleted: true,
        paidAuthoritativeFallback: "x".repeat(2000),
      }),
    ).toBe(true);
    expect(corpusMatchesFreeBasicDraft(free, free)).toBe(true);
  });

  it("intake wires apply readiness, sync commit, and canonical continue handler", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("resolveGuidedFinalReviewApplyReadinessFromSession");
    expect(intake).toContain("commitGuidedApplyFromExistingCorpus");
    expect(intake).toContain("continueGuidedSignerSetupToFinalReview");
    expect(intake).toContain("logGuidedFinalReviewApplyReadiness");
    expect(intake).toContain("logGuidedFinalReviewApplyStatusRecovered");
    expect(intake).toContain("logGuidedFinalReviewSyncApplyStarted");
    expect(intake).toContain("pickBestAuthoritativeCorpusPlain");
    const corpusPicker = readFileSync(join(__dirname, "../premiumReadonlyRenderCorpus.ts"), "utf8");
    expect(corpusPicker).toContain("shouldRejectFreeBasicDraftForPaidProPick");
  });

  it("isGuidedApplyEquivalentForFinalReview treats applied phase as sufficient", () => {
    expect(
      isGuidedApplyEquivalentForFinalReview({
        applyStatus: "idle",
        guidedCompletionPhase: "applied",
        guidedSessionComplete: false,
        answeredCount: 0,
        authoritativeBodyLen: 2000,
      }),
    ).toBe(true);
  });

  it("needs_sync_apply when idle with complete session and sub-threshold body", () => {
    const readiness = resolveGuidedFinalReviewApplyReadiness({
      applyStatus: "idle",
      guidedCompletionPhase: "ready_to_apply",
      guidedSessionComplete: true,
      answeredCount: 4,
      frozenAnswerCount: 4,
      authoritativeBodyLen: 900,
    });
    expect(readiness.status).toBe("needs_sync_apply");
  });
});
