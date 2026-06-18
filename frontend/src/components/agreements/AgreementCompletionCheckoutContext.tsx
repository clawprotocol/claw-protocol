/**
 * Create-flow checkout: one narrative column (fewer competing cards).
 * Compact variant for billing return echo.
 */

import {
  CHECKOUT_COMPLEX_AGREEMENT_BULLETS,
  CHECKOUT_FREE_PRO_EXPLAINER_LINES,
  PRO_UPGRADE_REASSURANCE,
} from "../../launch/simpleProduct/proConversionCopy";
import {
  CHECKOUT_PRO_CONTEXT_COMPLETING_LABEL,
  CHECKOUT_PRO_CONTEXT_LINES,
  CHECKOUT_PRO_CONTEXT_TITLE,
} from "../../launch/simpleProduct/proTransformationCopy";

function completingLabel(raw: string | null | undefined): string {
  const t = (raw || "").trim();
  return t || "This agreement";
}

export function AgreementCompletionCheckoutContextPanel(props: {
  reasons?: readonly string[] | null;
  completionLabel?: string | null;
  className?: string;
  compact?: boolean;
  complexAgreement?: boolean;
}) {
  const { completionLabel, className = "", compact, complexAgreement = false } = props;

  if (complexAgreement) {
    return (
      <div
        className={`checkout-pro-context-complex min-w-0 space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/25 p-4 sm:p-5 lg:p-6 ${className}`.trim()}
        data-testid="checkout-pro-context-complex"
      >
        {CHECKOUT_FREE_PRO_EXPLAINER_LINES.map((line) => (
          <p key={line} className="text-sm leading-relaxed text-slate-400">
            {line}
          </p>
        ))}
        <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
          {CHECKOUT_COMPLEX_AGREEMENT_BULLETS.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-emerald-400/90" aria-hidden>
                ✓
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs leading-snug text-slate-500">{PRO_UPGRADE_REASSURANCE}</p>
        <p className="text-xs text-slate-500">
          {CHECKOUT_PRO_CONTEXT_COMPLETING_LABEL}:{" "}
          <span className="text-slate-300">{completingLabel(completionLabel)}</span>
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={`checkout-pro-context-compact min-w-0 space-y-3 sm:space-y-3.5 ${className}`.trim()}
        data-testid="checkout-pro-context-compact"
      >
        <p className="text-sm font-medium text-slate-300">{CHECKOUT_PRO_CONTEXT_TITLE}</p>
        {CHECKOUT_PRO_CONTEXT_LINES.map((line) => (
          <p key={line} className="text-sm leading-relaxed text-slate-400">
            {line}
          </p>
        ))}
        <p className="text-xs leading-snug text-slate-500">{PRO_UPGRADE_REASSURANCE}</p>
        <p className="text-xs text-slate-500">
          {CHECKOUT_PRO_CONTEXT_COMPLETING_LABEL}:{" "}
          <span className="text-slate-300">{completingLabel(completionLabel)}</span>
        </p>
      </div>
    );
  }

  return (
    <div
      className={`checkout-pro-context rounded-2xl border border-slate-800/80 bg-slate-950/25 p-4 sm:p-5 lg:p-6 ${className}`.trim()}
      data-testid="checkout-pro-context"
    >
      <div className="space-y-4 sm:space-y-5">
        <section>
          <p className="text-sm font-medium text-slate-300">{CHECKOUT_PRO_CONTEXT_TITLE}</p>
          {CHECKOUT_PRO_CONTEXT_LINES.map((line) => (
            <p key={line} className="mt-2 text-sm leading-relaxed text-slate-400">
              {line}
            </p>
          ))}
        </section>

        <hr className="border-slate-800/60" />

        <section>
          <p className="text-sm leading-relaxed text-slate-400">{PRO_UPGRADE_REASSURANCE}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            You review and edit in a secure workspace before anything is sent or signed.
          </p>
        </section>

        <hr className="border-slate-800/60" />

        <section>
          <p className="text-xs text-slate-500">{CHECKOUT_PRO_CONTEXT_COMPLETING_LABEL}</p>
          <p className="mt-1 text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
            {completingLabel(completionLabel)}
          </p>
        </section>
      </div>
    </div>
  );
}
