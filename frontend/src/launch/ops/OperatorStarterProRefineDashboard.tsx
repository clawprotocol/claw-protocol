import { useCallback, useEffect, useMemo, useState } from "react";
import { useLaunchNav } from "../LaunchNavContext";
import { featureFlags } from "../../config/featureFlags";
import {
  clearPersistedGrowthEvents,
  GROWTH_EVENTS_LOCAL_STORAGE_KEY,
  loadPersistedGrowthEvents,
} from "../../lib/experimentation/growthEventPersistence";
import { filterEventsForDay } from "../../lib/experimentation/growthMetricsAggregate";
import {
  computeStarterProRefineExperimentStats,
  formatPct,
  formatUsd5,
} from "../../lib/experimentation/starterProRefineExperimentStats";
import { canAccessOperatorGrowthDashboard } from "./OperatorGrowthDashboard";

const LOW_IMPRESSION_SAMPLE_THRESHOLD = 100;
const NOISY_CHECKOUT_CVR_CLICKS_THRESHOLD = 30;
/** RPI: winner is shown only if higher arm is at least this fraction above the lower (e.g. 0.1 = 10% relative). */
const RPI_RELATIVE_LEAD_THRESHOLD = 0.1;

type RpiDecision = { type: "gathering" } | { type: "noLeader" } | { type: "leader"; arm: "Control" | "Variant" };

function todayIsoDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Arm = "Control" | "Variant";

function RateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-mono text-slate-200">{value}</dd>
    </div>
  );
}

