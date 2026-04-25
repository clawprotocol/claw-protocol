import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../AppShell";
import { LEGAL_GOVERNING_LAW_STATE, LEGAL_OPERATING_ENTITY } from "../legal/legalConstants";
import {
  AFFILIATE_OPS_SECRET_STORAGE_KEY,
  fetchOperatorAlerts,
  fetchPayoutBatchSummaries,
  fetchPayoutOpsContext,
  fetchSafeBatchJson,
  fetchTrustAffiliatePreview,
  markBatchExported,
  markBatchPaid,
  preparePayoutBatches,
  runTrustFridayRollover,
  safeAppHomeUrl,
  type OperatorAlertRow,
  type PayoutBatchSummary,
  type PayoutOpsContext,
  type AffiliateAccessRequestRow,
  type TrustAffiliatePreviewRow,
  fetchAffiliateAccessRequests,
  reviewAffiliateAccessRequest,
} from "./affiliatePayoutOpsApi";

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isLikelyTxHash(s: string): boolean {
  const t = s.trim();
  return /^0x[a-fA-F0-9]{64}$/.test(t);
}

function alertLane(a: OperatorAlertRow): "critical" | "warning" | "info" {
  if (a.severity === "error") return "critical";
  if (a.severity === "warning") return "warning";
  return "info";
}

function alertEmphasis(a: OperatorAlertRow): boolean {
  const t = a.event_type;
  return (
    t.includes("wallet") ||
    t.includes("treasury") ||
    t.includes("stale") ||
    t.includes("failed") ||
    t.includes("cooling")
  );
}

type ActionStrip = { label: string; tone: "ready" | "funding" | "blocked" };

function actionStripForBatch(b: PayoutBatchSummary | null): ActionStrip {
  if (!b) return { label: "Select a batch", tone: "blocked" };
  if (b.recipients_count <= 0) return { label: "Blocked · no recipients", tone: "blocked" };
  if (b.treasury_funding_required || (b.shortfall_usdc != null && b.shortfall_usdc > 0 && b.treasury_stub_active)) {
    return { label: "Funding required", tone: "funding" };
  }
  return { label: "Ready to operate", tone: "ready" };
}

