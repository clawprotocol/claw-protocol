import { useEffect, useMemo, useRef, useState } from "react";
import type { GuidedCompletionSession } from "./types";
import type { DealVariable } from "./types";
import {
  computeGuidedCollectionProgress,
  frozenQuestionTotal,
  getCurrentVariable,
  guidedSessionIntro,
  skipGuidedVariable,
} from "./guidedCompletionEngine";
import { resolveGuidedAnswerForPill } from "./guidedAnswerResolution";
import { GUIDED_COMPLETION_HEADING, GUIDED_COMPLETION_SUBHEADING } from "./friendlyProCompletionCopy";
import {
  RECOMMEND_PILL_ID,
  resolveRecommendForMe,
  type RecommendForMeResult,
} from "./intakeRecommendationEngine";
import { isRecommendPillId } from "./guidedRecommendPillIds";
import type { GuidedAppliedChange } from "./guidedChangeTypes";
import { GuidedAppliedChangesReview } from "./GuidedAppliedChangesReview";
import type { GuidedCompletionPhase } from "./guidedCompletionPhase";
import { sessionReadyForBulkApply } from "./guidedBulkRegeneration";
import {
  buildBulkApplyChecklist,
  buildFinalAppliedAreaLabels,
  normalizeWhyText,
  resolveOptionDisplayCopy,
  resolveQuestionNumber,
} from "./guidedQuestionConfig";
import { GuidedQuestionOptionCard } from "./GuidedQuestionOptionCard";
import { GuidedBulkApplyChecklist } from "./GuidedBulkApplyChecklist";
import { GuidedAppliedAreasSummary } from "./GuidedAppliedAreasSummary";

const ADVANCE_HOLD_MS = 340;

export type GuidedDealCompletionPanelProps = {
  session: GuidedCompletionSession;
  intakeRaw?: string | null;
  phase: GuidedCompletionPhase;
  onSessionChange: (next: GuidedCompletionSession) => void;
  onSaveAnswer: (
    variableId: string,
    displayAnswer: string,
    meta: {
      recommendationReason?: string | null;
      instructionAnswer?: string;
      implementationPreview?: string;
    },
  ) => void;
  onEditAnswer?: (variableId: string) => void;
  onBulkApply?: () => void;
  bulkApplyBusy?: boolean;
  bulkApplyError?: string | null;
  appliedChanges?: readonly GuidedAppliedChange[];
  onCustomPillSelected?: () => void;
  externallyFrozen?: boolean;
  compact?: boolean;
};

