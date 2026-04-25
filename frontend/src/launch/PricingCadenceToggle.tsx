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
  const active = "bg-emerald-500/15 text-emerald-200 shadow-inner ring-1 ring-emerald-500/25";

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
          className={`${baseBtn} rounded-md ${value === "monthly" ? active : inactive}`}
          aria-pressed={value === "monthly"}
          onClick={() => onChange("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          id={`${idPrefix}-annual`}
          className={`${baseBtn} rounded-md ${value === "annual" ? active : inactive}`}
          aria-pressed={value === "annual"}
          onClick={() => onChange("annual")}
        >
          Annual <span className="font-normal normal-case text-slate-500">(recommended)</span>
        </button>
      </div>
      {value === "annual" ? (
        <span className="rounded-full border border-emerald-800/40 bg-emerald-950/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
          Best value
        </span>
      ) : (
        <span className="rounded-full border border-slate-700/80 bg-slate-900/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Most teams choose annual
        </span>
      )}
    </div>
  );
}
