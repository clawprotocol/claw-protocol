import { useEffect } from "react";
import { ProUpgradeWaitRotatingText } from "./ProUpgradeWaitRotatingText";
import type { PremiumProWaitModalView } from "../../lib/premiumPostCheckoutReturnUx";
import {
  PREMIUM_PRO_WAIT_ROTATE_INTERVAL_MS,
  PREMIUM_PRO_WAIT_ROTATING_LINES,
  PREMIUM_RETURN_RETRY_GENERATION_LABEL,
  PREMIUM_RETURN_USE_STARTER_LABEL,
  logPremiumProWaitCopyRotated,
  logPremiumProWaitView,
} from "../../lib/premiumPostCheckoutReturnUx";

type Props = {
  view: PremiumProWaitModalView;
  titleId: string;
  onRetry?: () => void;
  onUseStarter?: () => void;
  retryDisabled?: boolean;
};

function ProgressPill({ label, state }: { label: string; state: "pending" | "active" | "done" }) {
  const done = state === "done";
  const active = state === "active";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide sm:text-xs ${
        done
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100/90"
          : active
            ? "border-emerald-400/55 bg-emerald-500/15 text-emerald-50 motion-safe:animate-pulse"
            : "border-slate-600/60 bg-slate-900/60 text-slate-500"
      }`}
    >
      <span>{label}</span>
      {done ? (
        <span className="text-emerald-300/90" aria-hidden>
          ✓
        </span>
      ) : active ? (
        <span className="text-emerald-300/80" aria-hidden>
          …
        </span>
      ) : null}
    </span>
  );
}

export function PremiumProGenerationWaitPanel(props: Props) {
  const { view, titleId, onRetry, onUseStarter, retryDisabled } = props;
  useEffect(() => {
    logPremiumProWaitView(view.phase);
  }, [view.phase]);

  return (
    <div className="flex flex-col items-center text-center">
      <h2
        id={titleId}
        className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl"
      >
        {view.title}
      </h2>

      <div
        className="mt-5 flex flex-wrap items-center justify-center gap-2"
        aria-label="Pro agreement progress"
      >
        {view.progressSteps.map((step) => (
          <ProgressPill key={step.shortLabel} label={step.shortLabel} state={step.state} />
        ))}
      </div>

      {view.showRotatingLines ? (
        <ProUpgradeWaitRotatingText
          active
          lines={PREMIUM_PRO_WAIT_ROTATING_LINES}
          intervalMs={PREMIUM_PRO_WAIT_ROTATE_INTERVAL_MS}
          onLineChange={logPremiumProWaitCopyRotated}
          className="mt-6 min-h-[2.75rem] max-w-md text-sm leading-relaxed text-slate-300 sm:text-base"
        />
      ) : view.statusLine ? (
        <p className="mt-6 max-w-md text-sm leading-relaxed text-slate-300 sm:text-base" role="status">
          {view.statusLine}
        </p>
      ) : null}

      <p className="mt-5 max-w-md text-xs leading-relaxed text-slate-500 sm:text-sm">{view.reassurance}</p>

      {view.showRecoveryActions ? (
        <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3">
          <button
            type="button"
            className="vs01-btn vs01-btn--primary w-full sm:w-auto"
            disabled={retryDisabled}
            onClick={() => onRetry?.()}
          >
            {PREMIUM_RETURN_RETRY_GENERATION_LABEL}
          </button>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary w-full sm:w-auto"
            onClick={() => onUseStarter?.()}
          >
            {PREMIUM_RETURN_USE_STARTER_LABEL}
          </button>
        </div>
      ) : null}

      {view.showSpinner ? (
        <div className="mt-6 flex justify-center" aria-hidden>
          <div className="h-9 w-9 rounded-full border-2 border-emerald-400/25 border-t-emerald-400 motion-safe:animate-spin sm:h-10 sm:w-10" />
        </div>
      ) : view.phase === "success" ? (
        <div className="mt-6 flex justify-center" aria-hidden>
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/25 text-lg text-emerald-100 motion-safe:animate-pulse">
            ✓
          </span>
        </div>
      ) : null}
    </div>
  );
}
