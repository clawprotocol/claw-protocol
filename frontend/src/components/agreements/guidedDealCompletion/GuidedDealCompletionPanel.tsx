import { useEffect, useMemo, useState } from "react";
import type { GuidedCompletionSession } from "./types";
import {
  formatRefineInstructionForAnswer,
  frozenQuestionTotal,
  getCurrentVariable,
  guidedSessionIntro,
  isGuidedCompletionComplete,
  resolveGuidedCurrentIndex,
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
import { resolveRecommendReasonForPill } from "./guidedRevisionAnchors";
import type { GuidedAppliedChange } from "./guidedChangeTypes";
import { GuidedChangeCard } from "./GuidedChangeCard";
import { GuidedAppliedChangesReview } from "./GuidedAppliedChangesReview";
import { highlightGuidedSectionInDocument } from "./guidedSectionScroll";
import { resolveGuidedQuestionTarget } from "./guidedRevisionAnchors";

export type GuidedDealCompletionPanelProps = {
  session: GuidedCompletionSession;
  intakeRaw?: string | null;
  onSessionChange: (next: GuidedCompletionSession) => void;
  /**
   * Applies guided refine; returns true on success. Session advance happens in parent on success only.
   */
  onApplyAnswer: (
    instruction: string,
    variableId: string,
    displayAnswer: string,
    meta?: { recommendationReason?: string | null },
  ) => Promise<boolean> | boolean;
  /** Focus the freeform custom instruction area when user picks Custom. */
  onCustomPillSelected?: () => void;
  /** Document commit freeze only — not global premium loading. */
  externallyFrozen?: boolean;
  compact?: boolean;
  /** Section-aware change card after successful apply. */
  lastGuidedChange?: GuidedAppliedChange | null;
  /** All successful applies — shown when session completes. */
  appliedGuidedChanges?: readonly GuidedAppliedChange[];
  onDismissChangeCard?: () => void;
};

export function GuidedDealCompletionPanel({
  session,
  intakeRaw,
  onSessionChange,
  onApplyAnswer,
  onCustomPillSelected,
  externallyFrozen = false,
  compact = false,
  lastGuidedChange = null,
  appliedGuidedChanges = [],
  onDismissChangeCard,
}: GuidedDealCompletionPanelProps) {
  const intro = useMemo(() => guidedSessionIntro(session), [session]);
  const current = getCurrentVariable(session);
  const done = isGuidedCompletionComplete(session);
  const total = frozenQuestionTotal(session);
  const answered = Object.keys(session.answered).length;
  const stepNum = Math.min(total, answered + session.skipped.size + (current ? 1 : 0));
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [applyingVariableId, setApplyingVariableId] = useState<string | null>(null);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [recommendView, setRecommendView] = useState<RecommendForMeResult | null>(null);
  const [pendingAdvance, setPendingAdvance] = useState(false);

  const isLocalApplying = applyingVariableId !== null;
  const controlsDisabled = externallyFrozen || isLocalApplying;
  const showChangeCard = Boolean(lastGuidedChange && !isLocalApplying && pendingAdvance);

  useEffect(() => {
    setRecommendView(null);
    setHelpExpanded(false);
    setCustomOpen(false);
    setCustomDraft("");
    setApplyingVariableId(null);
    setPendingAdvance(false);
  }, [current?.id]);

  useEffect(() => {
    if (lastGuidedChange) setPendingAdvance(true);
  }, [lastGuidedChange?.timestamp]);

  useEffect(() => {
    if (!showChangeCard || !lastGuidedChange || !import.meta.env.DEV) return;
    // eslint-disable-next-line no-console
    console.info("[guided-change-card-rendered]", { questionKey: lastGuidedChange.questionKey });
  }, [showChangeCard, lastGuidedChange?.questionKey]);

  useEffect(() => {
    if (!import.meta.env.DEV || !current) return;
    // eslint-disable-next-line no-console
    console.info("[guided-session-current]", {
      variableId: current.id,
      index: resolveGuidedCurrentIndex(session),
      frozenTotalQuestions: total,
      answeredIds: Object.keys(session.answered),
      skippedIds: [...session.skipped],
    });
  }, [current?.id, session, total]);

  const logReasonRendered = (variableId: string, pillId: string, reason: string | null) => {
    if (!import.meta.env.DEV || !reason) return;
    // eslint-disable-next-line no-console
    console.info("[guided-option-reason-rendered]", { variableId, pillId, reason });
  };

  const runApply = async (
    displayAnswer: string,
    instructionAnswer: string,
    variableId: string,
    recommendationReason?: string | null,
  ): Promise<boolean> => {
    if (!current || controlsDisabled || variableId !== current.id) return false;
    const instruction = formatRefineInstructionForAnswer(current, instructionAnswer);
    if (!instruction.trim()) return false;
    setApplyingVariableId(variableId);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-answer-selected]", { variableId, displayAnswer });
      // eslint-disable-next-line no-console
      console.info("[guided-answer-refine-start]", { variableId });
    }
    try {
      const ok = await Promise.resolve(
        onApplyAnswer(instruction, variableId, displayAnswer, { recommendationReason }),
      );
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info(ok ? "[guided-answer-refine-success]" : "[guided-answer-refine-failed]", { variableId });
      }
      if (ok) {
        setCustomOpen(false);
        setCustomDraft("");
        setRecommendView(null);
      }
      return ok;
    } finally {
      setApplyingVariableId(null);
    }
  };

  const advanceAfterChangeAck = () => {
    setPendingAdvance(false);
    onDismissChangeCard?.();
  };

  const applyRecommendChoice = async (
    choice: { label: string; value: string },
    variableId: string,
    recommendationReason?: string | null,
  ) => {
    if (!current || controlsDisabled || variableId !== current.id) return;
    const instructionAnswer = (choice.value || choice.label).trim();
    if (!instructionAnswer) {
      setRecommendView(null);
      setCustomOpen(true);
      onCustomPillSelected?.();
      return;
    }
    const ok = await runApply(choice.label, instructionAnswer, variableId, recommendationReason);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(ok ? "[guided-recommend-apply-success]" : "[guided-recommend-apply-failed]", { variableId });
    }
  };

  const handleRecommendForMe = async () => {
    if (!current || controlsDisabled) return;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-recommend-click]", { variableId: current.id });
    }
    const rec = resolveRecommendForMe(current, intakeRaw);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-recommend-resolved]", {
        variableId: current.id,
        applyDirect: rec.applyDirect,
        why: rec.why,
      });
    }
    logReasonRendered(current.id, RECOMMEND_PILL_ID, rec.why || rec.explanation);
    setCustomOpen(false);
    if (rec.applyDirect) {
      await applyRecommendChoice(rec.primary, current.id, rec.why || rec.explanation);
      return;
    }
    setRecommendView(rec);
  };

  const handlePill = (pillId: string, value: string, label: string) => {
    if (!current || controlsDisabled) return;
    const reason = resolveRecommendReasonForPill(current.id, pillId, intakeRaw);
    if (reason) logReasonRendered(current.id, pillId, reason);
    const resolution = resolveGuidedAnswerForPill(current, pillId, label, value);
    if (resolution.action === "recommend" || isRecommendPillId(pillId)) {
      void handleRecommendForMe();
      return;
    }
    if (resolution.action === "custom") {
      setRecommendView(null);
      setCustomOpen(true);
      onCustomPillSelected?.();
      return;
    }
    void runApply(resolution.displayAnswer, resolution.instructionAnswer, current.id, reason);
  };

  const handleSkip = () => {
    if (!current || controlsDisabled) return;
    onSessionChange(skipGuidedVariable(session, current.id));
    setCustomOpen(false);
    setCustomDraft("");
    setRecommendView(null);
    setPendingAdvance(false);
    onDismissChangeCard?.();
  };

  const handleViewChange = () => {
    if (!lastGuidedChange) return;
    const target = resolveGuidedQuestionTarget(lastGuidedChange.questionKey);
    const found = highlightGuidedSectionInDocument(target);
    if (!found && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-refine-anchor-missing]", { questionKey: lastGuidedChange.questionKey });
    }
  };

  if (done) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-final-review-list-rendered]", { count: appliedGuidedChanges.length });
    }
    return (
      <div data-guided-completion-panel="true" className={compact ? "pb-6" : "pb-8"}>
        <GuidedAppliedChangesReview
          changes={appliedGuidedChanges}
          onJumpToSection={(c) => {
            const target = resolveGuidedQuestionTarget(c.questionKey);
            highlightGuidedSectionInDocument(target);
          }}
        />
      </div>
    );
  }

  const hasPillHelp = Boolean(current?.pillExplanations && Object.keys(current.pillExplanations).length > 0);

  return (
    <div
      data-guided-completion-panel="true"
      className={`rounded-xl border border-stone-300/90 bg-white shadow-sm ${compact ? "p-3 pb-28 sm:pb-4" : "p-4 pb-28 sm:p-5 sm:pb-8"}`}
      role="region"
      aria-label={GUIDED_COMPLETION_HEADING}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-stone-900">{GUIDED_COMPLETION_HEADING}</p>
          <p className="mt-0.5 text-xs text-stone-600">{GUIDED_COMPLETION_SUBHEADING}</p>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
          {session.completenessPercent}% complete
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-stone-800">{intro.subline}</p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80">
        <div
          className="h-full rounded-full bg-stone-800 transition-all duration-300"
          style={{ width: `${session.completenessPercent}%` }}
        />
      </div>

      {current ? (
        <div className="mt-4 rounded-lg border border-stone-200/90 bg-stone-50/80 p-3 sm:p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Question {Math.min(stepNum, total)} of {total}
          </p>
          <p className="mt-2 text-sm font-medium text-stone-900">{current.question}</p>
          {current.agreementImpact ? (
            <p className="mt-2 text-xs leading-relaxed text-stone-600">
              <span className="font-medium text-stone-700">Why this matters: </span>
              {current.agreementImpact}
            </p>
          ) : null}

          {isLocalApplying ? (
            <p className="mt-2 text-xs font-medium text-stone-600" role="status" aria-live="polite">
              Applying update…
            </p>
          ) : null}

          {showChangeCard && lastGuidedChange ? (
            <GuidedChangeCard
              change={lastGuidedChange}
              onViewChange={handleViewChange}
              onContinue={() => {
                advanceAfterChangeAck();
              }}
              onLooksGood={() => {
                advanceAfterChangeAck();
              }}
            />
          ) : null}

          {!showChangeCard && recommendView ? (
            <div className="mt-3 rounded-lg border border-sky-200/90 bg-sky-50/90 p-3" role="status" aria-live="polite">
              <p className="text-xs font-medium text-sky-900">Based on your prompt, LawDog recommends</p>
              <p className="mt-1 text-sm font-semibold text-sky-950">{recommendView.primary.label}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-sky-950/90">
                <span className="font-medium text-sky-900">Recommended because </span>
                {(recommendView.why || recommendView.explanation).replace(/^Recommended because\s*/i, "")}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  disabled={controlsDisabled}
                  className="rounded-lg bg-sky-800 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-900 disabled:opacity-40 sm:text-sm"
                  onClick={() =>
                    void applyRecommendChoice(
                      recommendView.primary,
                      current.id,
                      recommendView.why || recommendView.explanation,
                    )
                  }
                >
                  {applyingVariableId === current.id ? "Applying…" : "Use this recommendation"}
                </button>
                <button
                  type="button"
                  disabled={controlsDisabled}
                  className="rounded-lg border border-sky-400/80 bg-white px-3 py-2 text-xs font-semibold text-sky-950 hover:border-sky-600 disabled:opacity-40 sm:text-sm"
                  onClick={() => setRecommendView(null)}
                >
                  Show other options
                </button>
                <button
                  type="button"
                  disabled={controlsDisabled}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-40 sm:text-sm"
                  onClick={() => {
                    setRecommendView(null);
                    setCustomOpen(true);
                    onCustomPillSelected?.();
                  }}
                >
                  Custom
                </button>
              </div>
            </div>
          ) : !showChangeCard ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {current.suggestedDefaults.map((pill) => {
                const isRecommended = pill.id === current.recommendedPillId;
                const pillReason = resolveRecommendReasonForPill(current.id, pill.id, intakeRaw);
                return (
                  <button
                    key={pill.id}
                    type="button"
                    disabled={controlsDisabled}
                    className={`rounded-full border px-3 py-1.5 text-left text-xs font-medium shadow-sm transition disabled:opacity-40 sm:text-sm ${
                      isRecommended
                        ? "border-emerald-500/70 bg-emerald-50 text-emerald-950 hover:border-emerald-600"
                        : "border-stone-300 bg-white text-stone-800 hover:border-stone-500 hover:bg-stone-50"
                    }`}
                    onClick={() => handlePill(pill.id, pill.value, pill.label)}
                  >
                    {applyingVariableId === current.id && pill.id !== "custom" && !isRecommendPillId(pill.id)
                      ? "Applying…"
                      : pill.label}
                    {isRecommended && pillReason ? (
                      <span className="mt-0.5 block text-[10px] font-normal leading-snug text-emerald-800/90">
                        {pillReason}
                      </span>
                    ) : isRecommended && current.recommendedLabel ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-emerald-800/90">
                        {current.recommendedLabel}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {!showChangeCard && !recommendView && current.suggestedDefaults.find((p) => p.rationale && p.id !== RECOMMEND_PILL_ID)?.rationale ? (
            <p className="mt-2 text-[11px] italic text-stone-500">
              {current.suggestedDefaults.find((p) => p.rationale && p.id !== RECOMMEND_PILL_ID)?.rationale}
            </p>
          ) : null}

          {!showChangeCard && hasPillHelp ? (
            <details
              className="mt-2"
              open={helpExpanded}
              onToggle={(e) => setHelpExpanded((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-xs font-medium text-stone-600 hover:text-stone-900">
                What&apos;s the difference?
              </summary>
              <ul className="mt-1.5 list-none space-y-1 text-[11px] leading-relaxed text-stone-600">
                {Object.entries(current.pillExplanations!).map(([pillId, text]) => {
                  const label = current.suggestedDefaults.find((p) => p.id === pillId)?.label ?? pillId;
                  return (
                    <li key={pillId}>
                      <span className="font-medium text-stone-700">{label}: </span>
                      {text}
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}

          {!showChangeCard && customOpen ? (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-500"
                placeholder={`Your answer for ${current.label.toLowerCase()}…`}
                value={customDraft}
                disabled={controlsDisabled}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customDraft.trim()) {
                    void runApply(customDraft.trim(), customDraft.trim(), current.id);
                  }
                }}
                aria-label={`Custom answer for ${current.label}`}
              />
              <button
                type="button"
                className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-45"
                disabled={controlsDisabled || !customDraft.trim()}
                onClick={() => void runApply(customDraft.trim(), customDraft.trim(), current.id)}
              >
                {applyingVariableId === current.id ? "Applying…" : "Apply custom answer"}
              </button>
            </div>
          ) : null}

          {!showChangeCard ? (
            <button
              type="button"
              className="mt-3 text-xs font-medium text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline disabled:opacity-40"
              disabled={controlsDisabled}
              onClick={handleSkip}
            >
              Skip for now
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
