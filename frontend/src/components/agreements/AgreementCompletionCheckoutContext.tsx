/**
 * Create-flow checkout: one narrative column (fewer competing cards).
 * Compact variant for billing return echo.
 */

import {
  CHECKOUT_PRO_HELPS_BULLETS,
  CHECKOUT_PRO_HELPS_INTRO,
  PRO_UPGRADE_REASSURANCE,
} from "../../launch/simpleProduct/proConversionCopy";

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
  const { completionLabel, className = "", compact } = props;

  if (compact) {
    return (
      <div className={`space-y-4 ${className}`.trim()}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">LawDog Pro</p>
        <p className="text-[15px] font-medium leading-7 text-slate-200 sm:text-base">{CHECKOUT_PRO_HELPS_INTRO}</p>
        <ul className="list-disc space-y-2.5 pl-4 text-[15px] leading-7 text-slate-200 sm:text-base">
          {CHECKOUT_PRO_HELPS_BULLETS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-sm leading-7 text-slate-300">{PRO_UPGRADE_REASSURANCE}</p>
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">LawDog Pro</p>
          <p className="mt-2 text-[15px] font-medium leading-7 text-slate-100 tracking-tight sm:text-base">
            {CHECKOUT_PRO_HELPS_INTRO}
          </p>
          <ul className="mt-3 space-y-2.5 text-[15px] leading-7 text-slate-200 sm:text-base">
            {CHECKOUT_PRO_HELPS_BULLETS.map((r) => (
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
          <p className="text-[15px] font-semibold leading-7 text-slate-100 sm:text-base">{PRO_UPGRADE_REASSURANCE}</p>
          <p className="mt-1 text-[15px] leading-7 text-slate-300 sm:text-base">
            Review first, then share, send, or sign only when you confirm.
          </p>
        </section>

        <hr className="border-slate-800/60" />

        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">Completing</p>
          <p className="mt-2 text-lg sm:text-xl font-semibold tracking-tight text-slate-100">
            {completingLabel(completionLabel)}
          </p>
        </section>
      </div>
    </div>
  );
}
