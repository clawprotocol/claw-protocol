import { useEffect, useMemo, useRef, useState } from "react";
import type { GuidedCompletionSession } from "./types";
import type { DealVariable } from "./types";
import {
  getCurrentVariable,
  guidedSessionIntro,
} from "./guidedCompletionEngine";
import {
  computeGuidedVisibleQuestionAccounting,
  formatGuidedProgressLabel,
  formatGuidedQuestionHeader,
} from "./guidedVisibleQuestionAccounting";
import { resolveGuidedAnswerForPill } from "./guidedAnswerResolution";
import {
  GUIDED_COMPLETION_HEADING,
  GUIDED_COMPLETION_SUBHEADING,
  GUIDED_QUESTION_FOOTER_COPY,
} from "./friendlyProCompletionCopy";
import {
  RECOMMEND_PILL_ID,
  resolveRecommendForMe,
  type RecommendForMeResult,
} from "./intakeRecommendationEngine";
import { isRecommendPillId } from "./guidedRecommendPillIds";
import type { GuidedAppliedChange } from "./guidedChangeTypes";
import type { GuidedCompletionPhase } from "./guidedCompletionPhase";
import {
  buildBulkApplyChecklist,
  buildClauseUpdatesForVariable,
  normalizeWhyText,
  resolveGuidedQuestionConfig,
  resolveOptionDisplayCopy,
} from "./guidedQuestionConfig";
import { GuidedReviewFlowBanner } from "./GuidedReviewFlowBanner";
import { GuidedQuestionOptionCard } from "./GuidedQuestionOptionCard";
import { GuidedBulkApplyChecklist } from "./GuidedBulkApplyChecklist";

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
  onSkipQuestion?: (variableId: string) => void;
  bulkApplyBusy?: boolean;
  bulkApplyError?: string | null;
  appliedChanges?: readonly GuidedAppliedChange[];
  onCustomPillSelected?: () => void;
  externallyFrozen?: boolean;
  compact?: boolean;
  /** GTM: hide custom/freeform answer branch during guided questions. */
  suppressFreeformBranching?: boolean;
};

