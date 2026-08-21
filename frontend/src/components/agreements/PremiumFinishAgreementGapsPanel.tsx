import { useState, useCallback, useId } from "react";

type Props = {
  /** LLM-generated questions specific to THIS user's prompt (from missing-facts API). */
  questions: string[];
  /** Combined answers string passed to parent. */
  oneField: string;
  /** Callback when answers change. */
  onOneField: (s: string) => void;
  /** Submit answers and proceed to generation. */
  onContinue: () => void;
  /** Skip questions and use defaults. */
  onUseDefaults: () => void;
  /** Dismiss panel without action. */
  onDismiss: () => void;
  /** Disable all inputs (e.g., during API call). */
  continueDisabled: boolean;
};

/**
 * Pre–full-draft: LLM-generated clarification questions for missing tenets.
 *
 * RULES:
 * - Questions come from the LLM API (ask-before-draft / missing-facts)
 * - Questions are SPECIFIC to THIS dump (e.g. "Who is paying the 7% — Harbor or Mesa?")
 * - NOT a canned generic list
 * - NOT a second free-form dump box
 * - One targeted input field per LLM-generated question
 * - Only asks for missing tenets (parties, scope, payment, term, governing law)
 *   that are actually absent or contradictory in the prompt
 *
 * This panel appears BEFORE the Pro agreement copy renders when the existing
 * missing-facts / NEEDS_CLARIFICATION LLM path determines clarification is needed.
 */
export function PremiumFinishAgreementGapsPanel({
  questions,
  oneField,
  onOneField,
  onContinue,
  onUseDefaults,
  onDismiss,
  continueDisabled,
}: Props) {
  const baseId = useId();
  
  // Track individual answer for each LLM-generated question
  const [answers, setAnswers] = useState<string[]>(() => {
    // Try to parse existing oneField if resuming
    if (oneField && questions.length > 0) {
      // If oneField has numbered answers, parse them
      const parsed: string[] = [];
      for (let i = 0; i < questions.length; i++) {
        const pattern = new RegExp(`(?:^|\\n)\\s*${i + 1}[.):]+\\s*([^\\n]+)`, "i");
        const match = oneField.match(pattern);
        parsed.push(match?.[1]?.trim() || "");
      }
      if (parsed.some((a) => a.length > 0)) {
        return parsed;
      }
    }
    return questions.map(() => "");
  });

  // Update answer for a specific question and sync to parent
  const handleAnswerChange = useCallback((index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      // Serialize answers to oneField format for parent
      // Format: "1. answer one\n2. answer two" - preserves question ordering
      const serialized = next
        .map((a, i) => (a.trim() ? `${i + 1}. ${a.trim()}` : ""))
        .filter(Boolean)
        .join("\n");
      onOneField(serialized);
      return next;
    });
  }, [onOneField]);

  const questionCount = questions.length;
  const headingText = questionCount === 1
    ? "One quick question"
    : `${questionCount} quick questions`;

  // Enable continue if at least one answer is provided
  const hasAnyAnswer = answers.some((a) => a.trim().length > 0);

  // If no questions, don't render anything
  if (questionCount === 0) {
    return null;
  }

  return (
    <div className="w-full text-left" role="region" aria-label="Answer clarification questions">
      <h2
        id="claw-premium-finish-facts-title"
        className="text-center text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl"
      >
        {headingText}
      </h2>
      <p className="mt-3 text-center text-sm leading-relaxed text-slate-400 sm:text-base">
        Help us understand your agreement better.
      </p>

      <div className="mt-5 space-y-5">
        {questions.map((question, index) => {
          const inputId = `${baseId}-q-${index}`;
          return (
            <div key={inputId}>
              <label
                htmlFor={inputId}
                className="block text-sm font-medium leading-relaxed text-slate-200"
              >
                {question}
              </label>
              <input
                id={inputId}
                type="text"
                value={answers[index] || ""}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                disabled={continueDisabled}
                className="mt-2 w-full rounded-lg border border-slate-600/70 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Your answer"
                autoComplete="off"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end sm:gap-3">
        <button
          type="button"
          className="order-2 w-full rounded-xl border border-slate-500/60 bg-slate-900/70 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-400 sm:order-1 sm:w-auto sm:min-w-[8.5rem]"
          onClick={onUseDefaults}
          disabled={continueDisabled}
        >
          Use defaults
        </button>
        <button
          type="button"
          className="order-1 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-black shadow-lg transition hover:bg-emerald-400 sm:order-2 sm:w-auto sm:min-w-[10rem]"
          onClick={onContinue}
          disabled={continueDisabled || !hasAnyAnswer}
        >
          Continue
        </button>
      </div>
      <p className="mt-4 text-center">
        <button
          type="button"
          className="text-xs font-medium text-slate-500 underline decoration-slate-600/80 underline-offset-2 hover:text-slate-300"
          onClick={onDismiss}
        >
          Close for now
        </button>
      </p>
    </div>
  );
}
