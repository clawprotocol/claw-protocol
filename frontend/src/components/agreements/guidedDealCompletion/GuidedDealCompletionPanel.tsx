import { useEffect, useMemo, useState } from "react";
import type { GuidedCompletionSession } from "./types";
import {
  frozenQuestionTotal,
  getCurrentVariable,
  guidedSessionIntro,
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
import type { GuidedAppliedChange } from "./guidedChangeTypes";
import { GuidedAppliedChangesReview } from "./GuidedAppliedChangesReview";
import type { GuidedCompletionPhase } from "./guidedCompletionPhase";
import { sessionReadyForBulkApply } from "./guidedBulkRegeneration";
import {
  buildBulkApplyChecklist,
  buildFinalAppliedAreaLabels,
  normalizeWhyText,
  resolveGuidedQuestionConfig,
  resolveOptionDisplayCopy,
  resolveQuestionNumber,
} from "./guidedQuestionConfig";
import { GuidedQuestionOptionCard } from "./GuidedQuestionOptionCard";
import { GuidedBulkApplyChecklist } from "./GuidedBulkApplyChecklist";
import { GuidedAppliedAreasSummary } from "./GuidedAppliedAreasSummary";

const SAVED_FLASH_MS = 520;

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
  const questionNum = current ? resolveQuestionNumber(session, current.id) : total;
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [recommendView, setRecommendView] = useState<RecommendForMeResult | null>(null);
  const [savedFlash, setSavedFlash] = useState<{ count: number } | null>(null);

  const controlsDisabled = externallyFrozen || applying || bulkApplyBusy;
  const bulkChecklist = useMemo(() => buildBulkApplyChecklist(session), [session]);
  const appliedAreas = useMemo(() => buildFinalAppliedAreaLabels(session), [session]);

  useEffect(() => {
    setRecommendView(null);
    setHelpExpanded(false);
    setCustomOpen(false);
    setCustomDraft("");
  }, [current?.id]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = window.setTimeout(() => setSavedFlash(null), SAVED_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [savedFlash]);

  useEffect(() => {
    if (!import.meta.env.DEV || !current) return;
    // eslint-disable-next-line no-console
    console.info("[guided-session-current]", {
      variableId: current.id,
      index: resolveGuidedCurrentIndex(session),
      phase,
      answeredCount,
    });
  }, [current?.id, session, phase, answeredCount]);

  const logReasonRendered = (variableId: string, pillId: string, reason: string | null) => {
    if (!import.meta.env.DEV || !reason) return;
    // eslint-disable-next-line no-console
    console.info("[guided-option-reason-rendered]", { variableId, pillId, reason });
  };

  const saveAnswer = (
    displayAnswer: string,
    instructionAnswer: string,
    variableId: string,
    recommendationReason?: string | null,
    implementationPreview?: string,
  ) => {
    if (!current || controlsDisabled || variableId !== current.id) return;
    const nextCount = answeredCount + (session.answered[variableId] ? 0 : 1);
    onSaveAnswer(variableId, displayAnswer, {
      recommendationReason,
      instructionAnswer,
      implementationPreview,
    });
    setSavedFlash({ count: nextCount });
    setCustomOpen(false);
    setCustomDraft("");
    setRecommendView(null);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-answer-saved]", { variableId, displayAnswer });
      // eslint-disable-next-line no-console
      console.info("[guided-question-advanced]", { variableId });
    }
  };

  const applyRecommendChoice = (
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
    const copy = resolveOptionDisplayCopy({
      variableId,
      pillId: "recommend",
      pillLabel: choice.label,
      pillValue: choice.value,
      intakeRaw,
      variable: current,
      instructionAnswer,
    });
    saveAnswer(
      choice.label,
      instructionAnswer,
      variableId,
      recommendationReason ?? copy.why,
      copy.lawDogWill,
    );
  };

  const handleRecommendForMe = () => {
    if (!current || controlsDisabled) return;
    const rec = resolveRecommendForMe(current, intakeRaw);
    logReasonRendered(current.id, RECOMMEND_PILL_ID, rec.why || rec.explanation);
    setCustomOpen(false);
    if (rec.applyDirect) {
      applyRecommendChoice(rec.primary, current.id, rec.why || rec.explanation);
      return;
    }
    setRecommendView(rec);
  };

  const handlePill = (pillId: string, value: string, label: string) => {
    if (!current || controlsDisabled) return;
    const copy = resolveOptionDisplayCopy({
      variableId: current.id,
      pillId,
      pillLabel: label,
      pillValue: value,
      intakeRaw,
      variable: current,
    });
    if (copy.why) logReasonRendered(current.id, pillId, copy.why);
    const resolution = resolveGuidedAnswerForPill(current, pillId, label, value);
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
    saveAnswer(
      resolution.displayAnswer,
      resolution.instructionAnswer,
      current.id,
      copy.why,
      copy.lawDogWill,
    );
  };

  const handleSkip = () => {
    if (!current || controlsDisabled) return;
    onSessionChange(skipGuidedVariable(session, current.id));
    setCustomOpen(false);
    setCustomDraft("");
    setRecommendView(null);
    setSavedFlash(null);
  };

  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  if (applied) {
    return (
      <div data-guided-completion-panel="true" className={compact ? "pb-6" : "pb-8"}>
        <p className="mb-2 text-sm font-semibold text-stone-900">Review your updated Pro agreement</p>
        <p className="mb-4 text-xs leading-relaxed text-stone-600">
          LawDog applied your answers in one pass. Review the agreement, then send when ready.
        </p>
        <GuidedAppliedAreasSummary areas={appliedAreas} />
        {appliedChanges.length > 0 ? (
          <div className="mt-4">
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
        <p className="mt-1 text-xs leading-relaxed text-stone-600">
          Review your choices. Edit any answer, then update your Pro agreement in one pass.
        </p>
        <ul className="mt-3 space-y-2">
          {session.queue.map((id) => {
            const ans = session.answered[id];
            if (!ans) return null;
            const v = session.variables.find((x) => x.id === id);
            const meta = session.answeredMeta?.[id];
            const cfg = resolveGuidedQuestionConfig(id);
            return (
              <li key={id} className="rounded-lg border border-stone-200/90 bg-stone-50/80 px-3 py-2 text-xs">
                <p className="font-medium text-stone-900">{v?.label ?? cfg.targetSectionLabel}</p>
                <p className="mt-0.5 text-stone-700">{ans}</p>
                {meta?.implementationPreview ? (
                  <p className="mt-1 text-[11px] text-stone-500">
                    <span className="font-medium">LawDog will: </span>
                    {meta.implementationPreview}
                  </p>
                ) : null}
                {onEditAnswer ? (
                  <button
                    type="button"
                    className="mt-1.5 text-[11px] font-medium text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
                    disabled={applying || bulkApplyBusy}
                    onClick={() => onEditAnswer(id)}
                  >
                    Edit answer
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {applying || bulkApplyBusy ? (
          <GuidedBulkApplyChecklist items={bulkChecklist} />
        ) : null}
        {bulkApplyError ? (
          <p className="mt-3 text-xs font-medium text-amber-800" role="alert">
            {bulkApplyError}
          </p>
        ) : null}
        <div className="mt-4">
          <button
            type="button"
            className="w-full rounded-lg bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
            disabled={!ready || applying || bulkApplyBusy || externallyFrozen}
            onClick={() => onBulkApply?.()}
          >
            Update Pro agreement
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
            LawDog will apply your {answeredCount} answer{answeredCount === 1 ? "" : "s"} in one clean pass.
          </p>
        </div>
      </div>
    );
  }

  const qConfig = current ? resolveGuidedQuestionConfig(current.id) : null;
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
      </div>

      <p className="mt-3 text-xs leading-relaxed text-stone-600">{intro.subline}</p>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-stone-600">
        <span className="font-medium tabular-nums">
          {answeredCount} of {total} completed
        </span>
        <span className="tabular-nums text-stone-500">{progressPct}%</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-stone-200/80">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {savedFlash ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200/90 bg-emerald-50/95 px-3 py-2"
          role="status"
          aria-live="polite"
          data-testid="guided-saved-flash"
        >
          <span className="text-emerald-700" aria-hidden>
            ✓
          </span>
          <div>
            <p className="text-xs font-semibold text-emerald-900">
              {savedFlash.count} of {total} completed
            </p>
            <p className="text-[11px] leading-relaxed text-emerald-800/90">
              Saved. We&apos;ll apply this when all questions are complete.
            </p>
          </div>
        </div>
      ) : null}

      {collecting && current ? (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Question {questionNum} of {total}
          </p>
          <p className="text-base font-semibold leading-snug text-stone-900 sm:text-lg">{current.question}</p>
          {(qConfig?.whyThisMatters || current.agreementImpact) ? (
            <p className="text-xs leading-relaxed text-stone-500">
              {qConfig?.whyThisMatters ?? current.agreementImpact}
            </p>
          ) : null}

          {recommendView ? (
            <div className="space-y-2">
              <GuidedQuestionOptionCard
                label={recommendView.primary.label}
                recommended
                why={normalizeWhyText(recommendView.why || recommendView.explanation)}
                lawDogWill={resolveOptionDisplayCopy({
                  variableId: current.id,
                  pillId: "recommend",
                  pillLabel: recommendView.primary.label,
                  pillValue: recommendView.primary.value,
                  intakeRaw,
                  variable: current,
                  instructionAnswer: recommendView.primary.value,
                }).lawDogWill}
                disabled={controlsDisabled}
                onSelect={() =>
                  applyRecommendChoice(
                    recommendView.primary,
                    current.id,
                    recommendView.why || recommendView.explanation,
                  )
                }
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={controlsDisabled}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                  onClick={() => setRecommendView(null)}
                >
                  Show other options
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {current.suggestedDefaults.map((pill) => {
                if (isRecommendPillId(pill.id)) return null;
                const resolution = resolveGuidedAnswerForPill(current, pill.id, pill.label, pill.value);
                const instructionAnswer =
                  resolution.action === "apply" ? resolution.instructionAnswer : pill.value;
                const copy = resolveOptionDisplayCopy({
                  variableId: current.id,
                  pillId: pill.id,
                  pillLabel: pill.label,
                  pillValue: pill.value,
                  intakeRaw,
                  variable: current,
                  instructionAnswer,
                });
                return (
                  <GuidedQuestionOptionCard
                    key={pill.id}
                    label={pill.label}
                    recommended={copy.recommended}
                    why={copy.why}
                    lawDogWill={copy.lawDogWill}
                    disabled={controlsDisabled}
                    onSelect={() => handlePill(pill.id, pill.value, pill.label)}
                  />
                );
              })}
              {current.suggestedDefaults.some((p) => isRecommendPillId(p.id)) ? (
                <button
                  type="button"
                  disabled={controlsDisabled}
                  className="w-full rounded-lg border border-dashed border-sky-300/90 bg-sky-50/50 px-3 py-2 text-left text-xs font-semibold text-sky-900 hover:bg-sky-50 disabled:opacity-40"
                  onClick={() => handleRecommendForMe()}
                >
                  Recommend for me
                </button>
              ) : null}
              <button
                type="button"
                disabled={controlsDisabled}
                className="text-[11px] font-medium text-stone-500 underline-offset-2 hover:text-stone-700 hover:underline disabled:opacity-40"
                onClick={() => {
                  setRecommendView(null);
                  setCustomOpen(true);
                  onCustomPillSelected?.();
                }}
              >
                Custom answer
              </button>
            </div>
          )}

          {hasPillHelp ? (
            <details
              className="mt-1"
              open={helpExpanded}
              onToggle={(e) => setHelpExpanded((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-[11px] font-medium text-stone-500 hover:text-stone-800">
                What&apos;s the difference?
              </summary>
              <ul className="mt-1.5 list-none space-y-1 text-[11px] leading-relaxed text-stone-500">
                {Object.entries(current.pillExplanations!).map(([pillId, text]) => {
                  const label = current.suggestedDefaults.find((p) => p.id === pillId)?.label ?? pillId;
                  return (
                    <li key={pillId}>
                      <span className="font-medium text-stone-600">{label}: </span>
                      {text}
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}

          {customOpen ? (
            <div className="space-y-2 rounded-lg border border-stone-200 bg-white p-3">
              <input
                type="text"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
                placeholder={`Your answer for ${current.label.toLowerCase()}…`}
                value={customDraft}
                disabled={controlsDisabled}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customDraft.trim()) {
                    const preview = resolveOptionDisplayCopy({
                      variableId: current.id,
                      pillId: "custom",
                      pillLabel: customDraft.trim(),
                      pillValue: customDraft.trim(),
                      intakeRaw,
                      variable: current,
                    }).lawDogWill;
                    saveAnswer(customDraft.trim(), customDraft.trim(), current.id, null, preview);
                  }
                }}
              />
              <button
                type="button"
                className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-45"
                disabled={controlsDisabled || !customDraft.trim()}
                onClick={() => {
                  const preview = resolveOptionDisplayCopy({
                    variableId: current.id,
                    pillId: "custom",
                    pillLabel: customDraft.trim(),
                    pillValue: customDraft.trim(),
                    intakeRaw,
                    variable: current,
                  }).lawDogWill;
                  saveAnswer(customDraft.trim(), customDraft.trim(), current.id, null, preview);
                }}
              >
                Save answer
              </button>
            </div>
          ) : null}

          <footer className="border-t border-stone-100 pt-3">
            <button
              type="button"
              className="text-[11px] text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline disabled:opacity-40"
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
