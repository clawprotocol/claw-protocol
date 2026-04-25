import { useCallback, useEffect, useMemo, useState } from "react";
import { useLaunchNav } from "../LaunchNavContext";
import {
  clearPersistedGrowthEvents,
  GROWTH_EVENTS_LOCAL_STORAGE_KEY,
  loadPersistedGrowthEvents,
} from "../../lib/experimentation/growthEventPersistence";
import type { PersistedProductEvent } from "../../lib/experimentation/growthEventPersistence";
import { persistedEventToAnalyticsPayload } from "../../lib/experimentation/analyticsProductEvent";
import { computeGrowthDashboardDiagnostics } from "../../lib/experimentation/growthDashboardDiagnostics";
import {
  computeBiggestStepDropOff,
  computeExperimentExposure,
  computeInputModeSplit,
  computeLatestSessionTrace,
  computeLiveFunnelCounts,
  computePaywallSummary,
  computeShareReferralCounts,
  computeStepFunnel,
  computeTimeToReady,
  countDistinctSessions,
  filterEventsForDay,
  formatDailySnapshotLine,
} from "../../lib/experimentation/growthMetricsAggregate";
import { featureFlags } from "../../config/featureFlags";
import { isLocalhostDevMonetizationRelax } from "../../monetization/lawDogMonetization";

function todayIsoDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatTs(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return String(ms);
  }
}

function dedupeConsecutiveEventNames(events: { name: string }[]): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (out.length === 0 || out[out.length - 1] !== e.name) out.push(e.name);
  }
  return out;
}

export function canAccessOperatorGrowthDashboard(): boolean {
  return featureFlags.opsGrowthDashboard || isLocalhostDevMonetizationRelax();
}

