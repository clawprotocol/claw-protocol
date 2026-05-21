import { useMemo } from "react";
import type { GuidedCompletionSession } from "./types";
import {
  applyGuidedAnswer,
  formatRefineInstructionForAnswer,
  getCurrentVariable,
  guidedSessionIntro,
  isGuidedCompletionComplete,
  skipGuidedVariable,
} from "./guidedCompletionEngine";
import { GUIDED_COMPLETION_HEADING, GUIDED_COMPLETION_SUBHEADING } from "./friendlyProCompletionCopy";

export type GuidedDealCompletionPanelProps = {
  session: GuidedCompletionSession;
  onSessionChange: (next: GuidedCompletionSession) => void;
  /** Called with LawDog refine instruction when user picks an answer. */
  onApplyAnswer: (instruction: string, variableId: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function GuidedDealCompletionPanel({
  session,
  onSessionChange,
  onApplyAnswer,
  disabled = false,
  compact = false,
}: GuidedDealCompletionPanelProps) {
  const intro = useMemo(() => guidedSessionIntro(session), [session]);
  const current = getCurrentVariable(session);
  const done = isGuidedCompletionComplete(session);
  const total = session.queue.length;
  const answered = Object.keys(session.answered).length;
  const stepNum = Math.min(total, answered + session.skipped.size + (current ? 1 : 0));

  const handlePill = (value: string) => {
    if (!current || disabled) return;
    const instruction = formatRefineInstructionForAnswer(current, value);
    if (!instruction.trim()) return;
    const next = applyGuidedAnswer(session, current.id, value);
    onSessionChange(next);
    onApplyAnswer(instruction, current.id);
  };

  const handleSkip = () => {
    if (!current || disabled) return;
    onSessionChange(skipGuidedVariable(session, current.id));
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
            <p className="mt-1 text-xs leading-relaxed text-stone-600">{current.agreementImpact}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {current.suggestedDefaults.map((pill) => (
              <button
                key={pill.id}
                type="button"
                disabled={disabled || (pill.id === "custom" && !pill.value)}
                className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-stone-800 shadow-sm transition hover:border-stone-500 hover:bg-stone-50 disabled:opacity-40 sm:text-sm"
                onClick={() => handlePill(pill.value || pill.label)}
              >
                {pill.label}
              </button>
            ))}
          </div>
          {current.suggestedDefaults.find((p) => p.rationale)?.rationale ? (
            <p className="mt-2 text-[11px] italic text-stone-500">
              {current.suggestedDefaults.find((p) => p.rationale)?.rationale}
            </p>
          ) : null}

          <button
            type="button"
            className="mt-3 text-xs font-medium text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline"
            disabled={disabled}
            onClick={handleSkip}
          >
            Skip for now
          </button>
        </div>
      ) : null}
    </div>
  );
}