export function GuidedDealCompletionPanel({
  session,
  intakeRaw,
  phase,
  onSessionChange: _onSessionChange,
  onSaveAnswer,
  onEditAnswer: _onEditAnswer,
  onBulkApply,
  onSkipQuestion,
  bulkApplyBusy = false,
  bulkApplyError = null,
  appliedChanges: _appliedChanges = [],
  onCustomPillSelected,
  externallyFrozen = false,
  compact = false,
  suppressFreeformBranching = false,
}: GuidedDealCompletionPanelProps) {
  const intro = useMemo(() => guidedSessionIntro(session), [session]);
  const current = getCurrentVariable(session);
  const collecting = phase === "collecting_answers";
  const readyToApply = phase === "ready_to_apply" || phase === "failed";
  const applying = phase === "applying_all";
  const accounting = useMemo(() => computeGuidedVisibleQuestionAccounting(session), [session]);
  const { resolvedVisibleQuestionCount, answeredVisibleQuestionCount, progressPercent: progressPct } =
    accounting;

  const [customOpen, setCustomOpen] = useState(false);
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [recommendView, setRecommendView] = useState<RecommendForMeResult | null>(null);
  const [holdQuestionId, setHoldQuestionId] = useState<string | null>(null);
  const [savedPulse, setSavedPulse] = useState(false);
  const [lastSelectedPillId, setLastSelectedPillId] = useState<string | null>(null);
  const [skipFlash, setSkipFlash] = useState(false);
  const advanceTimerRef = useRef<number | null>(null);

  const displayQuestion: DealVariable | null = useMemo(() => {
    const id = holdQuestionId ?? current?.id;
    if (!id) return current;
    return session.variables.find((v) => v.id === id) ?? current;
  }, [holdQuestionId, current, session.variables]);

  const selectablePills = useMemo(() => {
    if (!displayQuestion) return [];
    return displayQuestion.suggestedDefaults.filter((p) => !isRecommendPillId(p.id));
  }, [displayQuestion]);

  const primaryPillEntry = useMemo(() => {
    if (!displayQuestion || selectablePills.length === 0) return null;
    let best = selectablePills[0]!;
    let bestRank = 99;
    for (const pill of selectablePills) {
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
      const rank = copy.recommended ? 0 : 1;
      if (rank < bestRank) {
        bestRank = rank;
        best = pill;
      }
    }
    return best;
  }, [displayQuestion, selectablePills, intakeRaw]);

  const otherPillEntries = useMemo(() => {
    if (!primaryPillEntry) return selectablePills;
    return selectablePills.filter((p) => p.id !== primaryPillEntry.id);
  }, [selectablePills, primaryPillEntry]);

  const controlsDisabled = externallyFrozen || applying || bulkApplyBusy || Boolean(holdQuestionId);
  const bulkChecklist = useMemo(() => buildBulkApplyChecklist(session), [session]);

  const displayQuestionHeader = displayQuestion
    ? formatGuidedQuestionHeader(accounting, displayQuestion.id)
    : "Question";

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
    setShowOtherOptions(false);
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
    const nextCount =
      resolvedVisibleQuestionCount +
      (session.answered[variableId] || session.skipped.has(variableId) ? 0 : 1);
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
    setHoldQuestionId(displayQuestion.id);
    setSavedPulse(false);
    setSkipFlash(true);
    onSkipQuestion?.(displayQuestion.id);
    advanceTimerRef.current = window.setTimeout(() => {
      setHoldQuestionId(null);
      setSkipFlash(false);
      advanceTimerRef.current = null;
    }, ADVANCE_HOLD_MS);
    setCustomOpen(false);
    setCustomDraft("");
    setRecommendView(null);
  };

  const pendingAreaLabel = displayQuestion
    ? resolveGuidedQuestionConfig(displayQuestion.id).finalAppliedAreaLabel
    : null;

  const showSavedOnQuestion = savedPulse && holdQuestionId === displayQuestion?.id;
  const showSkippedOnQuestion = skipFlash && holdQuestionId === displayQuestion?.id;

  if (readyToApply || applying) {
    const failed = phase === "failed";
    return (
      <div
        data-guided-completion-panel="true"
        className={`rounded-xl border border-amber-200/80 bg-amber-50/40 shadow-sm ring-1 ring-stone-200/60 ${compact ? "p-2.5 pb-28 sm:pb-4" : "p-3 pb-28 sm:p-4 sm:pb-8"}`}
      >
        <GuidedReviewFlowBanner guidedActive phase={phase} className="mb-2.5" />
        {applying || bulkApplyBusy ? (
          <>
            <p className="text-sm font-semibold text-stone-900">Updating your agreement…</p>
            <p className="mt-0.5 text-[11px] text-stone-600">
              Applying {answeredVisibleQuestionCount} answers in one authoritative update.
            </p>
            <div className="mt-2">
              <GuidedBulkApplyChecklist items={bulkChecklist} />
            </div>
          </>
        ) : failed ? (
          <>
            <p className="text-sm font-semibold text-stone-900">Couldn&apos;t apply updates</p>
            <p className="mt-0.5 text-[11px] text-stone-600">Your answers are still queued. Try again.</p>
            {bulkApplyError ? (
              <p className="mt-2 text-xs font-medium text-amber-800" role="alert">
                {bulkApplyError}
              </p>
            ) : null}
            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45 sm:w-auto"
              disabled={externallyFrozen}
              onClick={() => onBulkApply?.()}
            >
              Retry update
            </button>
          </>
        ) : (
          <p className="text-sm font-semibold text-stone-900">Applying your agreement now…</p>
        )}
      </div>
    );
  }

  const clauseUpdates = displayQuestion ? buildClauseUpdatesForVariable(displayQuestion.id) : [];

  return (
    <div
      data-guided-completion-panel="true"
      className={`rounded-xl border-2 border-stone-400/50 bg-white shadow-md ring-2 ring-stone-300/40 ${compact ? "p-2 pb-24 sm:pb-3" : "p-2.5 pb-24 sm:p-3 sm:pb-6"}`}
      role="region"
      aria-label={GUIDED_COMPLETION_HEADING}
    >
      <GuidedReviewFlowBanner guidedActive phase={phase} className="mb-2" />
      <p className="text-sm font-semibold text-stone-900">{GUIDED_COMPLETION_HEADING}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{GUIDED_COMPLETION_SUBHEADING}</p>
      <p className="mt-2 text-[11px] text-stone-500">{intro.subline}</p>

      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold tabular-nums text-stone-800" data-testid="guided-progress-count">
          {formatGuidedProgressLabel(accounting)}
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-200/90">
        <div
          className="h-full rounded-full bg-emerald-600 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(progressPct, resolvedVisibleQuestionCount > 0 ? 8 : 0)}%` }}
          data-testid="guided-progress-bar"
        />
      </div>

      {collecting && displayQuestion ? (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
            {displayQuestionHeader}
          </p>
          <p className="text-[15px] font-semibold leading-snug text-stone-900">{displayQuestion.question}</p>

          {clauseUpdates.length > 0 ? (
            <div
              className="rounded-md border border-stone-200/90 bg-stone-50/90 px-2.5 py-2"
              data-testid="guided-clause-updates-preview"
            >
              <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Will update</p>
              <ul className="mt-1 space-y-0.5">
                {clauseUpdates.map((label) => (
                  <li key={label} className="text-[11px] text-stone-800">
                    • {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
                <span className="font-semibold">Saved.</span>{" "}
                {pendingAreaLabel ? (
                  <>
                    Queued update · <span className="font-semibold">{pendingAreaLabel}</span> — applies when you
                    finish the questions.
                  </>
                ) : (
                  <>Queued — applies when you finish the questions.</>
                )}
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
          ) : showSkippedOnQuestion ? (
            <div
              className="rounded-md border border-amber-200/90 bg-amber-50/90 px-2.5 py-2 text-[11px] text-amber-950"
              role="status"
              data-testid="guided-skip-flash"
            >
              <span className="font-semibold">Question skipped</span> — not needed for this agreement.
            </div>
          ) : !showSavedOnQuestion ? (
            <div className="space-y-1.5">
              {primaryPillEntry ? (
                (() => {
                  const pill = primaryPillEntry;
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
                      recommended
                      selected={lastSelectedPillId === pill.id}
                      why={copy.why}
                      lawDogWill={copy.lawDogWill}
                      compact
                      disabled={controlsDisabled}
                      onSelect={() => handlePill(pill.id, pill.value, pill.label)}
                    />
                  );
                })()
              ) : null}
              {otherPillEntries.length > 0 ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-stone-600 underline-offset-2 hover:underline"
                  disabled={controlsDisabled}
                  onClick={() => setShowOtherOptions((v) => !v)}
                  data-testid="guided-show-other-options"
                >
                  {showOtherOptions ? "Hide other options" : "Show other options"}
                </button>
              ) : null}
              {showOtherOptions
                ? otherPillEntries.map((pill) => {
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
                        compact
                        disabled={controlsDisabled}
                        onSelect={() => handlePill(pill.id, pill.value, pill.label)}
                      />
                    );
                  })
                : null}
              {!suppressFreeformBranching && !customOpen ? (
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
              ) : null}
              {displayQuestion.suggestedDefaults.some((p) => isRecommendPillId(p.id)) ? (
                <button
                  type="button"
                  disabled={controlsDisabled}
                  className="text-[10px] font-medium text-sky-800/90 underline-offset-2 hover:underline"
                  onClick={() => handleRecommendForMe()}
                >
                  Recommend for me
                </button>
              ) : null}
              {!suppressFreeformBranching && customOpen ? (
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
              ) : null}
            </div>
          ) : null}

          {!applying && !bulkApplyBusy ? (
            <footer className="pt-0.5 space-y-1 opacity-80">
              <p className="text-[10px] leading-snug text-stone-500">{GUIDED_QUESTION_FOOTER_COPY}</p>
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
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