export function OperatorStarterProRefineDashboard() {
  const { navigate } = useLaunchNav();
  const [day, setDay] = useState(todayIsoDay);
  const [events, setEvents] = useState(() => loadPersistedGrowthEvents());

  const reload = useCallback(() => {
    setEvents(loadPersistedGrowthEvents());
  }, []);

  useEffect(() => {
    reload();
    const onEv = () => reload();
    window.addEventListener("claw:product-event", onEv);
    return () => window.removeEventListener("claw:product-event", onEv);
  }, [reload]);

  const dayEvents = useMemo(() => filterEventsForDay(events, day), [events, day]);
  const stats = useMemo(() => computeStarterProRefineExperimentStats(dayEvents), [dayEvents]);
  const showLowImpressionSampleWarning =
    stats.controlImpressions < LOW_IMPRESSION_SAMPLE_THRESHOLD || stats.variantImpressions < LOW_IMPRESSION_SAMPLE_THRESHOLD;
  const showNoisyCheckoutCvrWarning =
    stats.controlClicks < NOISY_CHECKOUT_CVR_CLICKS_THRESHOLD || stats.variantClicks < NOISY_CHECKOUT_CVR_CLICKS_THRESHOLD;
  const rpiDecision: RpiDecision = useMemo(() => {
    if (
      stats.controlImpressions < LOW_IMPRESSION_SAMPLE_THRESHOLD ||
      stats.variantImpressions < LOW_IMPRESSION_SAMPLE_THRESHOLD ||
      stats.controlClicks < NOISY_CHECKOUT_CVR_CLICKS_THRESHOLD ||
      stats.variantClicks < NOISY_CHECKOUT_CVR_CLICKS_THRESHOLD
    ) {
      return { type: "gathering" };
    }
    const cR = stats.controlRpi ?? 0;
    const vR = stats.variantRpi ?? 0;
    if (Math.abs(cR - vR) < 1e-9) {
      return { type: "noLeader" };
    }
    const high = Math.max(cR, vR);
    const low = Math.min(cR, vR);
    const hasSufficientRelativeLead = low > 0 ? (high - low) / low >= RPI_RELATIVE_LEAD_THRESHOLD - 1e-12 : high > 0;
    if (!hasSufficientRelativeLead) {
      return { type: "noLeader" };
    }
    return { type: "leader", arm: cR > vR ? "Control" : "Variant" };
  }, [stats]);
  const origin = typeof window !== "undefined" ? window.location.origin : "—";

  if (!canAccessOperatorGrowthDashboard()) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-slate-400">
        <p className="text-sm">This internal dashboard is not enabled.</p>
        <p className="mt-2 text-xs text-slate-500">Set VITE_CLAW_FEATURE_OPS_GROWTH=1 or use localhost dev.</p>
        <button type="button" className="btn mt-6 text-sm text-emerald-300 underline" onClick={() => navigate("/app")}>
          Back to app
        </button>
      </div>
    );
  }

  const table = (arm: Arm) => {
    if (arm === "Control") {
      return {
        imps: stats.controlImpressions,
        clicks: stats.controlClicks,
        purchases: stats.controlPurchases,
        revenue: stats.controlRevenueUsd,
        unattr: stats.controlPurchasesWithoutRevenue,
        ctr: stats.controlCtr,
        ctp: stats.controlClickToPurchase,
        itp: stats.controlImpressionToPurchase,
        rpi: stats.controlRpi,
      };
    }
    return {
      imps: stats.variantImpressions,
      clicks: stats.variantClicks,
      purchases: stats.variantPurchases,
      revenue: stats.variantRevenueUsd,
      unattr: stats.variantPurchasesWithoutRevenue,
      ctr: stats.variantCtr,
      ctp: stats.variantClickToPurchase,
      itp: stats.variantImpressionToPurchase,
      rpi: stats.variantRpi,
    };
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-slate-200">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Internal / Dev</p>
          <h1 className="text-xl font-semibold text-slate-50">Starter Pro · Refine CTA</h1>
          <p className="mt-2 rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-100/95">
            <strong className="font-medium text-amber-50">Browser-local</strong> only — not production rollups. Uses the same persisted events as
            the growth ops view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500">
            Day{" "}
            <input
              type="date"
              className="ml-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900"
            onClick={() => setDay(todayIsoDay())}
          >
            Use today
          </button>
          <button type="button" className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900" onClick={reload}>
            Refresh
          </button>
          <button
            type="button"
            className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900"
            onClick={() => navigate("/app/ops/growth")}
          >
            Growth (all events)
          </button>
        </div>
      </div>

      <section className="mt-4 rounded-xl border border-slate-700/80 bg-slate-900/40 px-4 py-3 text-xs text-slate-500">
        <p>
          <span className="text-slate-500">Data:</span>{" "}
          <code className="text-slate-400">{GROWTH_EVENTS_LOCAL_STORAGE_KEY}</code> · {origin} ·{dayEvents.length} row(s) on {day} ·
          {events.length} total persisted
        </p>
        {featureFlags.productEventsIngestApi ? (
          <p className="mt-1 text-[11px] text-emerald-400/80">Ingest to API is enabled; this view still shows local copy only.</p>
        ) : null}
        <p className="mt-1 text-slate-500">
          <strong className="font-medium text-slate-400">Revenue</strong> joins{" "}
          <code className="text-slate-400">paywall_revenue_attributed</code> in the same session in the 15s before a refine checkout-success event. If
          that event did not run (e.g. no paywall view id on checkout), the purchase is counted with $0; see “purchases without $”.
        </p>
        {showLowImpressionSampleWarning ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500/80">Directional data only — low sample size.</p>
        ) : null}
        {showNoisyCheckoutCvrWarning ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500/80">Checkout conversion rate may be noisy.</p>
        ) : null}
        {rpiDecision.type === "gathering" ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500/80">Gathering data.</p>
        ) : rpiDecision.type === "noLeader" ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500/80">No leader yet.</p>
        ) : (
          <p className="mt-2">
            <span className="inline-flex max-w-full items-center rounded-md border border-slate-600/40 bg-slate-950/50 px-2.5 py-0.5 text-[11px] text-slate-400/90">
              Current leader: {rpiDecision.arm}
            </span>
          </p>
        )}
      </section>

      {(["Control", "Variant"] as const).map((arm) => {
        const t = table(arm);
        return (
          <section key={arm} className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-cyan-400/90">
              {arm} · <span className="text-slate-500 normal-case">env arm</span>
            </h2>
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-700/80">
              <dl className="divide-y divide-slate-800/90 bg-slate-950/50 px-3 py-0">
                <RateRow label="Impressions" value={t.imps.toLocaleString()} />
                <RateRow label="Clicks" value={t.clicks.toLocaleString()} />
                <RateRow label="Purchases" value={t.purchases.toLocaleString()} />
                <RateRow
                  label="Revenue (USD) attributed"
                  value={t.purchases > 0 || t.revenue > 0 ? formatUsd5(t.revenue) : t.purchases > 0 ? "0.00" : "—"}
                />
                {t.purchases > 0 && t.unattr > 0 ? (
                  <RateRow label="Purchases without $ from paywall row" value={t.unattr.toLocaleString()} />
                ) : null}
                <div className="h-2" />
                <div className="px-0 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Derived</div>
                <RateRow label="CTR (click / impression)" value={formatPct(t.ctr)} />
                <RateRow label="Checkout conversion (purchase / click)" value={formatPct(t.ctp)} />
                <RateRow label="Impression → purchase" value={formatPct(t.itp)} />
                <RateRow
                  label="Revenue / impression (RPI)"
                  value={t.imps > 0 && t.rpi != null ? `$${formatUsd5(t.rpi)}` : "—"}
                />
              </dl>
            </div>
          </section>
        );
      })}

      <p className="mt-8 text-center text-xs text-slate-600">
        <button
          type="button"
          className="text-rose-200/80 underline decoration-rose-900/60"
          onClick={() => {
            if (!window.confirm("Clear all locally persisted growth events in this browser?")) return;
            clearPersistedGrowthEvents();
            reload();
          }}
        >
          Clear local growth events
        </button>
        <span className="px-2 text-slate-700">|</span>
        <button type="button" className="text-slate-500 underline" onClick={() => navigate("/app/ops/paid-funnel")}>
          Paid funnel
        </button>
      </p>
    </div>
  );
}
