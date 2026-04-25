import { useCallback, useEffect, useMemo, useState } from "react";
import { useLaunchNav } from "../LaunchNavContext";
import {
  clearPaidFunnelEvents,
  loadPaidFunnelEvents,
  PAID_FUNNEL_DISPLAY_ORDER,
  PAID_FUNNEL_EVENT_STORAGE_KEY,
  PAID_FUNNEL_LINEAR_STEPS,
  type PaidFunnelStoredRow,
} from "../../lib/experimentation/paidFunnelLocalStorage";
import { canAccessOperatorGrowthDashboard } from "./OperatorGrowthDashboard";

type FilterState = {
  agreement_intent_id: string;
  device: string;
  premium_generation_outcome: string;
  render_source: string;
};

const EMPTY_FILTER: FilterState = {
  agreement_intent_id: "",
  device: "",
  premium_generation_outcome: "",
  render_source: "",
};

function eventMatchesFilters(e: PaidFunnelStoredRow, f: FilterState): boolean {
  if (f.agreement_intent_id) {
    if (e.agreement_intent_id !== f.agreement_intent_id) return false;
  }
  if (f.device) {
    if (e.device !== f.device) return false;
  }
  if (f.premium_generation_outcome) {
    if (e.premium_generation_outcome !== f.premium_generation_outcome) return false;
  }
  if (f.render_source) {
    if (e.render_source !== f.render_source) return false;
  }
  return true;
}

function distinctSessions(rows: PaidFunnelStoredRow[]): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.session_id) s.add(r.session_id);
  }
  return s;
}

function sessionsForStep(rows: PaidFunnelStoredRow[], step: string): Set<string> {
  const s = new Set<string>();
  for (const r of rows) {
    if (r.name === step && r.session_id) s.add(r.session_id);
  }
  return s;
}

