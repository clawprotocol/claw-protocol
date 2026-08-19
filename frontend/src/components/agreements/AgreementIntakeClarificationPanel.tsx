import { useEffect, useRef } from "react";
import type { AgreementIntakeClarification } from "./agreementIntakeClarification";

export function AgreementIntakeClarificationPanel(props: {
  clarification: AgreementIntakeClarification;
  onUseSuggested: () => void;
  onEditMyself: () => void;
}) {
  const { clarification, onUseSuggested, onEditMyself } = props;
  const hasSuggested = Boolean(clarification.suggestedRewrite?.trim());
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      el.scrollIntoView();
    }
    // Focus primary action for keyboard/AT users without stealing mid-edit focus from textarea
    // when they chose "edit myself" (panel unmounts). On mount, announce via region.
  }, [clarification.kind, clarification.title]);

  return (
    <div
      ref={rootRef}
      id="agreement-intake-clarification"
      className="mt-4 space-y-4 rounded-lg border border-amber-900/40 bg-slate-900/55 p-4 sm:p-5"
      role="region"
      aria-labelledby="agreement-intake-clarification-title"
      data-testid="agreement-intake-clarification"
    >
      <div>
        <h2
          id="agreement-intake-clarification-title"
          className="text-base font-semibold tracking-tight text-slate-50 sm:text-lg"
        >
          {clarification.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-[0.9375rem]">{clarification.why}</p>
      </div>

      {clarification.whatWeHeard.length > 0 ? (
        <div className="rounded-md border border-slate-700/50 bg-slate-950/50 px-4 py-3.5 text-sm text-slate-300">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            What we understood from your prompt
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 leading-relaxed">
            {clarification.whatWeHeard.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-md border border-slate-700/50 bg-slate-950/40 px-4 py-3.5 text-sm text-slate-300">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          How to revise so we can draft
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-4 leading-relaxed">
          {clarification.guidedSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      {hasSuggested ? (
        <div className="rounded-md border border-emerald-900/35 bg-emerald-950/20 px-4 py-3.5 text-sm text-slate-200">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-500/90">
            Suggested draft request
          </p>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-slate-200">
            {clarification.suggestedRewrite}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Bracketed names are placeholders — replace them with real legal entity names, then Create agreement.
            One clear draft request is enough; we will not invent extra signing parties.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:flex-wrap sm:justify-end">
        {hasSuggested ? (
          <button
            type="button"
            className="min-h-[2.75rem] w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-center text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-400 sm:min-w-[12rem] sm:flex-1"
            onClick={onUseSuggested}
          >
            {clarification.primaryCtaLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="min-h-[2.75rem] w-full rounded-lg border border-slate-600/70 bg-slate-900/75 px-4 py-2.5 text-center text-sm font-semibold text-slate-100 shadow-sm transition hover:border-slate-500 hover:bg-slate-800/80 sm:min-w-[12rem] sm:flex-1"
          onClick={onEditMyself}
        >
          {hasSuggested ? clarification.secondaryCtaLabel : clarification.primaryCtaLabel}
        </button>
      </div>
    </div>
  );
}