export function GuidedDealCompletionPanel({
  session,
  intakeRaw,
  phase,
  onSessionChange,
  onSaveAnswer,
  onEditAnswer,
  onBulkApply,
  bulkApplyBusy = false,
  bulkApplyError = null,
  appliedChanges = [],
  onCustomPillSelected,
  externallyFrozen = false,
  compact = false,
}: GuidedDealCompletionPanelProps) {
  const intro = useMemo(() => guidedSessionIntro(session), [session]);
  const current = getCurrentVariable(session);
  const collecting = phase === "collecting_answers";
  const readyToApply = phase === "ready_to_apply" || phase === "failed";
  const applying = phase === "applying_all";
  const applied = phase === "applied";
  const total = frozenQuestionTotal(session);
  const answeredCount = Object.keys(session.answered).length;
  const progressPct = computeGuidedCollectionProgress(answeredCount, total);

  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [recommendView, setRecommendView] = useState<RecommendForMeResult | null>(null);
  const [holdQuestionId, setHoldQuestionId] = useState<string | null>(null);
  const [savedPulse, setSavedPulse] = useState(false);
  const [lastSelectedPillId, setLastSelectedPillId] = useState<string | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  const controlsDisabled = externallyFrozen || applying || bulkApplyBusy || Boolean(holdQuestionId);
  const bulkChecklist = useMemo(() => buildBulkApplyChecklist(session), [session]);
  const appliedAreas = useMemo(() => buildFinalAppliedAreaLabels(session), [session]);

  const displayQuestion: DealVariable | null = useMemo(() => {
    const id = holdQuestionId ?? current?.id;
    if (!id) return current;
    return session.variables.find((v) => v.id === id) ?? current;
  }, [holdQuestionId, current, session.variables]);

  const displayQuestionNum = displayQuestion
    ? resolveQuestionNumber(session, displayQuestion.id)
    : total;

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (holdQuestionId) return;
    setRecommendView(null);
    setCustomOpen(false);
    setCustomDraft("");
    setLastSelectedPillId(null);
  }, [current?.id, holdQuestionId]);

  const beginAdvanceHold = (variableId: string, nextCompletedCount: number) => {
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    setHoldQuestionId(variableId);
    setSavedPulse(true);
    advanceTimerRef.current = window.setTimeout(() => {
      setHoldQuestionId(null);
      setSavedPulse(false);
      setLastSelectedPillId(null);
      advanceTimerRef.current = null;
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info("[guided-question-advanced]", { variableId, completed: nextCompletedCount });
      }
    }, ADVANCE_HOLD_MS);
  };

  const saveAnswer = (
    displayAnswer: string,
    instructionAnswer: string,
    variableId: string,
    pillId: string,
    recommendationReason?: string | null,
    implementationPreview?: string,
  ) => {
    if (!displayQuestion || controlsDisabled || variableId !== displayQuestion.id) return;
    const nextCount = answeredCount + (session.answered[variableId] ? 0 : 1);
    onSaveAnswer(variableId, displayAnswer, {
      recommendationReason,
      instructionAnswer,
      implementationPreview,
    });
    setLastSelectedPillId(pillId);
    setCustomOpen(false);
    setCustomDraft("");
    setRecommendView(null);
    beginAdvanceHold(variableId, nextCount);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-answer-saved]", { variableId, displayAnswer, completed: nextCount });
    }
  };

  const applyRecommendChoice = (
    choice: { label: string; value: string },
    variableId: string,
    recommendationReason?: string | null,
  ) => {
    if (!displayQuestion || controlsDisabled || variableId !== displayQuestion.id) return;
    const instructionAnswer = (choice.value || choice.label).trim();
    if (!instructionAnswer) {
      setRecommendView(null);
      setCustomOpen(true);
      onCustomPillSelected?.();
      return;
    }
    const copy = resolveOptionDisplayCopy({
      variableId,
      pillId: "recommend",
      pillLabel: choice.label,
      pillValue: choice.value,
      intakeRaw,
      variable: displayQuestion,
      instructionAnswer,
    });
    saveAnswer(
      choice.label,
      instructionAnswer,
      variableId,
      RECOMMEND_PILL_ID,
      recommendationReason ?? copy.why,
      copy.lawDogWill,
    );
  };

  const handleRecommendForMe = () => {
    if (!displayQuestion || controlsDisabled) return;
    const rec = resolveRecommendForMe(displayQuestion, intakeRaw);
    setCustomOpen(false);
    if (rec.applyDirect) {
      applyRecommendChoice(rec.primary, displayQuestion.id, rec.why || rec.explanation);
      return;
    }
    setRecommendView(rec);
  };

  const handlePill = (pillId: string, value: string, label: string) => {
    if (!displayQuestion || controlsDisabled) return;
    const resolution = resolveGuidedAnswerForPill(displayQuestion, pillId, label, value);
    if (resolution.action === "recommend" || isRecommendPillId(pillId)) {
      handleRecommendForMe();
      return;
    }
    if (resolution.action === "custom") {
      setRecommendView(null);
      setCustomOpen(true);
      onCustomPillSelected?.();
      return;
    }
    const copy = resolveOptionDisplayCopy({
      variableId: displayQuestion.id,
      pillId,
      pillLabel: label,
      pillValue: value,
      intakeRaw,
      variable: displayQuestion,
      instructionAnswer: resolution.instructionAnswer,
    });
    saveAnswer(
      resolution.displayAnswer,
      resolution.instructionAnswer,
      displayQuestion.id,
      pillId,
      copy.why,
      copy.lawDogWill,
    );
  };

  const handleSkip = () => {
    if (!displayQuestion || controlsDisabled) return;
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    setHoldQuestionId(null);
    setSavedPulse(false);
    onSessionChange(skipGuidedVariable(session, displayQuestion.id));
    setCustomOpen(false);
    setCustomDraft("");
    setRecommendView(null);
  };

  const showSavedOnQuestion = savedPulse && holdQuestionId === displayQuestion?.id;

  if (applied) {
    return (
      <div data-guided-completion-panel="true" className={compact ? "pb-6" : "pb-8"}>
        <p className="mb-2 text-sm font-semibold text-stone-900">Review your updated Pro agreement</p>
        <GuidedAppliedAreasSummary areas={appliedAreas} />
        {appliedChanges.length > 0 ? (
          <div className="mt-3">
            <GuidedAppliedChangesReview changes={appliedChanges} onJumpToSection={() => {}} />
          </div>
        ) : null}
      </div>
    );
  }

  if (readyToApply || applying) {
    const ready = sessionReadyForBulkApply(session);
    return (
      <div
        data-guided-completion-panel="true"
        className={`rounded-xl border border-stone-300/90 bg-white shadow-sm ${compact ? "p-3 pb-28 sm:pb-4" : "p-4 pb-28 sm:p-5 sm:pb-8"}`}
      >
        <p className="text-sm font-semibold text-stone-900">All questions answered</p>
        <p className="mt-1 text-xs text-stone-600">Review choices, then update your Pro agreement in one pass.</p>
        <ul className="mt-2 space-y-1.5">
          {session.queue.map((id) => {
            const ans = session.answered[id];
            if (!ans) return null;
            const v = session.variables.find((x) => x.id === id);
            return (
              <li key={id} className="rounded-md border border-stone-200/80 bg-stone-50/80 px-2.5 py-1.5 text-xs">
                <span className="font-medium text-stone-900">{v?.label ?? id}: </span>
                <span className="text-stone-700">{ans}</span>
                {onEditAnswer ? (
                  <button
                    type="button"
                    className="ml-2 text-[10px] text-stone-500 underline hover:text-stone-800"
                    disabled={applying || bulkApplyBusy}
                    onClick={() => onEditAnswer(id)}
                  >
                    Edit
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {applying || bulkApplyBusy ? <GuidedBulkApplyChecklist items={bulkChecklist} /> : null}
        {bulkApplyError ? (
          <p className="mt-2 text-xs font-medium text-amber-800" role="alert">
            {bulkApplyError}
          </p>
        ) : null}
        <div className="mt-3">
          <button
            type="button"
            className="w-full rounded-lg bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45 sm:w-auto"
            disabled={!ready || applying || bulkApplyBusy || externallyFrozen}
            onClick={() => onBulkApply?.()}
          >
            Update Pro agreement
          </button>
          <p className="mt-1.5 text-[11px] text-stone-500">
            LawDog will apply your {answeredCount} answers in one clean pass.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-guided-completion-panel="true"
      className={`rounded-xl border border-stone-300/90 bg-white shadow-sm ${compact ? "p-2.5 pb-28 sm:pb-4" : "p-3 pb-28 sm:p-4 sm:pb-8"}`}
      role="region"
      aria-label={GUIDED_COMPLETION_HEADING}
    >
      <p className="text-sm font-semibold text-stone-900">{GUIDED_COMPLETION_HEADING}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{GUIDED_COMPLETION_SUBHEADING}</p>
      <p className="mt-2 text-[11px] text-stone-500">{intro.subline}</p>

      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tabular-nums text-stone-800" data-testid="guided-progress-count">
          {answeredCount} of {total} completed
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-200/90">
        <div
          className="h-full rounded-full bg-emerald-600 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(progressPct, answeredCount > 0 ? 8 : 0)}%` }}
          data-testid="guided-progress-bar"
        />
      </div>

      {collecting && displayQuestion ? (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
            Question {displayQuestionNum} of {total}
          </p>
          <p className="text-[15px] font-semibold leading-snug text-stone-900">{displayQuestion.question}</p>

          {showSavedOnQuestion ? (
            <div
              className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2"
              role="status"
              aria-live="polite"
              data-testid="guided-saved-flash"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white ${
                  savedPulse ? "animate-pulse" : ""
                }`}
                aria-hidden
              >
                ✓
              </span>
              <p className="text-[11px] leading-snug text-emerald-900">
                <span className="font-semibold">Saved.</span> We&apos;ll apply this when all questions are complete.
              </p>
            </div>
          ) : null}

          {!showSavedOnQuestion && recommendView ? (
            <div className="space-y-1.5">
              <GuidedQuestionOptionCard
                label={recommendView.primary.label}
                recommended
                why={normalizeWhyText(recommendView.why || recommendView.explanation)}
                lawDogWill={
                  resolveOptionDisplayCopy({
                    variableId: displayQuestion.id,
                    pillId: "recommend",
                    pillLabel: recommendView.primary.label,
                    pillValue: recommendView.primary.value,
                    intakeRaw,
                    variable: displayQuestion,
                    instructionAnswer: recommendView.primary.value,
                  }).lawDogWill
                }
                disabled={controlsDisabled}
                onSelect={() =>
                  applyRecommendChoice(
                    recommendView.primary,
                    displayQuestion.id,
                    recommendView.why || recommendView.explanation,
                  )
                }
              />
              <button
                type="button"
                className="text-[11px] font-medium text-stone-600 underline-offset-2 hover:underline"
                onClick={() => setRecommendView(null)}
              >
                Show other options
              </button>
            </div>
          ) : !showSavedOnQuestion ? (
            <div className="space-y-1.5">
              {displayQuestion.suggestedDefaults.map((pill) => {
                if (isRecommendPillId(pill.id)) return null;
                const resolution = resolveGuidedAnswerForPill(
                  displayQuestion,
                  pill.id,
                  pill.label,
                  pill.value,
                );
                const instructionAnswer =
                  resolution.action === "apply" ? resolution.instructionAnswer : pill.value;
                const copy = resolveOptionDisplayCopy({
                  variableId: displayQuestion.id,
                  pillId: pill.id,
                  pillLabel: pill.label,
                  pillValue: pill.value,
                  intakeRaw,
                  variable: displayQuestion,
                  instructionAnswer,
                });
                return (
                  <GuidedQuestionOptionCard
                    key={pill.id}
                    label={pill.label}
                    recommended={copy.recommended}
                    selected={lastSelectedPillId === pill.id}
                    why={copy.why}
                    lawDogWill={copy.lawDogWill}
                    disabled={controlsDisabled}
                    onSelect={() => handlePill(pill.id, pill.value, pill.label)}
                  />
                );
              })}
              {displayQuestion.suggestedDefaults.some((p) => isRecommendPillId(p.id)) ? (
                <button
                  type="button"
                  disabled={controlsDisabled}
                  className="w-full rounded-lg border border-dashed border-sky-300/80 bg-sky-50/40 px-2.5 py-1.5 text-left text-[11px] font-semibold text-sky-900"
                  onClick={() => handleRecommendForMe()}
                >
                  Recommend for me
                </button>
              ) : null}
              {!customOpen ? (
                <button
                  type="button"
                  disabled={controlsDisabled}
                  className="text-[11px] font-medium text-stone-500 hover:text-stone-800"
                  onClick={() => {
                    setRecommendView(null);
                    setCustomOpen(true);
                    onCustomPillSelected?.();
                  }}
                >
                  Custom answer
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                    placeholder="Your answer…"
                    value={customDraft}
                    disabled={controlsDisabled}
                    onChange={(e) => setCustomDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customDraft.trim()) {
                        const copy = resolveOptionDisplayCopy({
                          variableId: displayQuestion.id,
                          pillId: "custom",
                          pillLabel: customDraft.trim(),
                          pillValue: customDraft.trim(),
                          intakeRaw,
                          variable: displayQuestion,
                        });
                        saveAnswer(
                          customDraft.trim(),
                          customDraft.trim(),
                          displayQuestion.id,
                          "custom",
                          null,
                          copy.lawDogWill,
                        );
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-md bg-stone-800 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-45"
                    disabled={controlsDisabled || !customDraft.trim()}
                    onClick={() => {
                      const copy = resolveOptionDisplayCopy({
                        variableId: displayQuestion.id,
                        pillId: "custom",
                        pillLabel: customDraft.trim(),
                        pillValue: customDraft.trim(),
                        intakeRaw,
                        variable: displayQuestion,
                      });
                      saveAnswer(
                        customDraft.trim(),
                        customDraft.trim(),
                        displayQuestion.id,
                        "custom",
                        null,
                        copy.lawDogWill,
                      );
                    }}
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <footer className="pt-2">
            <button
              type="button"
              className="text-[10px] text-stone-400 hover:text-stone-600"
              disabled={controlsDisabled}
              onClick={handleSkip}
              data-testid="guided-skip-tertiary"
            >
              Skip for now
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
