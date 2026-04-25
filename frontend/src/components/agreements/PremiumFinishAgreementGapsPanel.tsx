type Props = {
  questions: string[];
  oneField: string;
  onOneField: (s: string) => void;
  onContinue: () => void;
  onUseDefaults: () => void;
  onDismiss: () => void;
  continueDisabled: boolean;
};

/**
 * Pre–full-draft: compact gap resolver — one free-text field for all answers.
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
  return (
    <div className="w-full text-left" role="region" aria-label="Finish your agreement">
      <h2
        id="claw-premium-finish-facts-title"
        className="text-center text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl"
      >
        Finish your agreement
      </h2>
      <p className="mt-3 text-center text-sm leading-relaxed text-slate-400 sm:text-base">
        A few details will help your complete agreement match your deal. Answer in the box — bullets or short sentences
        are fine. Or use defaults to continue.
      </p>
      <ol className="mt-5 space-y-2.5 rounded-xl border border-amber-500/25 bg-amber-950/20 p-4 text-left text-sm leading-relaxed text-amber-50/95 sm:text-[15px]">
        {questions.map((q, i) => (
          <li key={q} className="flex gap-2">
            <span className="shrink-0 font-semibold text-amber-300/90">{i + 1}.</span>
            <span>{q}</span>
          </li>
        ))}
      </ol>
      <label htmlFor="claw-premium-finish-facts-textarea" className="mt-5 block text-sm font-medium text-slate-300">
        Your details (one field is enough)
      </label>
      <textarea
        id="claw-premium-finish-facts-textarea"
        value={oneField}
        onChange={(e) => onOneField(e.target.value)}
        rows={5}
        className="mt-2 w-full rounded-xl border border-slate-600/70 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-100 shadow-inner shadow-black/20 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:min-h-[6rem] sm:px-4 sm:text-base"
        placeholder="e.g. Governing law: New York. Commission: 8% of net, paid 15th monthly. Exclusivity: 6 months US only."
        autoComplete="on"
        autoCapitalize="sentences"
        disabled={continueDisabled}
      />
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
          disabled={continueDisabled}
        >
          Build my agreement
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
