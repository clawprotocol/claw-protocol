/**
 * Create-flow checkout: one narrative column (fewer competing cards).
 * Compact variant for billing return echo.
 */

import { useId, useState } from "react";

const DEFAULT_REASONS = [
  "Payment, scope, endings, and risk need fuller treatment",
  "This is more than a basic starter draft",
] as const;

function completingLabel(raw: string | null | undefined): string {
  const t = (raw || "").trim();
  return t || "This agreement";
}

export function AgreementCompletionCheckoutContextPanel(props: {
  reasons?: readonly string[] | null;
  completionLabel?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const { reasons, completionLabel, className = "", compact } = props;
  const lines =
    reasons && reasons.length > 0 ? reasons.slice(0, 4) : (Array.from(DEFAULT_REASONS) as string[]);
  const [addedOpen, setAddedOpen] = useState(false);
  const addedId = useId();

  if (compact) {
    return (
      <div className={`space-y-4 ${className}`.trim()}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Why upgrade
        </p>
        <p className="text-[15px] font-medium leading-7 text-slate-200 sm:text-base">
          This deal needs stronger terms than the starter draft. Unlock the full agreement in one step.
        </p>
        <ul className="list-disc space-y-2.5 pl-4 text-[15px] leading-7 text-slate-200 sm:text-base">
          {lines.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-sm leading-7 text-slate-300">
          Nothing is sent automatically. Review first, then send only when you confirm.
        </p>
        <p className="text-sm text-slate-400">
          Completing: <span className="text-slate-200">{completingLabel(completionLabel)}</span>
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-slate-800/80 bg-slate-950/25 p-5 sm:p-6 lg:p-7 ${className}`.trim()}
    >
      <div className="space-y-6 sm:space-y-7 lg:space-y-8">
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
            Why upgrade
          </p>
          <p className="mt-2 text-[15px] font-medium leading-7 text-slate-100 tracking-tight sm:text-base">
            This deal needs stronger terms than the starter draft. Unlock the full agreement in one step.
          </p>
          <ul className="mt-3 space-y-2.5 text-[15px] leading-7 text-slate-200 sm:text-base">
            {lines.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="shrink-0 text-slate-400" aria-hidden>
                  •
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>

        <hr className="border-slate-800/60" />

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">What you get</p>
          <ul className="mt-3 space-y-2.5 text-[15px] leading-7 text-slate-200 sm:text-base">
            <li className="flex gap-2">
              <span className="text-emerald-400" aria-hidden>
                ✓
              </span>
              Collaborate on terms before sending
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400" aria-hidden>
                ✓
              </span>
              Full agreement structure + stronger clauses
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400" aria-hidden>
                ✓
              </span>
              Tracked e-signing + timestamped proof when ready
            </li>
          </ul>
        </section>

        <hr className="border-slate-800/60" />

        <section>
          <p className="text-[15px] font-semibold leading-7 text-slate-100 sm:text-base">Nothing is sent automatically</p>
          <p className="mt-1 text-[15px] leading-7 text-slate-300 sm:text-base">
            Review first, then send only when you confirm
          </p>
        </section>

        <hr className="border-slate-800/60" />

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">Completing</p>
          <p className="mt-2 text-lg sm:text-xl font-semibold tracking-tight text-slate-100">
            {completingLabel(completionLabel)}
          </p>
        </section>

        <div>
          <button
            type="button"
            id={`${addedId}-trigger`}
            aria-expanded={addedOpen}
            aria-controls={`${addedId}-panel`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 underline decoration-slate-500 decoration-1 underline-offset-4 transition hover:text-slate-100 hover:decoration-slate-400"
            onClick={() => setAddedOpen((o) => !o)}
          >
            See what will be added
            <span className="text-slate-400 no-underline" aria-hidden>
              {addedOpen ? "↑" : "→"}
            </span>
          </button>
          {addedOpen ? (
            <ul
              id={`${addedId}-panel`}
              role="region"
              aria-labelledby={`${addedId}-trigger`}
              className="mt-3 space-y-2.5 border-l border-slate-800/80 pl-4 text-[15px] leading-7 text-slate-300 sm:text-base"
            >
              <li>Clearer termination and notice paths</li>
              <li>Liability, indemnity, and dispute steps where they apply</li>
              <li>Cleaner party obligations so signatures match intent</li>
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
