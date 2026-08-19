import type { PricingCadence } from "./pricingCadenceStorage";

export function PricingCadenceToggle(props: {
  value: PricingCadence;
  onChange: (next: PricingCadence) => void;
  idPrefix?: string;
  className?: string;
}) {
  const { value, onChange, idPrefix = "cadence", className = "" } = props;
  const baseBtn =
    "min-h-[2.5rem] flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors sm:text-[11px]";
  const inactive = "text-slate-400 hover:text-slate-200";
  const active = "bg-emerald-500/20 text-emerald-50 shadow-inner ring-2 ring-emerald-400/50";
  const activeMonthly = active;
  const activeAnnual = "bg-amber-500/20 text-amber-50 shadow-inner ring-2 ring-amber-400/45";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div
        className="inline-flex w-full max-w-md rounded-lg border border-slate-700/90 bg-slate-950/60 p-1 sm:w-auto"
        role="group"
        aria-label="Billing frequency"
      >
        <button
          type="button"
          id={`${idPrefix}-monthly`}
          className={`${baseBtn} rounded-md ${value === "monthly" ? activeMonthly : inactive}`}
          aria-pressed={value === "monthly"}
          onClick={() => onChange("monthly")}
        >
          <span className="inline-flex items-center justify-center gap-1">
            {value === "monthly" ? (
              <span className="text-emerald-300" aria-hidden>
                ✓
              </span>
            ) : null}
            Monthly
          </span>
        </button>
        <button
          type="button"
          id={`${idPrefix}-annual`}
          className={`${baseBtn} rounded-md ${value === "annual" ? activeAnnual : inactive}`}
          aria-pressed={value === "annual"}
          onClick={() => onChange("annual")}
        >
          <span className="inline-flex items-center justify-center gap-1">
            {value === "annual" ? (
              <span className="text-amber-300" aria-hidden>
                ✓
              </span>
            ) : null}
            Annual
          </span>
        </button>
      </div>
      {value === "annual" ? (
        <span className="rounded-full border border-amber-800/40 bg-amber-950/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
          Selected plan · Best value
        </span>
      ) : (
        <span className="rounded-full border border-emerald-800/40 bg-emerald-950/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
          Selected plan · Monthly billing
        </span>
      )}
    </div>
  );
}
