import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "../AppShell";
import {
  MISSING_ADMIN_SECRET_MESSAGE,
  adminCreateGenesisReferralAffiliate,
  downloadGenesisReferralCommissionsCsv,
  fetchAdminUsers,
  fetchGenesisReferralOpsSummary,
  readAdminConsoleSecret,
  type GenesisReferralOpsAffiliateRow,
} from "../adminConsoleApi";
import {
  adminConsoleGenesisTargetId,
  filterAdminConsoleUsers,
  normalizeAdminConsoleUser,
  type AdminConsoleUserRow,
} from "../adminConsoleUsers";
import { useLaunchNav } from "../LaunchNavContext";
import { buildGenesisReferralLink } from "./genesisReferralCapture";

type StatusFilter = "all" | "active" | "paused" | "revoked";

const DEFAULT_PAYOUT = 0.3;
const DEFAULT_SLUG = "genesis-dogs";

function money(n: number | undefined): string {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

function emptyForm() {
  return {
    lookup: "",
    userId: "",
    displayName: "",
    referralCode: "",
    affiliateStatus: "active" as "active" | "paused",
    payoutRate: String(DEFAULT_PAYOUT),
    communitySlug: DEFAULT_SLUG,
    reason: "",
  };
}

export function GenesisReferralOpsPage() {
  const { navigate } = useLaunchNav();
  const [rows, setRows] = useState<GenesisReferralOpsAffiliateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [userMatches, setUserMatches] = useState<AdminConsoleUserRow[]>([]);
  const [usersLoaded, setUsersLoaded] = useState<AdminConsoleUserRow[] | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  const hasAdminSecret = Boolean(readAdminConsoleSecret().trim());

  const load = useCallback(async () => {
    if (!readAdminConsoleSecret().trim()) {
      // Dedicated banner handles missing-secret UX; avoid raw missing_admin_secret text.
      setError(null);
      setLoading(false);
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGenesisReferralOpsSummary();
      setRows(data.affiliates ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load summary";
      setError(msg === "missing_admin_secret" ? MISSING_ADMIN_SECRET_MESSAGE : msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((r) => (r.affiliate_status || "").toLowerCase() === statusFilter);
  }, [rows, statusFilter]);

  async function ensureUsersLoaded(): Promise<AdminConsoleUserRow[]> {
    if (usersLoaded) return usersLoaded;
    const res = await fetchAdminUsers();
    const list = (res.users || [])
      .map((u) => normalizeAdminConsoleUser(u as Record<string, unknown>))
      .filter((u) => Boolean(adminConsoleGenesisTargetId(u)));
    setUsersLoaded(list);
    return list;
  }

  async function runLookup(): Promise<void> {
    const q = form.lookup.trim();
    if (!q) {
      setUserMatches([]);
      return;
    }
    setLookupBusy(true);
    setError(null);
    try {
      const users = await ensureUsersLoaded();
      const matches = filterAdminConsoleUsers(users, q).slice(0, 8);
      setUserMatches(matches);
      if (matches.length === 1) {
        applyUserMatch(matches[0]);
      } else if (matches.length === 0) {
        // Allow direct user_id paste when admin users list has no email match.
        if (!q.includes("@")) {
          setForm((f) => ({ ...f, userId: q }));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "User lookup failed";
      setError(msg === "missing_admin_secret" ? MISSING_ADMIN_SECRET_MESSAGE : msg);
      setUserMatches([]);
    } finally {
      setLookupBusy(false);
    }
  }

  function applyUserMatch(u: AdminConsoleUserRow): void {
    const uid = adminConsoleGenesisTargetId(u);
    setForm((f) => ({
      ...f,
      userId: uid,
      displayName: f.displayName.trim() || u.displayName || u.email || uid,
      lookup: u.email || uid,
    }));
    setUserMatches([]);
  }

  function startEdit(row: GenesisReferralOpsAffiliateRow): void {
    setEditingCode(row.referral_code);
    setForm({
      lookup: row.user_id,
      userId: row.user_id,
      displayName: row.display_name,
      referralCode: row.referral_code,
      affiliateStatus: row.affiliate_status === "paused" ? "paused" : "active",
      payoutRate: String(row.payout_rate ?? DEFAULT_PAYOUT),
      communitySlug: row.community_slug || DEFAULT_SLUG,
      reason: "",
    });
    setOkMsg(null);
    setError(null);
  }

  function resetForm(): void {
    setEditingCode(null);
    setForm(emptyForm());
    setUserMatches([]);
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setOkMsg(null);
    setError(null);
    const userId = form.userId.trim();
    const displayName = form.displayName.trim();
    const referralCode = form.referralCode.trim();
    const reason = form.reason.trim();
    const rate = Number(form.payoutRate);
    if (!userId || !displayName || !referralCode || reason.length < 3) {
      setError("user_id, display_name, referral_code, and reason (3+ chars) are required.");
      return;
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      setError("payout_rate must be between 0 and 1 (default 0.30).");
      return;
    }
    setSaving(true);
    try {
      const res = await adminCreateGenesisReferralAffiliate({
        user_id: userId,
        display_name: displayName,
        referral_code: referralCode,
        community_slug: form.communitySlug.trim() || DEFAULT_SLUG,
        affiliate_status: form.affiliateStatus,
        payout_rate: rate,
        reason,
      });
      const code = res.affiliate?.referral_code || referralCode.toUpperCase();
      setOkMsg(
        editingCode
          ? `Updated affiliate ${code}.`
          : `Created affiliate ${code}. Dog can copy link at /app/genesis-referral.`,
      );
      resetForm();
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create/update failed";
      setError(msg === "missing_admin_secret" ? MISSING_ADMIN_SECRET_MESSAGE : msg);
    } finally {
      setSaving(false);
    }
  }

  async function onExportCsv(): Promise<void> {
    setError(null);
    try {
      await downloadGenesisReferralCommissionsCsv();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "CSV export failed";
      setError(msg === "missing_admin_secret" ? MISSING_ADMIN_SECRET_MESSAGE : msg);
    }
  }

  return (
    <AppShell
      title="Genesis Referral — Ops"
      subtitle="Create affiliates, review stats, export commissions for manual payouts"
      navMode="minimal"
      compactFooter
    >
      <div className="max-w-6xl space-y-6">
        <p className="text-sm text-slate-400">
          Genesis Referral Access: 30% recurring share on active LawDog Pro ($39/mo). Manual payouts only — no automated
          sending.
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="vs01-btn vs01-btn--secondary text-sm" onClick={() => void load()}>
            Refresh
          </button>
          <button type="button" className="vs01-btn vs01-btn--primary text-sm" onClick={() => void onExportCsv()}>
            Export commissions CSV
          </button>
          <button type="button" className="vs01-btn vs01-btn--secondary text-sm" onClick={() => navigate("/app/admin")}>
            Admin Dashboard
          </button>
        </div>

        {!hasAdminSecret ? (
          <div
            className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
            data-testid="genesis-ops-missing-secret"
          >
            <p>{MISSING_ADMIN_SECRET_MESSAGE}</p>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact mt-3 text-sm"
              onClick={() => navigate("/app/admin")}
            >
              Open Admin Dashboard
            </button>
          </div>
        ) : null}

        <section
          className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-3"
          data-testid="genesis-referral-ops-form"
        >
          <h2 className="text-sm font-semibold text-slate-100">
            {editingCode ? `Edit affiliate (${editingCode})` : "Add / activate Genesis Dog affiliate"}
          </h2>
          <form className="space-y-3" onSubmit={(ev) => void onSubmit(ev)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-slate-400 sm:col-span-2">
                User lookup (email or user_id)
                <div className="mt-1 flex flex-wrap gap-2">
                  <input
                    className="vs01-input flex-1 min-w-[12rem] text-sm"
                    value={form.lookup}
                    onChange={(ev) => setForm((f) => ({ ...f, lookup: ev.target.value }))}
                    placeholder="name+tag@example.com or user-…"
                    data-testid="genesis-ops-lookup"
                  />
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--secondary text-sm"
                    disabled={lookupBusy}
                    onClick={() => void runLookup()}
                  >
                    {lookupBusy ? "Looking up…" : "Lookup"}
                  </button>
                </div>
              </label>
              {userMatches.length > 0 ? (
                <ul
                  className="sm:col-span-2 rounded-md border border-slate-700/60 divide-y divide-slate-800 text-sm"
                  data-testid="genesis-ops-lookup-matches"
                >
                  {userMatches.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-800/60 text-slate-200"
                        onClick={() => applyUserMatch(u)}
                      >
                        <span className="font-medium">{u.email || u.displayName || "—"}</span>
                        <span className="ml-2 text-xs text-slate-500 font-mono">
                          {adminConsoleGenesisTargetId(u)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="block text-xs text-slate-400">
                user_id
                <input
                  className="vs01-input mt-1 w-full text-sm font-mono"
                  value={form.userId}
                  onChange={(ev) => setForm((f) => ({ ...f, userId: ev.target.value }))}
                  required
                  data-testid="genesis-ops-user-id"
                />
              </label>
              <label className="block text-xs text-slate-400">
                display_name
                <input
                  className="vs01-input mt-1 w-full text-sm"
                  value={form.displayName}
                  onChange={(ev) => setForm((f) => ({ ...f, displayName: ev.target.value }))}
                  required
                  data-testid="genesis-ops-display-name"
                />
              </label>
              <label className="block text-xs text-slate-400">
                referral_code
                <input
                  className="vs01-input mt-1 w-full text-sm font-mono uppercase"
                  value={form.referralCode}
                  onChange={(ev) => setForm((f) => ({ ...f, referralCode: ev.target.value }))}
                  required
                  disabled={Boolean(editingCode)}
                  data-testid="genesis-ops-referral-code"
                />
              </label>
              <label className="block text-xs text-slate-400">
                affiliate_status
                <select
                  className="vs01-input mt-1 w-full text-sm"
                  value={form.affiliateStatus}
                  onChange={(ev) =>
                    setForm((f) => ({
                      ...f,
                      affiliateStatus: ev.target.value === "paused" ? "paused" : "active",
                    }))
                  }
                  data-testid="genesis-ops-status"
                >
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                </select>
              </label>
              <label className="block text-xs text-slate-400">
                payout_rate (default 0.30)
                <input
                  className="vs01-input mt-1 w-full text-sm font-mono"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={form.payoutRate}
                  onChange={(ev) => setForm((f) => ({ ...f, payoutRate: ev.target.value }))}
                  data-testid="genesis-ops-payout-rate"
                />
              </label>
              <label className="block text-xs text-slate-400">
                community_slug
                <input
                  className="vs01-input mt-1 w-full text-sm"
                  value={form.communitySlug}
                  onChange={(ev) => setForm((f) => ({ ...f, communitySlug: ev.target.value }))}
                  data-testid="genesis-ops-community-slug"
                />
              </label>
              <label className="block text-xs text-slate-400 sm:col-span-2">
                Audit reason
                <input
                  className="vs01-input mt-1 w-full text-sm"
                  value={form.reason}
                  onChange={(ev) => setForm((f) => ({ ...f, reason: ev.target.value }))}
                  placeholder="gtm genesis affiliate provision"
                  required
                  minLength={3}
                  data-testid="genesis-ops-reason"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="vs01-btn vs01-btn--primary text-sm"
                disabled={saving}
                data-testid="genesis-ops-submit"
              >
                {saving ? "Saving…" : editingCode ? "Save changes" : "Create / activate affiliate"}
              </button>
              {editingCode ? (
                <button type="button" className="vs01-btn vs01-btn--secondary text-sm" onClick={resetForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </section>

        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {error && !(!hasAdminSecret && error === MISSING_ADMIN_SECRET_MESSAGE) ? (
          <p className="text-sm text-amber-300" data-testid="genesis-ops-error">
            {error}
          </p>
        ) : null}
        {okMsg ? (
          <p className="text-sm text-emerald-300" data-testid="genesis-ops-ok">
            {okMsg}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-slate-400 flex items-center gap-2">
            Filter status
            <select
              className="vs01-input text-sm"
              value={statusFilter}
              onChange={(ev) => setStatusFilter(ev.target.value as StatusFilter)}
              data-testid="genesis-ops-status-filter"
            >
              <option value="all">all</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="revoked">revoked</option>
            </select>
          </label>
          <p className="text-xs text-slate-500">
            {filteredRows.length} affiliate{filteredRows.length === 1 ? "" : "s"}
            {statusFilter !== "all" ? ` (${statusFilter})` : ""}
          </p>
        </div>

        {!loading && filteredRows.length === 0 && !error ? (
          <p className="text-sm text-slate-500">No Genesis affiliates yet. Use the form above to create one.</p>
        ) : null}

        {filteredRows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-700/50" data-testid="genesis-ops-table">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">user_id</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">Link</th>
                  <th className="px-3 py-2">Visits</th>
                  <th className="px-3 py-2">Converted</th>
                  <th className="px-3 py-2">Active Pro</th>
                  <th className="px-3 py-2">Pending</th>
                  <th className="px-3 py-2">Payable</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const link =
                    r.referral_link_path ||
                    buildGenesisReferralLink(r.referral_code).replace(/^https?:\/\/[^/]+/, "") ||
                    `/app/create?ref=${encodeURIComponent(r.referral_code)}`;
                  const absLink = buildGenesisReferralLink(r.referral_code);
                  return (
                    <tr key={r.id} className="border-t border-slate-800/80 align-top">
                      <td className="px-3 py-2">{r.display_name}</td>
                      <td className="px-3 py-2 font-mono text-xs max-w-[9rem] break-all">{r.user_id}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.referral_code}</td>
                      <td className="px-3 py-2">{r.affiliate_status}</td>
                      <td className="px-3 py-2">{Math.round((r.payout_rate ?? 0) * 100)}%</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-emerald-300/90 max-w-[14rem] break-all">
                        <a href={absLink} className="underline decoration-slate-600 hover:decoration-emerald-400">
                          {link.startsWith("/") ? `…${link}` : link}
                        </a>
                      </td>
                      <td className="px-3 py-2">{r.capture_visits ?? 0}</td>
                      <td className="px-3 py-2">{r.converted_referrals}</td>
                      <td className="px-3 py-2">{r.active_referred_subscriptions ?? 0}</td>
                      <td className="px-3 py-2">{money(r.commission_pending_usd)}</td>
                      <td className="px-3 py-2">{money(r.commission_payable_usd)}</td>
                      <td className="px-3 py-2">{money(r.commission_paid_usd)}</td>
                      <td className="px-3 py-2">{money(r.commission_total_usd)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--secondary vs01-btn--compact text-xs"
                          onClick={() => startEdit(r)}
                          data-testid={`genesis-ops-edit-${r.referral_code}`}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="text-xs text-slate-500 leading-relaxed">
          CSV export includes invoice-level rows (status, amounts, periods, Stripe ids) for manual payout reconciliation.
          Mark paid offline; this page does not send payouts.
        </p>
      </div>
    </AppShell>
  );
}