export function AffiliatePayoutOpsPage() {
  const [secretInput, setSecretInput] = useState("");
  const [secret, setSecret] = useState("");
  const [ctx, setCtx] = useState<PayoutOpsContext | null>(null);
  const [batches, setBatches] = useState<PayoutBatchSummary[]>([]);
  const [alerts, setAlerts] = useState<OperatorAlertRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prepNotes, setPrepNotes] = useState("");
  const [txHash, setTxHash] = useState("");
  const [network, setNetwork] = useState("base");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [trustPreview, setTrustPreview] = useState<TrustAffiliatePreviewRow[]>([]);
  const [accessRequests, setAccessRequests] = useState<AffiliateAccessRequestRow[]>([]);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(AFFILIATE_OPS_SECRET_STORAGE_KEY) || "";
      if (s) {
        setSecret(s);
        setSecretInput(s);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadAll = useCallback(async (sec: string) => {
    const [c, b, a, t, reqs] = await Promise.all([
      fetchPayoutOpsContext(sec),
      fetchPayoutBatchSummaries(sec, 80),
      fetchOperatorAlerts(sec, 150),
      fetchTrustAffiliatePreview(sec, 120).catch(() => []),
      fetchAffiliateAccessRequests(sec, { status: "pending", limit: 120 }).catch(() => []),
    ]);
    setCtx(c);
    setBatches(b);
    setAlerts(a);
    setTrustPreview(t);
    setAccessRequests(reqs);
    setSelectedId((prev) => {
      if (prev && b.some((x) => x.batch_id === prev)) return prev;
      return b[0]?.batch_id ?? null;
    });
  }, []);

  useEffect(() => {
    if (!secret.trim()) {
      setCtx(null);
      setBatches([]);
      setAlerts([]);
      setTrustPreview([]);
      setAccessRequests([]);
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        await loadAll(secret.trim());
        if (!cancel) setErr(null);
      } catch (e) {
        if (!cancel) {
          setErr(e instanceof Error ? e.message : "Could not reach ops API.");
          setCtx(null);
          setBatches([]);
          setAlerts([]);
          setTrustPreview([]);
          setAccessRequests([]);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [secret, loadAll]);

  const selected = useMemo(
    () => batches.find((x) => x.batch_id === selectedId) ?? null,
    [batches, selectedId],
  );

  const safeHref = ctx?.payout_safe_address ? safeAppHomeUrl(ctx.payout_safe_address) : "";

  function persistSecret(): void {
    const s = secretInput.trim();
    if (!s) return;
    try {
      sessionStorage.setItem(AFFILIATE_OPS_SECRET_STORAGE_KEY, s);
    } catch {
      /* ignore */
    }
    setSecret(s);
    setMsg("Session saved for this browser tab.");
    setTimeout(() => setMsg(null), 2500);
  }

  async function onPrepare(): Promise<void> {
    if (!secret.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await preparePayoutBatches(secret.trim(), prepNotes || undefined);
      setMsg(`Prepared: ${JSON.stringify(out)}`);
      await loadAll(secret.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Prepare failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onExportJson(): Promise<void> {
    if (!secret.trim() || !selectedId) return;
    setBusy(true);
    setErr(null);
    try {
      const json = await fetchSafeBatchJson(secret.trim(), selectedId);
      downloadJson(`safe-payout-${selectedId.slice(0, 8)}.json`, json);
      setMsg("Safe JSON downloaded — load it in the Safe Transaction Builder.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onExported(): Promise<void> {
    if (!secret.trim() || !selectedId) return;
    setBusy(true);
    setErr(null);
    try {
      await markBatchExported(secret.trim(), selectedId);
      setMsg("Batch marked exported.");
      await loadAll(secret.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Mark exported failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onFridayRollover(): Promise<void> {
    if (!secret.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await runTrustFridayRollover(secret.trim());
      setMsg(`Friday rollover: ${JSON.stringify(out)}`);
      await loadAll(secret.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Rollover failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onPaid(): Promise<void> {
    if (!secret.trim() || !selectedId) return;
    setBusy(true);
    setErr(null);
    try {
      await markBatchPaid(secret.trim(), selectedId, {
        tx_hash: txHash.trim(),
        network: network.trim() || "base",
      });
      setMsg("Batch marked paid.");
      setTxHash("");
      await loadAll(secret.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Mark paid failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onReviewAccessRequest(
    requestId: string,
    status: "approved" | "declined" | "duplicate" | "spam",
  ): Promise<void> {
    if (!secret.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await reviewAffiliateAccessRequest(secret.trim(), requestId, { status });
      setMsg(`Request ${status}.`);
      await loadAll(secret.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update request.");
    } finally {
      setBusy(false);
    }
  }

  const requireTx = ctx?.require_tx_hash_for_mark_paid ?? false;
  const canMarkPaid =
    selected &&
    (selected.status === "draft" || selected.status === "exported") &&
    (!requireTx || isLikelyTxHash(txHash));

  const fundingRequired =
    Boolean(selected?.treasury_funding_required) ||
    (selected?.shortfall_usdc != null &&
      selected.shortfall_usdc > 0 &&
      Boolean(selected.treasury_stub_active));

  const strip = actionStripForBatch(selected);
  const criticalAlerts = alerts.filter((a) => alertLane(a) === "critical");
  const warningAlerts = alerts.filter((a) => alertLane(a) === "warning");
  const infoAlerts = alerts.filter((a) => alertLane(a) === "info");

  const checklist = selected
    ? {
        walletsOk: selected.recipients_count > 0,
        treasuryUnknown: !selected.treasury_stub_active,
        treasuryOk:
          Boolean(selected.treasury_stub_active) &&
          selected.shortfall_usdc != null &&
          selected.shortfall_usdc <= 0,
        exported: selected.status === "exported" || selected.status === "paid",
        executedOnChain: selected.status === "paid",
        markedPaid: selected.status === "paid",
      }
    : null;

  return (
    <AppShell
      title="Affiliate payout operations"
      subtitle="Prepare batches, export Safe JSON, execute in Safe — backend never holds keys or broadcasts."
    >
      <div className="mx-auto max-w-6xl space-y-4 px-3 pb-10 pt-2 sm:px-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.4)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Operator auth</p>
          <p className="mt-1 text-xs text-slate-500">
            Paste the server secret (header <span className="font-mono text-slate-400">X-Claw-Affiliate-Ops</span>).
            Stored only in session storage for this tab.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="password"
              autoComplete="off"
              className="min-w-[12rem] flex-1 rounded border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
              placeholder="CLAW_AFFILIATE_OPS_SECRET"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !secretInput.trim()}
              className="rounded border border-amber-600/55 bg-amber-950/35 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-40"
              onClick={() => persistSecret()}
            >
              Save session
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/80 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.4)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Program &amp; tax</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Affiliate program is administered by {LEGAL_OPERATING_ENTITY} ({LEGAL_GOVERNING_LAW_STATE}). On-chain USDC
            disbursement through this tool does not replace IRS Form W-9 / W-8 collection, verification, backup
            withholding rules, or other payout gates in the Affiliate Terms — release batches only when tax and policy
            requirements for that payee are satisfied.
          </p>
        </div>

        {err ? (
          <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-100/90">{err}</p>
        ) : null}
        {msg ? (
          <p className="rounded-lg border border-emerald-900/40 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100/90">
            {msg}
          </p>
        ) : null}

        {ctx && secret ? (
          <div className="space-y-4">
            {ctx.treasury_stub_configured ? (
              <div
                className="rounded-xl border-2 border-amber-700/60 bg-amber-950/25 px-4 py-3 text-sm text-amber-100/95"
                role="status"
              >
                <p className="font-semibold text-amber-200/95">Treasury balance is estimated</p>
                <p className="mt-1 text-xs text-amber-100/80">
                  The number below is a configured estimate, not a live on-chain read. Use it as a planning hint only; fund
                  the Safe from your canonical source of truth.
                </p>
              </div>
            ) : null}

            <div className="rounded-xl border border-emerald-900/35 bg-emerald-950/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200/90">
                  Affiliates · Friday snapshot
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded border border-emerald-700/50 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-100 disabled:opacity-40"
                  onClick={() => void onFridayRollover()}
                >
                  Record carryovers
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Same data the product uses for the affiliate dashboard. Run <span className="font-medium text-slate-400">Record carryovers</span> once per
                week after you have reviewed numbers — safe to repeat; duplicate weeks are skipped.
              </p>
              <div className="mt-3 max-h-[22rem] overflow-auto rounded border border-slate-800/70">
                <table className="min-w-full text-left text-xs text-slate-300">
                  <thead className="sticky top-0 bg-slate-950/95 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Code</th>
                      <th className="px-2 py-2">Unpaid $</th>
                      <th className="px-2 py-2">Fri OK</th>
                      <th className="px-2 py-2">Carry $</th>
                      <th className="px-2 py-2">Paid $</th>
                      <th className="px-2 py-2">Clicks</th>
                      <th className="px-2 py-2">Conv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trustPreview.map((r) => (
                      <tr key={r.affiliate_id} className="border-t border-slate-800/60">
                        <td className="px-2 py-1.5 font-mono text-emerald-100/90">{r.referral_code}</td>
                        <td className="px-2 py-1.5 tabular-nums">${r.unpaid_total_usd.toFixed(2)}</td>
                        <td className="px-2 py-1.5">{r.eligible_next_payout ? "Yes" : "No"}</td>
                        <td className="px-2 py-1.5 tabular-nums">${r.rolling_forward_usd.toFixed(2)}</td>
                        <td className="px-2 py-1.5 tabular-nums">${r.lifetime_paid_usd.toFixed(2)}</td>
                        <td className="px-2 py-1.5 tabular-nums">{r.clicks}</td>
                        <td className="px-2 py-1.5 tabular-nums">{r.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {trustPreview.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-slate-500">No affiliates loaded.</p>
                ) : null}
              </div>
            </div>

            {selected && fundingRequired ? (
              <div
                className="rounded-xl border-2 border-amber-600/70 bg-amber-950/35 px-4 py-4 text-amber-50 shadow-[0_0_24px_-8px_rgba(245,158,11,0.35)]"
                role="alert"
              >
                <p className="text-sm font-bold uppercase tracking-wide text-amber-200/95">Treasury funding required</p>
                <p className="mt-2 text-sm leading-relaxed text-amber-100/95">
                  This batch needs <span className="font-mono font-semibold">{selected.total_usdc}</span> USDC while the
                  stub balance is <span className="font-mono font-semibold">{selected.safe_balance_usdc ?? "—"}</span>.
                  Fund the Safe before executing on-chain.
                </p>
              </div>
            ) : null}

            {selected ? (
              <div
                className={`grid gap-3 rounded-xl border px-4 py-3 sm:grid-cols-2 lg:grid-cols-3 ${
                  strip.tone === "ready"
                    ? "border-emerald-800/50 bg-emerald-950/20"
                    : strip.tone === "funding"
                      ? "border-amber-700/50 bg-amber-950/20"
                      : "border-rose-900/50 bg-rose-950/25"
                }`}
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Batch</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-200">{selected.batch_id.slice(0, 13)}…</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Recipients / totals</p>
                  <p className="mt-0.5 text-xs text-slate-200">
                    {selected.recipients_count} recv · ${selected.total_usd.toFixed(2)} USD · {selected.total_usdc} USDC
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Safe balance / shortfall</p>
                  <p className="mt-0.5 text-xs text-slate-200">
                    {selected.safe_balance_usdc != null ? (
                      <span className="tabular-nums">{selected.safe_balance_usdc}</span>
                    ) : (
                      <span className="text-slate-500">stubbed / unknown</span>
                    )}
                    {" · "}
                    {selected.shortfall_usdc != null ? (
                      <span className="tabular-nums text-amber-200/90">{selected.shortfall_usdc}</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </p>
                </div>
                <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/60 pt-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Action state</p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      strip.tone === "ready"
                        ? "bg-emerald-900/50 text-emerald-100"
                        : strip.tone === "funding"
                          ? "bg-amber-900/50 text-amber-100"
                          : "bg-rose-900/50 text-rose-100"
                    }`}
                  >
                    {strip.label}
                  </span>
                  {selected.export_stale ? (
                    <span className="text-[11px] font-medium text-amber-200/90">Exported &gt;24h — review stale batch</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Treasury context</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  <li>
                    Network · <span className="font-medium text-slate-200">{ctx.network}</span> (chain {ctx.chain_id})
                  </li>
                  <li>
                    Asset · <span className="font-medium text-slate-200">{ctx.asset}</span>
                  </li>
                  <li className="break-all font-mono text-[11px] text-slate-500">USDC · {ctx.usdc_contract}</li>
                  <li>
                    Mark-paid tx hash ·{" "}
                    <span className={ctx.require_tx_hash_for_mark_paid ? "text-amber-200/90" : "text-slate-300"}>
                      {ctx.require_tx_hash_for_mark_paid ? "required (prod-style)" : "optional (dev)"}
                    </span>
                  </li>
                  <li>
                    Balance stub ·{" "}
                    {ctx.treasury_stub_configured ? (
                      <span className="text-amber-200/85">configured (estimated only)</span>
                    ) : (
                      <span className="text-slate-500">
                        not set — shortfall hidden until{" "}
                        <span className="font-mono text-slate-600">CLAW_AFFILIATE_TREASURY_SAFE_USDC_BALANCE_STUB</span>
                      </span>
                    )}
                  </li>
                </ul>
                {safeHref ? (
                  <a
                    href={safeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex rounded border border-amber-700/50 bg-amber-950/20 px-3 py-1.5 text-xs font-semibold text-amber-100/90"
                  >
                    Open payout Safe in Safe app
                  </a>
                ) : (
                  <p className="mt-3 text-[11px] text-slate-600">
                    Set <span className="font-mono">CLAW_AFFILIATE_PAYOUT_SAFE_ADDRESS</span> for a deep link.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Prepare new batches</p>
                <textarea
                  className="mt-2 w-full rounded border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
                  rows={2}
                  placeholder="Optional notes (stored on batch rows)"
                  value={prepNotes}
                  onChange={(e) => setPrepNotes(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  className="mt-2 rounded border border-amber-600/55 bg-amber-950/35 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-40"
                  onClick={() => void onPrepare()}
                >
                  Prepare payout batch
                </button>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Affiliate access requests ({accessRequests.length})
                </p>
                <p className="mt-1 text-[10px] text-slate-600">Private beta manual approval queue.</p>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto text-[11px]">
                  {accessRequests.length === 0 ? (
                    <p className="text-slate-600">No pending requests.</p>
                  ) : (
                    accessRequests.map((row) => (
                      <div key={row.id} className="rounded border border-slate-800/80 bg-slate-900/35 px-2 py-2">
                        <p className="font-mono text-slate-300">{row.id.slice(0, 8)} · {row.request_type}</p>
                        <p className="mt-1 text-slate-500">
                          {row.email || "no-email"} {row.x_handle ? `· @${row.x_handle}` : ""}{" "}
                          {row.doginal_pfp_number ? `· #${row.doginal_pfp_number}` : ""}
                        </p>
                        <p className="text-slate-600">{row.created_at?.slice(0, 19)}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded border border-emerald-700/60 bg-emerald-950/25 px-2 py-1 text-[10px] text-emerald-100 disabled:opacity-40"
                            onClick={() => void onReviewAccessRequest(row.id, "approved")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded border border-amber-700/60 bg-amber-950/25 px-2 py-1 text-[10px] text-amber-100 disabled:opacity-40"
                            onClick={() => void onReviewAccessRequest(row.id, "declined")}
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded border border-slate-700/80 bg-slate-900/55 px-2 py-1 text-[10px] text-slate-200 disabled:opacity-40"
                            onClick={() => void onReviewAccessRequest(row.id, "duplicate")}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded border border-slate-700/80 bg-slate-900/55 px-2 py-1 text-[10px] text-slate-200 disabled:opacity-40"
                            onClick={() => void onReviewAccessRequest(row.id, "spam")}
                          >
                            Spam
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Operator alerts</p>
                <p className="mt-1 text-[10px] text-slate-600">Grouped by severity · metadata only.</p>
                <div className="mt-3 max-h-80 space-y-3 overflow-y-auto text-[11px]">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-rose-300/90">Critical</p>
                    <ul className="mt-1 space-y-2">
                      {criticalAlerts.length === 0 ? (
                        <li className="text-slate-600">None</li>
                      ) : (
                        criticalAlerts.map((a) => (
                          <li
                            key={a.id}
                            className={`rounded border px-2 py-1.5 font-mono text-slate-300 ${
                              alertEmphasis(a)
                                ? "border-rose-600/50 bg-rose-950/30"
                                : "border-rose-900/40 bg-slate-900/40"
                            }`}
                          >
                            <span className="text-slate-500">{a.created_at.slice(0, 19)}</span> {a.event_type}
                            <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-slate-500">
                              {JSON.stringify(a.payload)}
                            </pre>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200/90">Warning</p>
                    <ul className="mt-1 space-y-2">
                      {warningAlerts.length === 0 ? (
                        <li className="text-slate-600">None</li>
                      ) : (
                        warningAlerts.map((a) => (
                          <li
                            key={a.id}
                            className={`rounded border px-2 py-1.5 font-mono text-slate-300 ${
                              alertEmphasis(a)
                                ? "border-amber-600/45 bg-amber-950/25"
                                : "border-slate-800/80 bg-slate-900/40"
                            }`}
                          >
                            <span className="text-slate-500">{a.created_at.slice(0, 19)}</span> {a.event_type}
                            <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-slate-500">
                              {JSON.stringify(a.payload)}
                            </pre>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Info</p>
                    <ul className="mt-1 space-y-2">
                      {infoAlerts.length === 0 ? (
                        <li className="text-slate-600">None</li>
                      ) : (
                        infoAlerts.map((a) => (
                          <li
                            key={a.id}
                            className="rounded border border-slate-800/80 bg-slate-900/40 px-2 py-1.5 font-mono text-slate-400"
                          >
                            <span className="text-slate-500">{a.created_at.slice(0, 19)}</span> {a.event_type}
                            <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-slate-500">
                              {JSON.stringify(a.payload)}
                            </pre>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Batches</p>
                <select
                  className="mt-2 w-full rounded border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
                  value={selectedId ?? ""}
                  onChange={(e) => setSelectedId(e.target.value || null)}
                >
                  {batches.map((b) => (
                    <option key={b.batch_id} value={b.batch_id}>
                      {b.batch_id.slice(0, 8)} · {b.status} · ${b.total_usd.toFixed(2)} · {b.recipients_count} recv
                    </option>
                  ))}
                </select>

                {selected ? (
                  <div className="mt-4 space-y-3 text-xs text-slate-400">
                    {checklist ? (
                      <div className="rounded-lg border border-slate-800/70 bg-slate-900/35 px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Weekly checklist</p>
                        <ul className="mt-2 space-y-1.5 text-[11px] text-slate-300">
                          <li className={checklist.walletsOk ? "text-emerald-200/90" : "text-slate-500"}>
                            {checklist.walletsOk ? "✓" : "○"} Wallets validated (batch items)
                          </li>
                          <li
                            className={
                              checklist.treasuryUnknown
                                ? "text-amber-200/85"
                                : checklist.treasuryOk
                                  ? "text-emerald-200/90"
                                  : "text-amber-200/90"
                            }
                          >
                            {checklist.treasuryUnknown
                              ? "○ Treasury funded (unknown — set stub for math)"
                              : checklist.treasuryOk
                                ? "✓ Treasury funded (stub)"
                                : "○ Treasury funded (shortfall)"}
                          </li>
                          <li className={checklist.exported ? "text-emerald-200/90" : "text-slate-500"}>
                            {checklist.exported ? "✓" : "○"} Batch marked exported
                          </li>
                          <li className={checklist.executedOnChain ? "text-emerald-200/90" : "text-slate-500"}>
                            {checklist.executedOnChain ? "✓" : "○"} Transaction executed in Safe (confirm manually)
                          </li>
                          <li className={checklist.markedPaid ? "text-emerald-200/90" : "text-slate-500"}>
                            {checklist.markedPaid ? "✓" : "○"} Batch marked paid in LawDog
                          </li>
                        </ul>
                      </div>
                    ) : null}
                    <div className="rounded-lg border border-slate-800/70 bg-slate-900/30 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Batch summary</p>
                      <ul className="mt-2 space-y-1">
                        <li>
                          Status · <span className="font-medium text-slate-200">{selected.status}</span>
                        </li>
                        <li>Recipients · {selected.recipients_count}</li>
                        <li>Total USD · ${selected.total_usd.toFixed(2)}</li>
                        <li className="break-all">Total USDC · {selected.total_usdc}</li>
                        <li>Affiliate · {selected.affiliate_id}</li>
                        {selected.safe_balance_usdc != null ? (
                          <li>Stub Safe USDC · {selected.safe_balance_usdc}</li>
                        ) : null}
                        {selected.shortfall_usdc != null ? (
                          <li className={selected.shortfall_usdc > 0 ? "text-amber-200/90" : "text-emerald-200/85"}>
                            Shortfall USDC · {selected.shortfall_usdc}
                          </li>
                        ) : null}
                      </ul>
                      {selected.notes ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{selected.notes}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || selected.status !== "draft"}
                        className="rounded border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-35"
                        onClick={() => void onExportJson()}
                      >
                        Export Safe JSON
                      </button>
                      <button
                        type="button"
                        disabled={busy || selected.status !== "draft"}
                        className="rounded border border-amber-600/55 bg-amber-950/35 px-3 py-1.5 text-xs font-semibold text-amber-100 disabled:opacity-35"
                        onClick={() => void onExported()}
                      >
                        Mark exported
                      </button>
                    </div>

                    <div className="rounded-lg border border-slate-800/70 bg-slate-900/25 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mark paid</p>
                      <p className="mt-1 text-[10px] text-slate-600">
                        Only after Safe execution confirms on-chain. No auto-send from this app.
                      </p>
                      <input
                        className="mt-2 w-full rounded border border-slate-700 bg-slate-900/80 px-2 py-1.5 font-mono text-[11px] text-slate-100"
                        placeholder="0x + 64 hex tx hash"
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value)}
                      />
                      <input
                        className="mt-2 w-full rounded border border-slate-700 bg-slate-900/80 px-2 py-1.5 font-mono text-[11px] text-slate-100"
                        placeholder="network (base)"
                        value={network}
                        onChange={(e) => setNetwork(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={busy || !canMarkPaid}
                        className="mt-2 rounded border border-emerald-700/50 bg-emerald-950/30 px-3 py-1.5 text-xs font-semibold text-emerald-100 disabled:opacity-35"
                        onClick={() => void onPaid()}
                      >
                        Mark paid
                      </button>
                      {requireTx && !isLikelyTxHash(txHash) ? (
                        <p className="mt-1 text-[10px] text-amber-200/80">Valid tx hash required in this environment.</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">No batches yet — run prepare.</p>
                )}
              </div>
            </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Save the ops secret to load batches, treasury context, and alerts.</p>
        )}

        <p className="mt-10 max-w-2xl text-[10px] leading-relaxed text-slate-600">
          Operator note: commission payouts are subject to program rules and tax documentation requirements in the{" "}
          <a
            href="/affiliate-terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 underline-offset-2 hover:underline"
          >
            Affiliate Terms
          </a>
          .
        </p>
      </div>
    </AppShell>
  );
}
