import { ProUpgradeWaitRotatingText } from "./ProUpgradeWaitRotatingText";
import type { PremiumProWaitModalView } from "../../lib/premiumPostCheckoutReturnUx";
import {
  PREMIUM_PRO_WAIT_ROTATING_LINES,
  PREMIUM_RETURN_RETRY_GENERATION_LABEL,
  PREMIUM_RETURN_TERMINAL_HELPER,
  PREMIUM_RETURN_USE_STARTER_LABEL,
} from "../../lib/premiumPostCheckoutReturnUx";

type Props = {
  view: PremiumProWaitModalView;
  titleId: string;
  onRetry?: () => void;
  onUseStarter?: () => void;
  retryDisabled?: boolean;
};

function StepIcon({ state }: { state: "pending" | "active" | "done" }) {
  if (state === "done") {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/20 text-xs font-semibold text-emerald-100"
        aria-hidden
      >
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400/60 bg-emerald-500/10 motion-safe:animate-pulse"
        aria-hidden
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
      </span>
    );
  }
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-600/70 bg-slate-900/80"
      aria-hidden
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
    </span>
  );
}

export function PremiumProGenerationWaitPanel(props: Props) {
  const { view, titleId, onRetry, onUseStarter, retryDisabled } = props;

  return (
    <>
      <div className="mb-6 space-y-2.5" aria-label="Pro agreement progress">
        {view.progressSteps.map((step) => (
          <div
            key={step.label}
            className={`flex items-center gap-3 text-sm ${
              step.state === "active"
                ? "font-medium text-emerald-100/95"
                : step.state === "done"
                  ? "text-slate-300"
                  : "text-slate-500"
            }`}
          >
            <StepIcon state={step.state} />
            <span>{step.label}</span>
          </div>
        ))}
      </div>

      <h2
        id={titleId}
        className="text-center text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl"
      >
        {view.title}
      </h2>
      <p className="mt-3 text-center text-sm leading-relaxed text-slate-400 sm:text-base">{view.body}</p>
      {view.flavorLine ? (
        <p className="mt-2 text-center text-xs font-medium italic leading-relaxed text-emerald-200/80 sm:text-sm">
          {view.flavorLine}
        </p>
      ) : null}

      {view.showRotatingLines ? (
        <ProUpgradeWaitRotatingText
          active
          lines={PREMIUM_PRO_WAIT_ROTATING_LINES}
          intervalMs={2800}
          className="mt-4 min-h-[3rem] text-center text-sm leading-relaxed text-slate-300 sm:text-base"
        />
      ) : null}

      <p className="mt-3 text-center text-xs leading-relaxed text-slate-500 sm:text-sm">{view.reassurance}</p>

      {view.showRecoveryActions ? (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3">
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
          <p className="w-full text-center text-[11px] leading-snug text-slate-500 sm:text-xs">
            {PREMIUM_RETURN_TERMINAL_HELPER}
          </p>
        </div>
      ) : null}

      {view.showSpinner ? (
        <div className="mt-6 flex justify-center" aria-hidden>
          <div className="h-10 w-10 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 motion-safe:animate-spin sm:h-12 sm:w-12" />
        </div>
      ) : view.phase === "success" ? (
        <div className="mt-6 flex justify-center" aria-hidden>
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/45 bg-emerald-500/20 text-xl text-emerald-100">
            ✓
          </span>
        </div>
      ) : null}
    </>
  );
}