export function OperatorGrowthDashboard() {
  const { navigate } = useLaunchNav();
  const [day, setDay] = useState(todayIsoDay);
  const [events, setEvents] = useState<PersistedProductEvent[]>(() => loadPersistedGrowthEvents());

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
  const diagnostic = useMemo(() => computeGrowthDashboardDiagnostics(events, dayEvents), [events, dayEvents]);

  const latestTs = useMemo(() => {
    if (events.length === 0) return null;
    return Math.max(...events.map((e) => e.ts));
  }, [events]);

  const lastTwenty = useMemo(() => [...events].sort((a, b) => b.ts - a.ts).slice(0, 20), [events]);

  const origin = typeof window !== "undefined" ? window.location.origin : "—";

  const funnel = useMemo(() => computeStepFunnel(dayEvents), [dayEvents]);
  const drop = useMemo(() => computeBiggestStepDropOff(dayEvents), [dayEvents]);
  const snapshot = useMemo(() => formatDailySnapshotLine(dayEvents, {}), [dayEvents]);
  const ttr = useMemo(() => computeTimeToReady(dayEvents), [dayEvents]);
  const inputSplit = useMemo(() => computeInputModeSplit(dayEvents), [dayEvents]);
  const experiments = useMemo(() => computeExperimentExposure(dayEvents), [dayEvents]);
  const shareRef = useMemo(() => computeShareReferralCounts(dayEvents), [dayEvents]);

  const generated = useMemo(() => dayEvents.filter((e) => e.name === "agreement_generated").length, [dayEvents]);
  const maxStepCount = useMemo(() => funnel.reduce((m, r) => Math.max(m, r.completed), 0), [funnel]);

  const liveFunnel = useMemo(() => computeLiveFunnelCounts(dayEvents), [dayEvents]);
  const paywallSummary = useMemo(() => computePaywallSummary(dayEvents), [dayEvents]);
  const distinctSessions = useMemo(() => countDistinctSessions(dayEvents), [dayEvents]);
  const latestTrace = useMemo(() => computeLatestSessionTrace(dayEvents), [dayEvents]);

  const missingFunnelKey =
    diagnostic.kind === "missing_funnel_signals" ? diagnostic.missing.slice().sort().join("|") : "";
  const dropKey = drop ? `${drop.fromStep}|${drop.toStep}|${drop.lossRate}` : "";

  const whatToDoNext = useMemo(() => {
    if (events.length === 0) {
      return {
        tone: "info" as const,
        bullets: [
          "Run a full agreement flow in this browser (create → review → paywall if applicable → send or checkout) to generate baseline metrics.",
          "Refresh after each run; confirm events in the dev list (DEV) or persistence count above.",
        ],
      };
    }
    if (dayEvents.length === 0) {
      return {
        tone: "info" as const,
        bullets: [
          "No events for the selected date — pick the day you exercised the product or click “Use today”.",
        ],
      };
    }
    if (diagnostic.kind === "missing_funnel_signals") {
      return {
        tone: "warn" as const,
        bullets: [
          `Missing: ${diagnostic.missing.join(", ")} — verify these events fire in the flow (instrumentation or gated routes).`,
          "Check Agreement intake / guided steps emit step_completed with step_number; landing and ready fire on the right surfaces.",
        ],
      };
    }
    if (drop) {
      return {
        tone: "warn" as const,
        bullets: [
          `Biggest drop: Step ${drop.fromStep} → Step ${drop.toStep} (${Math.round(drop.lossRate * 100)}% relative loss) — review copy, validation, and friction between those steps.`,
        ],
      };
    }
    return {
      tone: "ok" as const,
      bullets: [
        "Funnel signals look present for this day — spot-check paywall + checkout in a clean session and compare to paywall summary below.",
      ],
    };
  }, [events.length, dayEvents.length, diagnostic.kind, missingFunnelKey, dropKey]);

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-slate-200">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Internal</p>
          <h1 className="text-xl font-semibold text-slate-50">Growth &amp; funnel</h1>
          <p className="mt-2 rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-100/95">
            This dashboard currently reflects <strong className="font-medium text-amber-50">browser-local test analytics</strong>, not
            production-wide metrics.
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
            className="rounded border border-rose-900/50 px-3 py-1 text-xs text-rose-200/95 hover:bg-rose-950/40"
            onClick={() => {
              if (!window.confirm("Clear all locally persisted growth events in this browser?")) return;
              clearPersistedGrowthEvents();
              reload();
            }}
          >
            Clear local growth events
          </button>
          <button type="button" className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900" onClick={() => navigate("/app")}>
            App home
          </button>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-slate-700/80 bg-slate-900/40 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
        <dl className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-slate-500">Data source</dt>
            <dd className="font-medium text-slate-200">Browser-local events ({GROWTH_EVENTS_LOCAL_STORAGE_KEY})</dd>
          </div>
          <div>
            <dt className="text-slate-500">Origin</dt>
            <dd className="break-all font-mono text-[11px] text-slate-200">{origin}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Selected date</dt>
            <dd className="font-medium text-slate-200">{day}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Total persisted events</dt>
            <dd className="font-medium text-slate-200">{events.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Latest event (local time)</dt>
            <dd className="font-medium text-slate-200">{latestTs != null ? formatTs(latestTs) : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Events for selected day</dt>
            <dd className="font-medium text-slate-200">{dayEvents.length.toLocaleString()}</dd>
          </div>
        </dl>
        {featureFlags.productEventsIngestApi ? (
          <p className="mt-2 text-[11px] text-emerald-400/90">
            Product event ingest flag is ON — same-origin POSTs to /api/product-events may fire (backend may still return
            404 until wired).
          </p>
        ) : null}
      </section>

      <section
        className={`mt-4 rounded-xl border px-4 py-3 ${
          whatToDoNext.tone === "warn"
            ? "border-amber-800/50 bg-amber-950/20"
            : whatToDoNext.tone === "ok"
              ? "border-emerald-900/40 bg-emerald-950/15"
              : "border-slate-700 bg-slate-900/45"
        }`}
        aria-labelledby="what-next-heading"
      >
        <h2 id="what-next-heading" className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          What to do next
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-slate-200">
          {whatToDoNext.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>

      {distinctSessions === 1 && dayEvents.length > 0 ? (
        <div className="mt-3 rounded-lg border border-violet-900/40 bg-violet-950/20 px-3 py-2 text-sm text-violet-100/95" role="status">
          <strong className="font-medium text-violet-50">Single-session test data</strong> — use for instrumentation validation only; rates
          and funnels are not representative of multi-user traffic.
        </div>
      ) : null}

      <section className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h2 className="text-sm font-semibold text-slate-100">Live funnel counts</h2>
        <p className="mt-1 text-xs text-slate-500">Unique sessions per milestone (selected day)</p>
        <ul className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <span className="text-slate-500">Landing:</span> <span className="font-semibold text-white">{liveFunnel.landing}</span>
          </li>
          <li>
            <span className="text-slate-500">Step 1:</span> <span className="font-semibold text-white">{liveFunnel.step1}</span>
          </li>
          <li>
            <span className="text-slate-500">Step 2:</span> <span className="font-semibold text-white">{liveFunnel.step2}</span>
          </li>
          <li>
            <span className="text-slate-500">Ready:</span> <span className="font-semibold text-white">{liveFunnel.ready}</span>
          </li>
          <li>
            <span className="text-slate-500">Generate:</span> <span className="font-semibold text-white">{liveFunnel.generate}</span>
          </li>
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h2 className="text-sm font-semibold text-slate-100">Paywall summary</h2>
        <p className="mt-1 text-xs text-slate-500">Raw event counts + session-level conversion (selected day)</p>
        <ul className="mt-3 space-y-1 text-sm text-slate-300">
          <li>
            <span className="text-slate-500">paywall_shown:</span> {paywallSummary.paywall_shown}
          </li>
          <li>
            <span className="text-slate-500">upgrade_clicked:</span> {paywallSummary.upgrade_clicked}
          </li>
          <li>
            <span className="text-slate-500">unlock_clicked:</span> {paywallSummary.unlock_clicked}
          </li>
          <li>
            <span className="text-slate-500">unlock_completed:</span> {paywallSummary.unlock_completed}
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Paywall sessions (distinct): <span className="text-slate-200">{paywallSummary.paywall_sessions}</span>
        </p>
        <ul className="mt-1 space-y-0.5 text-sm text-slate-300">
          <li>
            Subscription rate (paywall sessions that also logged upgrade_clicked):{" "}
            <span className="font-medium text-emerald-200/95">
              {paywallSummary.subscription_session_rate_pct != null ? `${paywallSummary.subscription_session_rate_pct}%` : "—"}
            </span>
          </li>
          <li>
            One-time rate (paywall sessions that also logged unlock_completed):{" "}
            <span className="font-medium text-slate-200">
              {paywallSummary.one_time_session_rate_pct != null ? `${paywallSummary.one_time_session_rate_pct}%` : "—"}
            </span>
          </li>
        </ul>
      </section>

      {latestTrace ? (
        <section className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Last flow trace</h2>
          <p className="mt-1 text-xs text-slate-500">Latest activity session on this day — event order (consecutive duplicates collapsed)</p>
          <p className="mt-2 break-all font-mono text-[11px] text-slate-400">
            session_id: <span className="text-emerald-200/90">{latestTrace.sessionId}</span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            {dedupeConsecutiveEventNames(latestTrace.timeline).join(" → ") || "—"}
          </p>
          <p className="mt-2 text-[10px] text-slate-600">
            {latestTrace.timeline.length} events in window · times {formatTs(latestTrace.timeline[0]?.ts ?? 0)} →{" "}
            {formatTs(latestTrace.timeline[latestTrace.timeline.length - 1]?.ts ?? 0)}
          </p>
        </section>
      ) : null}

      {(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ? (
        <section className="mt-6 rounded-xl border border-violet-900/40 bg-violet-950/20 p-4">
          <h2 className="text-sm font-semibold text-violet-100">Debug · last 20 persisted events (dev only)</h2>
          <p className="mt-1 text-xs text-violet-200/80">Canonical payload shape preview for backend alignment.</p>
          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-[11px] leading-snug">
            {lastTwenty.length === 0 ? (
              <li className="text-slate-500">No rows yet.</li>
            ) : (
              lastTwenty.map((ev, idx) => {
                const canon = persistedEventToAnalyticsPayload(ev);
                return (
                  <li
                    key={`${ev.ts}_${ev.name}_${idx}`}
                    className="rounded border border-slate-800/80 bg-slate-950/60 px-2 py-1.5 font-mono text-slate-400"
                  >
                    <span className="text-emerald-400/90">{ev.name}</span> · {formatTs(ev.ts)}
                    <pre className="mt-1 max-h-24 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all text-[10px] text-slate-500">
                      {JSON.stringify(canon, null, 0)}
                    </pre>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      ) : null}

      <div className="mt-6 rounded-xl border border-emerald-800/40 bg-emerald-950/15 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400/90">Daily snapshot</p>
        <p className="mt-1 text-sm font-medium text-emerald-100">{snapshot}</p>
        {drop ? (
          <p className="mt-1 text-xs text-slate-500">
            Worst consecutive gap: step {drop.fromStep} → {drop.toStep} ({Math.round(drop.lossRate * 100)}% relative loss)
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Step funnel &amp; drop-off heatmap</h2>
          <p className="mt-1 text-xs text-slate-500">
            Unique sessions per guided step (from step_completed) · bar width = share of max step count
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {funnel.length === 0 ? <li className="text-slate-500">No step data for this day.</li> : null}
            {funnel.map((row) => (
              <li key={row.step} className="border-b border-slate-800/60 pb-2 last:border-0">
                <div className="flex justify-between gap-2 text-sm">
                  <span>Step {row.step}</span>
                  <span className="text-slate-400">
                    {row.completed} sessions
                    {row.conversionFromPrevious != null ? (
                      <span className="ml-2 text-emerald-400/90">({Math.round(row.conversionFromPrevious * 100)}% vs prev)</span>
                    ) : null}
                  </span>
                </div>
                {maxStepCount > 0 ? (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
                    <div
                      className="h-full rounded-full bg-emerald-600/70"
                      style={{ width: `${Math.max(6, Math.round((row.completed / maxStepCount) * 100))}%` }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Unique sessions (landing): {liveFunnel.landing} · landing_view events:{" "}
            {dayEvents.filter((e) => e.name === "landing_view").length} · Agreements generated: {generated}
          </p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Time to ready state</h2>
          <p className="mt-1 text-xs text-slate-500">landing_view → ready_state_reached (same session)</p>
          <ul className="mt-3 space-y-1 text-sm text-slate-300">
            <li>Count: {ttr.count}</li>
            <li>Median: {formatMs(ttr.medianMs)}</li>
            <li>P90: {formatMs(ttr.p90Ms)}</li>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Input mode (create intake)</h2>
          <p className="mt-1 text-xs text-slate-500">Unique sessions · mic vs typing signals</p>
          <ul className="mt-3 space-y-1 text-sm text-slate-300">
            <li>Voice (mic_used): {inputSplit.voiceSessions}</li>
            <li>Typing (intake_typing_started): {inputSplit.typingSessions}</li>
            <li>Both: {inputSplit.bothSessions}</li>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Share &amp; referral</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-300">
            <li>share_clicked: {shareRef.share_clicked}</li>
            <li>link_copied: {shareRef.link_copied}</li>
            <li>referral_signup: {shareRef.referral_signup}</li>
          </ul>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h2 className="text-sm font-semibold text-slate-100">Experiments</h2>
        <p className="mt-1 text-xs text-slate-500">experiment_exposure counts by variant</p>
        {Object.keys(experiments).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No exposures logged for this day.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {Object.entries(experiments).map(([expId, rows]) => (
              <div key={expId}>
                <p className="text-xs font-medium text-slate-400">{expId}</p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-300">
                  {rows.map((r) => (
                    <li key={r.variant}>
                      {r.variant}: {r.count}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-8 text-center text-[11px] text-slate-600">
        Local persistence key: <code className="text-slate-500">{GROWTH_EVENTS_LOCAL_STORAGE_KEY}</code>. Server ingest plan:{" "}
        <code className="text-slate-500">docs/ops/PRODUCT_EVENTS_INGESTION_STUB.md</code>.
      </p>
    </div>
  );
}
