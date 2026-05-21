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
import { RECOMMEND_PILL_ID, resolveRecommendForMe, type RecommendForMeResult } from "./intakeRecommendationEngine";

export type GuidedDealCompletionPanelProps = {
  session: GuidedCompletionSession;
  intakeRaw?: string | null;
  onSessionChange: (next: GuidedCompletionSession) => void;
  /**
   * Applies guided refine; returns true on success. Session advance happens in parent on success only.
   */
  onApplyAnswer: (instruction: string, variableId: string, displayAnswer: string) => Promise<boolean> | boolean;
  /** Focus the freeform custom instruction area when user picks Custom. */
  onCustomPillSelected?: () => void;
  /** Document commit freeze only — not global premium loading. */
  externallyFrozen?: boolean;
  compact?: boolean;
};

export function GuidedDealCompletionPanel({
  session,
  intakeRaw,
  onSessionChange,
  onApplyAnswer,
  onCustomPillSelected,
  externallyFrozen = false,
  compact = false,
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

  const isLocalApplying = applyingVariableId !== null;
  const controlsDisabled = externallyFrozen || isLocalApplying;

  useEffect(() => {
    setRecommendView(null);
    setHelpExpanded(false);
    setCustomOpen(false);
    setCustomDraft("");
    setApplyingVariableId(null);
  }, [current?.id]);

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

  const runApply = async (displayAnswer: string, instructionAnswer: string, variableId: string) => {
    if (!current || controlsDisabled || variableId !== current.id) return;
    const instruction = formatRefineInstructionForAnswer(current, instructionAnswer);
    if (!instruction.trim()) return;
    setApplyingVariableId(variableId);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-answer-click]", { variableId, displayAnswer });
      // eslint-disable-next-line no-console
      console.info("[guided-answer-refine-start]", { variableId });
    }
    try {
      const ok = await Promise.resolve(onApplyAnswer(instruction, variableId, displayAnswer));
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info(ok ? "[guided-answer-refine-success]" : "[guided-answer-refine-failed]", { variableId });
      }
      if (ok) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.info("[guided-answer-advance]", { variableId });
        }
        setCustomOpen(false);
        setCustomDraft("");
        setRecommendView(null);
      }
    } finally {
      setApplyingVariableId(null);
    }
  };

  const handlePill = (pillId: string, value: string, label: string) => {
    if (!current || controlsDisabled) return;
    const resolution = resolveGuidedAnswerForPill(current, pillId, label, value);
    if (resolution.action === "recommend") {
      const rec = resolveRecommendForMe(current, intakeRaw);
      if (rec) {
        setRecommendView(rec);
        setCustomOpen(false);
      }
      return;
    }
    if (resolution.action === "custom") {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info("[guided-panel-custom-open]", { variableId: current.id });
      }
      setRecommendView(null);
      setCustomOpen(true);
      onCustomPillSelected?.();
      return;
    }
    void runApply(resolution.displayAnswer, resolution.instructionAnswer, current.id);
  };

  const handleSkip = () => {
    if (!current || controlsDisabled) return;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-panel-skip]", { variableId: current.id });
    }
    onSessionChange(skipGuidedVariable(session, current.id));
    setCustomOpen(false);
    setCustomDraft("");
    setRecommendView(null);
  };

  if (done) {
    return (
      <div
        className={`rounded-xl border border-emerald-200/90 bg-emerald-50/80 ${compact ? "p-3" : "p-4"}`}
        role="status"
      >
        <p className="text-sm font-semibold text-emerald-900">{intro.headline}</p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-800/90">{intro.subline}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-200/60">
          <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: "100%" }} />
        </div>
      </div>
    );
  }

  const hasPillHelp = Boolean(current?.pillExplanations && Object.keys(current.pillExplanations).length > 0);

  return (
    <div
      className={`rounded-xl border border-stone-300/90 bg-white shadow-sm ${compact ? "p-3" : "p-4 sm:p-5"}`}
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

          {recommendView ? (
            <div className="mt-3 rounded-lg border border-sky-200/90 bg-sky-50/90 p-3">
              <p className="text-xs font-medium text-sky-900">Suggested for your deal</p>
              <p className="mt-1.5 text-xs leading-relaxed text-sky-950/90">{recommendView.explanation}</p>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-sky-800/80">Recommended</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {recommendView.choices.map((choice) => (
                  <button
                    key={choice.pillId}
                    type="button"
                    disabled={controlsDisabled}
                    className="rounded-full border border-sky-400/80 bg-white px-3 py-1.5 text-left text-xs font-semibold text-sky-950 shadow-sm transition hover:border-sky-600 disabled:opacity-40 sm:text-sm"
                    onClick={() =>
                      void runApply(
                        choice.label,
                        choice.value || choice.label,
                        current.id,
                      )
                    }
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-sky-800 underline-offset-2 hover:underline"
                disabled={controlsDisabled}
                onClick={() => setRecommendView(null)}
              >
                See all options
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {current.suggestedDefaults.map((pill) => {
                const isRecommended = pill.id === current.recommendedPillId;
                const isApplyingThis = applyingVariableId === current.id;
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
                    {isApplyingThis && pill.id !== "custom" ? "Applying…" : pill.label}
                    {isRecommended && current.recommendedLabel ? (
                      <span className="mt-0.5 block text-[10px] font-normal text-emerald-800/90">
                        {current.recommendedLabel}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          {!recommendView && current.suggestedDefaults.find((p) => p.rationale && p.id !== RECOMMEND_PILL_ID)?.rationale ? (
            <p className="mt-2 text-[11px] italic text-stone-500">
              {current.suggestedDefaults.find((p) => p.rationale && p.id !== RECOMMEND_PILL_ID)?.rationale}
            </p>
          ) : null}

          {hasPillHelp ? (
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

          {customOpen ? (
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

          <button
            type="button"
            className="mt-3 text-xs font-medium text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline disabled:opacity-40"
            disabled={controlsDisabled}
            onClick={handleSkip}
          >
            Skip for now
          </button>
        </div>
      ) : null}
    </div>
  );
}
