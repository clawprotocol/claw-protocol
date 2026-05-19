import type { LaunchPricingTier } from "../pricingTiersData";
import type { PricingCadence } from "../pricingCadenceStorage";
import { annualPrepayUsd, annualSavingsVsMonthlyUsd, formatMoneyUsdWhole } from "../pricingKeyMath";
import { CHECKOUT_ANNUAL_WORKFLOW_LABEL } from "./checkoutTrustCopy";

type Props = {
  tier: LaunchPricingTier;
  cadence: PricingCadence;
  onCadenceChange: (next: PricingCadence) => void;
  /** Light caution line (e.g. loss framing) — no alarm box; sits under plan value line. */
  planFootnote?: string;
};

export function CreateFlowAgreementCheckoutPricing({ tier, cadence, onCadenceChange, planFootnote }: Props) {
  const m = tier.monthlyPriceUsd;
  if (m == null) return null;

  const annualCharge = annualPrepayUsd(m);
  const saveUsd = annualSavingsVsMonthlyUsd(m);
  const effectiveMo = Math.floor(annualCharge / 12);

  return (
    <div className="space-y-6 sm:space-y-7">
      <header>
        <h2
          id="create-flow-pricing"
          className="text-lg sm:text-xl font-semibold tracking-tight text-slate-100"
        >
          Choose your plan
        </h2>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-7 text-slate-300 sm:text-base">
          Annual or monthly — change your mind until you pay.
        </p>
      </header>

      <div
        className="inline-flex w-full rounded-xl border border-slate-800/90 bg-slate-950/70 p-1.5"
        role="tablist"
        aria-label="Billing cadence"
      >
        <button
          type="button"
          role="tab"
          aria-selected={cadence === "annual"}
          className={`min-h-12 flex-1 rounded-lg px-3 text-sm font-semibold transition sm:px-4 ${
            cadence === "annual"
              ? "bg-amber-500/25 text-amber-50 ring-2 ring-amber-400/50 shadow-sm shadow-amber-950/20"
              : "text-slate-300 hover:bg-slate-900/60 hover:text-slate-100"
          }`}
          onClick={() => onCadenceChange("annual")}
        >
          <span className="block sm:inline">Annual</span>
          <span className="text-slate-400 sm:mx-1">—</span>
          <span className="font-semibold text-emerald-400">Save {formatMoneyUsdWhole(saveUsd)}/year</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={cadence === "monthly"}
          className={`min-h-12 flex-1 rounded-lg px-3 text-sm font-semibold transition sm:px-4 ${
            cadence === "monthly"
              ? "bg-slate-800 text-slate-50 ring-2 ring-slate-500/40"
              : "text-slate-300 hover:bg-slate-900/60 hover:text-slate-100"
          }`}
          onClick={() => onCadenceChange("monthly")}
        >
          Monthly
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <button
          type="button"
          onClick={() => onCadenceChange("annual")}
          className={`rounded-2xl border p-4 text-left transition motion-safe:duration-200 sm:p-5 ${
            cadence === "annual"
              ? "border-amber-500/45 bg-gradient-to-b from-amber-950/35 to-slate-950/90 shadow-lg shadow-black/30 ring-2 ring-amber-400/35 motion-safe:sm:scale-[1.01]"
              : "border-slate-800/80 bg-slate-950/50 hover:border-slate-700/90"
          }`}
        >
          <span className="inline-block rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-950">
            Most popular
          </span>
          <p className="mt-3 text-3xl font-semibold tracking-tight leading-none text-white sm:text-4xl">
            {formatMoneyUsdWhole(annualCharge)}
            <span className="text-lg font-medium text-slate-300 sm:text-xl">/year</span>
          </p>
          <p className="mt-2 text-[15px] leading-7 text-slate-300 sm:text-base">
            ≈ {formatMoneyUsdWhole(effectiveMo)}/mo <span className="text-slate-400">(billed annually)</span>
          </p>
          <p className="mt-1 text-sm font-medium text-emerald-400">
            Save {formatMoneyUsdWhole(saveUsd)}/year vs monthly
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-300">{CHECKOUT_ANNUAL_WORKFLOW_LABEL}</p>
        </button>

        <button
          type="button"
          onClick={() => onCadenceChange("monthly")}
          className={`rounded-2xl border p-4 text-left transition sm:p-5 ${
            cadence === "monthly"
              ? "border-slate-500/50 bg-slate-900/70 ring-2 ring-slate-500/30"
              : "border-slate-800/70 bg-slate-950/40 hover:border-slate-700/80"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:text-xs">Flexible</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight leading-none text-white sm:text-3xl">
            {formatMoneyUsdWhole(m)}
            <span className="text-base font-medium text-slate-300 sm:text-lg">/month</span>
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-300">Best for one active deal or short-term needs</p>
        </button>
      </div>

      <p className="text-center text-[15px] font-medium leading-7 text-slate-200 sm:text-left sm:text-base">
        Unlimited agreements on your plan — revise, send, and sign on your timeline.
      </p>

      {planFootnote ? (
        <p className="border-l-2 border-amber-500/20 pl-3 text-sm leading-7 text-slate-300">
          {planFootnote}
        </p>
      ) : null}
    </div>
  );
}