function escapeCsvField(v: string): string {
  if (v.includes('"') || v.includes(",") || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function toCsv(rows: PaidFunnelStoredRow[]): string {
  const header = [
    "name",
    "ts",
    "session_id",
    "agreement_intent_id",
    "device",
    "premium_generation_outcome",
    "render_source",
  ].join(",");
  const lines = [header];
  for (const r of rows) {
    lines.push(
      [
        escapeCsvField(r.name),
        String(r.ts),
        escapeCsvField(r.session_id),
        escapeCsvField(r.agreement_intent_id ?? ""),
        escapeCsvField(r.device ?? ""),
        escapeCsvField(r.premium_generation_outcome ?? ""),
        escapeCsvField(r.render_source ?? ""),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function formatTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return String(ts);
  }
}

export function OperatorPaidFunnelDashboard() {
  const { navigate } = useLaunchNav();
  const [allEvents, setAllEvents] = useState<PaidFunnelStoredRow[]>([]);
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [filterInputs, setFilterInputs] = useState<FilterState>(EMPTY_FILTER);

  const reload = useCallback(() => {
    setAllEvents(loadPaidFunnelEvents());
  }, []);

  useEffect(() => {
    reload();
    const onEv = () => reload();
    window.addEventListener("claw:product-event", onEv);
    return () => window.removeEventListener("claw:product-event", onEv);
  }, [reload]);

  const applyFilters = useCallback(() => {
    setFilter({ ...filterInputs });
  }, [filterInputs]);

  const filteredEvents = useMemo(() => allEvents.filter((e) => eventMatchesFilters(e, filter)), [allEvents, filter]);

  const optionLists = useMemo(() => {
    const intent = new Set<string>();
    const dev = new Set<string>();
    const pgo = new Set<string>();
    const src = new Set<string>();
    for (const e of allEvents) {
      if (e.agreement_intent_id) intent.add(e.agreement_intent_id);
      if (e.device) dev.add(e.device);
      if (e.premium_generation_outcome) pgo.add(e.premium_generation_outcome);
      if (e.render_source) src.add(e.render_source);
    }
    return {
      agreement_intent_id: [...intent].sort(),
      device: [...dev].sort() as string[],
      premium_generation_outcome: [...pgo].sort(),
      render_source: [...src].sort(),
    };
  }, [allEvents]);

  const totalSessions = useMemo(() => distinctSessions(filteredEvents).size, [filteredEvents]);

  const stepSets = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const s of PAID_FUNNEL_DISPLAY_ORDER) {
      m[s] = sessionsForStep(filteredEvents, s);
    }
    return m;
  }, [filteredEvents]);

  const funnelTable = useMemo(() => {
    const rows: {
      step: string;
      sessions: number;
      pctPrev: string;
      dropOff: string;
      note?: string;
    }[] = [];
    for (let i = 0; i < PAID_FUNNEL_LINEAR_STEPS.length; i += 1) {
      const step = PAID_FUNNEL_LINEAR_STEPS[i]!;
      const set = stepSets[step] ?? new Set();
      const n = set.size;
      if (i === 0) {
        rows.push({
          step,
          sessions: n,
          pctPrev: "—",
          dropOff: "—",
        });
        continue;
      }
      const prevStep = PAID_FUNNEL_LINEAR_STEPS[i - 1]!;
      const prev = stepSets[prevStep] ?? new Set();
      const prevN = prev.size;
      const pct = prevN > 0 ? `${((n / prevN) * 100).toFixed(1)}%` : n > 0 ? "—" : "0%";
      const diff = prevN - n;
      const dropOff = n > prevN ? "—" : String(Math.max(0, diff));
      rows.push({ step, sessions: n, pctPrev: pct, dropOff });
    }
    const abandon = PAID_FUNNEL_DISPLAY_ORDER[PAID_FUNNEL_DISPLAY_ORDER.length - 1]!;
    const checkoutS = stepSets["premium_checkout_completed"] ?? new Set();
    const sentS = stepSets["agreement_sent"] ?? new Set();
    const abandonN = (stepSets[abandon] ?? new Set()).size;
    const checkoutN = checkoutS.size;
    const abandonPct = checkoutN > 0 ? `${((abandonN / checkoutN) * 100).toFixed(1)}%` : abandonN > 0 ? "—" : "0%";
    let postCheckoutNotSent = 0;
    for (const s of checkoutS) {
      if (!sentS.has(s)) postCheckoutNotSent += 1;
    }
    rows.push({
      step: abandon,
      sessions: abandonN,
      pctPrev: abandonPct,
      dropOff: String(postCheckoutNotSent),
      note: "“Conversion” = abandon rows / sessions with premium_checkout_completed. “Drop-off” = sessions with checkout but no agreement_sent (set difference).",
    });
    return rows;
  }, [stepSets]);

  const countsByEvent = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of PAID_FUNNEL_DISPLAY_ORDER) c[s] = 0;
    for (const e of filteredEvents) {
      if (c[e.name] !== undefined) c[e.name]! += 1;
    }
    return c;
  }, [filteredEvents]);

  const latestTwenty = useMemo(
    () => [...filteredEvents].sort((a, b) => b.ts - a.ts).slice(0, 20),
    [filteredEvents],
  );

  const bySession = useMemo(() => {
    const m = new Map<string, PaidFunnelStoredRow[]>();
    for (const e of filteredEvents) {
      const k = e.session_id || "(missing)";
      const arr = m.get(k) ?? [];
      arr.push(e);
      m.set(k, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.ts - b.ts);
    }
    const entries = [...m.entries()].sort((a, b) => {
      const am = Math.max(...a[1].map((r) => r.ts));
      const bm = Math.max(...b[1].map((r) => r.ts));
      return bm - am;
    });
    return entries.slice(0, 30);
  }, [filteredEvents]);

  const onExportCsv = useCallback(() => {
    const csv = toCsv(filteredEvents);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lawdog-paid-funnel-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredEvents]);

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

  const hasAnyData = allEvents.length > 0;
  const hasFiltered = filteredEvents.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-slate-200">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Internal</p>
          <h1 className="text-xl font-semibold text-slate-50">Paid funnel (Pro)</h1>
          <p className="mt-2 rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-xs leading-relaxed text-amber-100/95">
            Debug view of <strong className="font-medium text-amber-50">browser-local</strong> events (
            {PAID_FUNNEL_EVENT_STORAGE_KEY}). Not production-wide telemetry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900"
            onClick={reload}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded border border-rose-900/50 px-3 py-1 text-xs text-rose-200/95 hover:bg-rose-950/40"
            onClick={() => {
              if (!window.confirm("Clear paid funnel rows from localStorage in this browser?")) return;
              clearPaidFunnelEvents();
              reload();
            }}
          >
            Clear local funnel data
          </button>
          <button
            type="button"
            className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900"
            onClick={onExportCsv}
            disabled={!hasFiltered}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900"
            onClick={() => navigate("/app/ops/growth")}
          >
            Growth funnel
          </button>
          <button type="button" className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900" onClick={() => navigate("/app")}>
            App home
          </button>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-slate-700/80 bg-slate-900/40 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filters</p>
        <p className="mt-1 text-xs text-slate-500">Rows missing a dimension are excluded when that filter is set.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs text-slate-500">
            agreement_intent_id
            <select
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
              value={filterInputs.agreement_intent_id}
              onChange={(e) => setFilterInputs((p) => ({ ...p, agreement_intent_id: e.target.value }))}
            >
              <option value="">(all)</option>
              {optionLists.agreement_intent_id.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            device
            <select
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
              value={filterInputs.device}
              onChange={(e) => setFilterInputs((p) => ({ ...p, device: e.target.value }))}
            >
              <option value="">(all)</option>
              {optionLists.device.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            premium_generation_outcome
            <select
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
              value={filterInputs.premium_generation_outcome}
              onChange={(e) => setFilterInputs((p) => ({ ...p, premium_generation_outcome: e.target.value }))}
            >
              <option value="">(all)</option>
              {optionLists.premium_generation_outcome.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            render_source
            <select
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
              value={filterInputs.render_source}
              onChange={(e) => setFilterInputs((p) => ({ ...p, render_source: e.target.value }))}
            >
              <option value="">(all)</option>
              {optionLists.render_source.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-200/95 hover:bg-emerald-950/50"
            onClick={applyFilters}
          >
            Apply filters
          </button>
          <button
            type="button"
            className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900"
            onClick={() => {
              setFilterInputs(EMPTY_FILTER);
              setFilter(EMPTY_FILTER);
            }}
          >
            Reset
          </button>
        </div>
      </section>

      {!hasAnyData ? (
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-8 text-center">
          <p className="text-sm text-slate-300">No paid funnel rows in this browser yet.</p>
          <p className="mt-2 text-xs text-slate-500">
            Run a create flow that emits paid-funnel events (or trigger events on <code className="text-slate-400">/app/create</code>), then
            refresh. Data is stored under {PAID_FUNNEL_EVENT_STORAGE_KEY}.
          </p>
        </div>
      ) : !hasFiltered ? (
        <div className="mt-8 rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-6 text-center text-sm text-amber-100/90">
          No events match the current filters. Widen filters or clear them.
        </div>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-slate-200">Summary</h2>
            <dl className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Distinct session_id (filtered)</dt>
                <dd className="font-mono text-lg font-semibold text-slate-100">{totalSessions.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Event rows (filtered)</dt>
                <dd className="font-mono text-lg font-semibold text-slate-100">{filteredEvents.length.toLocaleString()}</dd>
              </div>
            </dl>
          </section>

          <section className="mt-6 overflow-x-auto rounded-xl border border-slate-700/80">
            <table className="min-w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/60 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2">Sessions</th>
                  <th className="px-3 py-2">Conversion vs prev</th>
                  <th className="px-3 py-2">Drop-off (sessions)</th>
                </tr>
              </thead>
              <tbody>
                {funnelTable.map((row) => (
                  <tr key={row.step} className="border-b border-slate-800/80">
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-200">{row.step}</td>
                    <td className="px-3 py-2 tabular-nums">{row.sessions}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-200/90">{row.pctPrev}</td>
                    <td className="px-3 py-2 tabular-nums text-rose-200/80">{row.dropOff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-500">
              {funnelTable.find((r) => r.note)?.note}
            </p>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-slate-200">Count per event (filtered row volume)</h2>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {PAID_FUNNEL_DISPLAY_ORDER.map((k) => (
                <li key={k} className="flex justify-between gap-2 rounded border border-slate-800/80 bg-slate-900/30 px-2 py-1 font-mono text-[11px] text-slate-300">
                  <span className="truncate">{k}</span>
                  <span className="tabular-nums text-slate-100">{countsByEvent[k] ?? 0}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-slate-200">Latest 20 events (filtered)</h2>
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-700/80">
              <table className="min-w-full text-left text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-900/60 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">ts</th>
                    <th className="px-2 py-2">name</th>
                    <th className="px-2 py-2">session_id</th>
                    <th className="px-2 py-2">intent</th>
                    <th className="px-2 py-2">device</th>
                    <th className="px-2 py-2">outcome</th>
                    <th className="px-2 py-2">render</th>
                  </tr>
                </thead>
                <tbody>
                  {latestTwenty.map((r) => (
                    <tr key={`${r.ts}-${r.name}-${r.session_id}`} className="border-b border-slate-800/80">
                      <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">{formatTs(r.ts)}</td>
                      <td className="px-2 py-1.5 font-mono text-[10px] text-slate-200">{r.name}</td>
                      <td className="max-w-[120px] truncate px-2 py-1.5 font-mono text-[10px] text-slate-400" title={r.session_id}>
                        {r.session_id}
                      </td>
                      <td className="px-2 py-1.5 text-[10px] text-slate-500">{r.agreement_intent_id ?? "—"}</td>
                      <td className="px-2 py-1.5 text-[10px] text-slate-500">{r.device ?? "—"}</td>
                      <td className="px-2 py-1.5 text-[10px] text-slate-500">{r.premium_generation_outcome ?? "—"}</td>
                      <td className="max-w-[140px] truncate px-2 py-1.5 text-[10px] text-slate-500" title={r.render_source ?? ""}>
                        {r.render_source ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-slate-200">By session (up to 30, newest first)</h2>
            <div className="mt-2 space-y-2">
              {bySession.map(([sid, evs]) => (
                <details key={sid} className="rounded-lg border border-slate-800 bg-slate-950/40">
                  <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] text-slate-300">
                    {sid}{" "}
                    <span className="ml-2 text-slate-500">
                      ({evs.length} event{evs.length === 1 ? "" : "s"})
                    </span>
                  </summary>
                  <ol className="list-decimal space-y-1 border-t border-slate-800/80 px-8 py-2 text-xs text-slate-400">
                    {evs.map((e) => (
                      <li key={`${e.ts}-${e.name}`} className="pl-1">
                        <span className="text-slate-500">{formatTs(e.ts)}</span> —{" "}
                        <span className="font-mono text-slate-200">{e.name}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
