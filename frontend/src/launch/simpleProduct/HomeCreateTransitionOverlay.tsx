import { useEffect, useState } from "react";
import { LawdogBrand } from "../../components/ui/LawdogBrand";
import {
  HOME_CREATE_TRANSITION_HEADING,
  HOME_CREATE_TRANSITION_REASSURANCE,
  HOME_CREATE_TRANSITION_STEPS,
  logHomeCreateTransitionShown,
} from "./guidedWorkflowCopy";

export function HomeCreateTransitionOverlay(props: { active: boolean }) {
  const { active } = props;
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    logHomeCreateTransitionShown();
    setStepIndex(0);
    const timers = HOME_CREATE_TRANSITION_STEPS.map((_, i) =>
      window.setTimeout(() => setStepIndex(i), 900 + i * 1100),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#070b14]/92 px-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={HOME_CREATE_TRANSITION_HEADING}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-950/95 p-8 shadow-2xl shadow-black/40 ring-1 ring-emerald-500/15">
        <div className="flex justify-center">
          <LawdogBrand variant="wordmark" size="md" surface="dark" />
        </div>
        <h2 className="mt-6 text-center text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
          {HOME_CREATE_TRANSITION_HEADING}
        </h2>
        <ul className="mt-6 space-y-3" aria-label="Preparation steps">
          {HOME_CREATE_TRANSITION_STEPS.map((step, i) => {
            const done = i < stepIndex;
            const current = i === stepIndex;
            return (
              <li
                key={step}
                className={`flex items-center gap-3 text-sm transition-opacity duration-500 sm:text-[0.9375rem] ${
                  i > stepIndex ? "opacity-40" : "opacity-100"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    done
                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-100"
                      : current
                        ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-50 motion-safe:animate-pulse"
                        : "border-slate-600/70 bg-slate-900/80 text-slate-500"
                  }`}
                  aria-hidden
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={current ? "font-medium text-slate-100" : "text-slate-400"}>{step}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-8 h-1 overflow-hidden rounded-full bg-slate-800/90" aria-hidden>
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600/80 to-teal-400/80 motion-safe:animate-pulse"
            style={{ width: `${Math.min(100, 28 + stepIndex * 24)}%` }}
          />
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-slate-400 sm:text-sm">
          {HOME_CREATE_TRANSITION_REASSURANCE}
        </p>
      </div>
    </div>
  );
}
