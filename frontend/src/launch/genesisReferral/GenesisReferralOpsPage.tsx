import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "../AppShell";
import {
  MISSING_ADMIN_SECRET_MESSAGE,
  adminCreateGenesisReferralAffiliate,
  downloadGenesisReferralCommissionsCsv,
  fetchAdminUsers,
  fetchGenesisDogAffiliateCandidates,
  fetchGenesisReferralOpsSummary,
  readAdminConsoleSecret,
  type GenesisDogAffiliateCandidate,
  type GenesisReferralOpsAffiliateRow,
} from "../adminConsoleApi";
import {
  adminConsoleGenesisTargetId,
  filterAdminConsoleUsers,
  normalizeAdminConsoleUser,
  type AdminConsoleUserRow,
} from "../adminConsoleUsers";
import { useLaunchNav } from "../LaunchNavContext";
import {
  buildGenesisDogSignupLink,
  suggestGenesisReferralCode,
} from "./genesisDogOnboardingCapture";
import { buildGenesisReferralLink } from "./genesisReferralCapture";

type StatusFilter = "all" | "active" | "paused" | "revoked";

const DEFAULT_PAYOUT = 0.3;
const DEFAULT_SLUG = "genesis-dogs";
const LOOKUP_NO_USER_MESSAGE =
  "No LawDog user found. Send them the Genesis Dog signup link first, then return here to activate them.";

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
  const [candidates, setCandidates] = useState<GenesisDogAffiliateCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activatingUserId, setActivatingUserId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [userMatches, setUserMatches] = useState<AdminConsoleUserRow[]>([]);
  const [usersLoaded, setUsersLoaded] = useState<AdminConsoleUserRow[] | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupEmpty, setLookupEmpty] = useState(false);
  const [copiedSignup, setCopiedSignup] = useState(false);
  const [lastActivatedLink, setLastActivatedLink] = useState<string | null>(null);

  const hasAdminSecret = Boolean(readAdminConsoleSecret().trim());
  const signupLink = useMemo(() => buildGenesisDogSignupLink(), []);

  const load = useCallback(async () => {
    if (!readAdminConsoleSecret().trim()) {
      // Dedicated banner handles missing-secret UX; avoid raw missing_admin_secret text.
      setError(null);
      setLoading(false);
      setRows([]);
      setCandidates([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [data, cand] = await Promise.all([
        fetchGenesisReferralOpsSummary(),
        fetchGenesisDogAffiliateCandidates().catch(() => ({ candidates: [] })),
      ]);
      setRows(data.affiliates ?? []);
      setCandidates(cand.candidates ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load summary";
      setError(msg === "missing_admin_secret" ? MISSING_ADMIN_SECRET_MESSAGE : msg);
      setRows([]);
      setCandidates([]);
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
      setLookupEmpty(false);
      return;
    }
    setLookupBusy(true);
    setError(null);
    setLookupEmpty(false);
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
          setLookupEmpty(false);
        } else {
          setLookupEmpty(true);
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

  async function copySignupLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(signupLink);
      setCopiedSignup(true);
      window.setTimeout(() => setCopiedSignup(false), 2000);
    } catch {
      setError("Could not copy signup link.");
    }
  }

  async function activateCandidate(c: GenesisDogAffiliateCandidate): Promise<void> {
    const userId = (c.user_id || "").trim();
    if (!userId) return;
    const displayName = (c.display_name || c.email || userId).trim();
    const existingCodes = new Set(rows.map((r) => (r.referral_code || "").toUpperCase()));
    let referralCode = suggestGenesisReferralCode({
      email: c.email,
      displayName: c.display_name,
      userId,
    });
    if (existingCodes.has(referralCode)) {
      referralCode = `${referralCode}${userId.replace(/[^A-Za-z0-9]/g, "").slice(0, 4)}`.toUpperCase().slice(0, 24);
    }
    setActivatingUserId(userId);
    setError(null);
    setOkMsg(null);
    setLastActivatedLink(null);
    try {
      const res = await adminCreateGenesisReferralAffiliate({
        user_id: userId,
        display_name: displayName,
        referral_code: referralCode,
        community_slug: c.community_slug || DEFAULT_SLUG,
        affiliate_status: "active",
        payout_rate: DEFAULT_PAYOUT,
        reason: "gtm genesis dog candidate activate",
      });
      const code = res.affiliate?.referral_code || referralCode;
      const link = buildGenesisReferralLink(code);
      setLastActivatedLink(link);
      setOkMsg(`Activated affiliate ${code}. Referral link ready to copy.`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Activate failed";
      setError(msg === "missing_admin_secret" ? MISSING_ADMIN_SECRET_MESSAGE : msg);
    } finally {
      setActivatingUserId(null);
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
      const link = buildGenesisReferralLink(code);
      setLastActivatedLink(form.affiliateStatus === "active" ? link : null);
      setOkMsg(
        editingCode
          ? `Updated affiliate ${code}.`
          : `Created affiliate ${code}. Referral link ready to copy.`,
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
          Genesis Referral Access: 30% recurring share on active LawDog Pro ($99/mo). Manual payouts only — no automated
          sending.
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="vs01-btn vs01-btn--secondary text-sm" onClick={() => void load()}>
            Refresh
          </button>
          <button
            type="button"
            className="vs01-btn vs01-btn--primary text-sm"
            onClick={() => void copySignupLink()}
            data-testid="genesis-ops-copy-signup-link"
          >
            {copiedSignup ? "Signup link copied" : "Copy Genesis Dog signup link"}
          </button>
          <button type="button" className="vs01-btn vs01-btn--secondary text-sm" onClick={() => void onExportCsv()}>
            Export commissions CSV
          </button>
          <button type="button" className="vs01-btn vs01-btn--secondary text-sm" onClick={() => navigate("/app/admin")}>
            Admin Dashboard
          </button>
        </div>
        <p className="text-xs text-slate-500 font-mono break-all" data-testid="genesis-ops-signup-link">
          {signupLink}
        </p>

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
              {lookupEmpty ? (
                <p className="sm:col-span-2 text-sm text-amber-200" data-testid="genesis-ops-lookup-empty">
                  {LOOKUP_NO_USER_MESSAGE}
                </p>
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
        {lastActivatedLink ? (
          <div
            className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-sm space-y-2"
            data-testid="genesis-ops-activated-link"
          >
            <p className="text-emerald-100">Referral link</p>
            <p className="font-mono text-xs text-emerald-200/90 break-all">{lastActivatedLink}</p>
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact text-sm"
              onClick={() => void navigator.clipboard.writeText(lastActivatedLink)}
            >
              Copy referral link
            </button>
          </div>
        ) : null}

        <section
          className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-3"
          data-testid="genesis-ops-candidates"
        >
          <h2 className="text-sm font-semibold text-slate-100">Genesis Dog candidates</h2>
          <p className="text-xs text-slate-500">
            Users who signed up through the Genesis Dog link and are waiting for affiliate activation.
          </p>
          {!loading && candidates.length === 0 ? (
            <p className="text-sm text-slate-500" data-testid="genesis-ops-candidates-empty">
              No pending candidates.
            </p>
          ) : null}
          {candidates.length > 0 ? (
            <ul className="divide-y divide-slate-800 rounded-md border border-slate-700/50">
              {candidates.map((c) => (
                <li
                  key={c.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"
                  data-testid={`genesis-ops-candidate-${c.user_id}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-100 truncate">
                      {c.display_name || c.email || "Genesis Dog candidate"}
                    </p>
                    <p className="text-xs text-slate-500 font-mono break-all">
                      {c.email || "—"} · {c.user_id}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="vs01-btn vs01-btn--primary vs01-btn--compact text-sm"
                    disabled={activatingUserId === c.user_id}
                    onClick={() => void activateCandidate(c)}
                    data-testid={`genesis-ops-activate-${c.user_id}`}
                  >
                    {activatingUserId === c.user_id ? "Activating…" : "Activate Affiliate"}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

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
