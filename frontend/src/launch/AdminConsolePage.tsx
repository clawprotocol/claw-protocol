import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import {
  adminPayoutBatchAction,
  adminGrantGenesisEntitlement,
  adminRefreshEntitlement,
  adminRevokeGenesisEntitlement,
  adminSetAffiliateStatus,
  adminSetUserDisabled,
  fetchAdminAffiliatePayoutBatches,
  fetchAdminAffiliates,
  fetchAdminAgreements,
  fetchAdminAudit,
  fetchAdminDeliveries,
  fetchAdminOverview,
  fetchAdminUsers,
  readAdminConsoleSecret,
  writeAdminConsoleSecret,
} from "./adminConsoleApi";
import { bootstrapQaPaymentBypassAdminSession } from "./genesisBetaPaymentBypassAuth";
import {
  adminConsoleGenesisTargetId,
  filterAdminConsoleUsers,
  normalizeAdminConsoleUser,
} from "./adminConsoleUsers";

type FounderTab = "hq" | "money" | "users" | "queue" | "partners" | "systems" | "links";

type LinkItem = { label: string; href: string; note: string };

function isDeliveryBlocked(row: Record<string, unknown>): boolean {
  const status = String(row.status || "").toLowerCase();
  return status.includes("fail") || status.includes("error") || Boolean(row.error_code);
}

function isAgreementStuck(row: Record<string, unknown>): boolean {
  const phase = String(row.current_phase || "").toLowerCase();
  return phase === "draft" || phase === "pending";
}

function moneyValue(v: unknown): string {
  if (typeof v !== "number") return "Not connected";
  return `$${v.toFixed(2)}`;
}

export function AdminConsolePage(props: { initialAdminSecret?: string } = {}) {
  const secretInputRef = useRef<HTMLInputElement>(null);
  const [secret, setSecret] = useState(() => props.initialAdminSecret?.trim() || readAdminConsoleSecret());
  const [tab, setTab] = useState<FounderTab>("hq");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [agreements, setAgreements] = useState<Record<string, unknown>[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, unknown>[]>([]);
  const [genesisAuditReason, setGenesisAuditReason] = useState("");
  const genesisReasonReady = genesisAuditReason.trim().length >= 3;
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [affiliates, setAffiliates] = useState<Record<string, unknown>[]>([]);
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  const [payoutBatches, setPayoutBatches] = useState<Record<string, unknown>[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const blockedDeliveries = useMemo(() => deliveries.filter(isDeliveryBlocked), [deliveries]);
  const normalizedUsers = useMemo(
    () => users.map((u) => normalizeAdminConsoleUser(u)),
    [users],
  );
  const filteredUsers = useMemo(
    () => filterAdminConsoleUsers(normalizedUsers, userSearchQuery),
    [normalizedUsers, userSearchQuery],
  );
  const disabledUsers = useMemo(
    () => users.filter((u) => String(u.account_status || "").toLowerCase() === "disabled"),
    [users],
  );
  const stuckAgreements = useMemo(() => agreements.filter(isAgreementStuck), [agreements]);
  const pendingPayoutBatches = useMemo(
    () => payoutBatches.filter((b) => ["draft", "exported"].includes(String(b.status || ""))),
    [payoutBatches],
  );
  const alerts = useMemo(() => {
    const rows = overview?.top_recent_errors_by_flow_stage;
    if (!Array.isArray(rows)) return [] as Array<Record<string, unknown>>;
    return rows as Array<Record<string, unknown>>;
  }, [overview]);
  const launchLinks = useMemo<LinkItem[]>(
    () => [
      { label: "Stripe", href: String(import.meta.env.VITE_FOUNDER_LINK_STRIPE || ""), note: "Billing and subscriptions" },
      { label: "OpenAI", href: String(import.meta.env.VITE_FOUNDER_LINK_OPENAI || ""), note: "Usage and model diagnostics" },
      { label: "Logs", href: String(import.meta.env.VITE_FOUNDER_LINK_LOGS || ""), note: "Application and error logs" },
      { label: "Support inbox", href: String(import.meta.env.VITE_FOUNDER_LINK_EMAIL || ""), note: "Customer support queue" },
    ],
    [],
  );

  const premiumUnlockFailureValue =
    typeof overview?.premium_unlock_failures === "number" ? String(overview?.premium_unlock_failures) : "Not connected";
  const deliveryFailureValue =
    typeof overview?.delivery_failures === "number" ? String(overview?.delivery_failures) : "Not connected";

  const loadFounderHq = useCallback(async (secretOverride?: string) => {
    const trimmed = (
      secretOverride ??
      secretInputRef.current?.value.trim() ??
      readAdminConsoleSecret().trim()
    ).trim();
    if (!trimmed) {
      setError("Enter the admin secret to connect.");
      return;
    }
    setSecret(trimmed);
    setLoading(true);
    setError(null);
    try {
      writeAdminConsoleSecret(trimmed);
      await bootstrapQaPaymentBypassAdminSession(trimmed);
      const [o, u, a, d, af, au, pb] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminUsers(),
        fetchAdminAgreements(),
        fetchAdminDeliveries(),
        fetchAdminAffiliates(),
        fetchAdminAudit(),
        fetchAdminAffiliatePayoutBatches(),
      ]);
      setOverview(o);
      setUsers((u.users || []) as Record<string, unknown>[]);
      setAgreements((a.agreements || []) as Record<string, unknown>[]);
      setDeliveries((d.events || []) as Record<string, unknown>[]);
      setAffiliates((af.affiliates || []) as Record<string, unknown>[]);
      setAudit((au.actions || []) as Record<string, unknown>[]);
      setPayoutBatches((pb.batches || []) as Record<string, unknown>[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed loading Founder HQ");
    } finally {
      setLoading(false);
    }
  }, []);

  const autoLoadedRef = useRef(false);
  useEffect(() => {
    const bootstrapSecret = props.initialAdminSecret?.trim() || readAdminConsoleSecret().trim();
    if (!bootstrapSecret || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    writeAdminConsoleSecret(bootstrapSecret);
    setSecret(bootstrapSecret);
    void loadFounderHq(bootstrapSecret);
  }, [props.initialAdminSecret, loadFounderHq]);

  const doAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await loadFounderHq();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell title="Founder HQ" subtitle="Metadata-first command center. Agreement body is hidden by default.">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
          <label className="text-xs text-slate-400">Admin secret</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input
              ref={secretInputRef}
              className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onInput={(e) => setSecret(e.currentTarget.value)}
              placeholder="x-claw-admin-secret"
            />
            <button
              type="button"
              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
              disabled={loading}
              onClick={() => void loadFounderHq()}
            >
              {loading ? "Connecting…" : "Connect"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["hq", "HQ"],
              ["money", "Money"],
              ["users", "Users"],
              ["queue", "Queue"],
              ["partners", "Partners"],
              ["systems", "Systems"],
              ["links", "Links"],
            ] as Array<[FounderTab, string]>
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`vs01-btn vs01-btn--compact ${tab === k ? "vs01-btn--primary" : "vs01-btn--secondary"}`}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="vs01-btn vs01-btn--secondary vs01-btn--compact" onClick={() => void loadFounderHq()}>
            Refresh
          </button>
        </div>

        {loading ? <p className="text-xs text-slate-500">Loading…</p> : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}

        {tab === "hq" ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Active users</p>
                <p className="mt-1 text-xl font-semibold text-slate-100">{String(overview?.active_users ?? "Not connected")}</p>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Pending payouts</p>
                <p className="mt-1 text-xl font-semibold text-slate-100">{pendingPayoutBatches.length}</p>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Delivery failures</p>
                <p className="mt-1 text-xl font-semibold text-slate-100">{deliveryFailureValue}</p>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Premium unlock failures</p>
                <p className="mt-1 text-xl font-semibold text-slate-100">{premiumUnlockFailureValue}</p>
              </div>
            </div>
            <div className="rounded-xl border border-rose-800/35 bg-rose-950/20 p-3">
              <p className="text-sm font-medium text-rose-100">Alerts queue</p>
              {alerts.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">No recent alerts.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {alerts.slice(0, 8).map((a, i) => (
                    <li key={`${String(a.event_type || "alert")}-${i}`} className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2 text-xs">
                      <p className="text-slate-200">
                        {String(a.event_type || "unknown")} · {String(a.severity || "info")}
                      </p>
                      <p className="text-slate-500">{String(a.at || "")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {tab === "money" ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Commission due</p>
                <p className="mt-1 text-lg font-semibold text-slate-100">{moneyValue(affiliates.reduce((sum, a) => sum + Number(a.commission_due || 0), 0))}</p>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Commission paid</p>
                <p className="mt-1 text-lg font-semibold text-slate-100">{moneyValue(affiliates.reduce((sum, a) => sum + Number(a.commission_paid || 0), 0))}</p>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Delivery failures</p>
                <p className="mt-1 text-lg font-semibold text-slate-100">{deliveryFailureValue}</p>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Premium unlock failures</p>
                <p className="mt-1 text-lg font-semibold text-slate-100">{premiumUnlockFailureValue}</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 text-xs">
              <p className="text-slate-400">Revenue pipeline queue</p>
              <p className="mt-1 text-slate-200">Blocked deliveries: {blockedDeliveries.length}</p>
              <p className="text-slate-200">Pending payout batches: {pendingPayoutBatches.length}</p>
            </div>
          </div>
        ) : null}

        {tab === "users" ? (
          <div className="space-y-3">
            <div
              className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3"
              data-testid="admin-users-search"
            >
              <label className="text-xs text-slate-400" htmlFor="admin-users-search">
                Find user (email, display name, user ID, or org ID)
              </label>
              <input
                id="admin-users-search"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                type="search"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="e.g. cryptocurated21@… or user id"
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Showing {Math.min(filteredUsers.length, 80)} of {filteredUsers.length} match
                {filteredUsers.length === 1 ? "" : "es"} ({normalizedUsers.length} loaded).
              </p>
            </div>
            <div
              className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3"
              data-testid="admin-genesis-audit-reason"
            >
              <label className="text-xs text-slate-400" htmlFor="admin-genesis-audit-reason">
                Audit reason (required for Grant / Revoke Genesis Dog)
              </label>
              <input
                id="admin-genesis-audit-reason"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                type="text"
                value={genesisAuditReason}
                onChange={(e) => setGenesisAuditReason(e.target.value)}
                placeholder="e.g. staging acceptance grant for cryptocurated21"
                maxLength={500}
                autoComplete="off"
              />
              {!genesisReasonReady ? (
                <p className="mt-1 text-[11px] text-amber-200/80">Enter at least 3 characters before granting or revoking.</p>
              ) : null}
            </div>
            {filteredUsers.slice(0, 80).map((u) => {
              const subjectRef = u.id;
              const genesisTarget = adminConsoleGenesisTargetId(u);
              const disabled = u.accountStatus === "disabled";
              const title =
                u.email || u.displayName || u.userId || subjectRef || "Unknown user";
              return (
                <div
                  key={subjectRef || genesisTarget}
                  className="rounded border border-slate-800 bg-slate-950/25 p-3 text-xs"
                  data-testid="admin-user-card"
                >
                  <p className="text-sm font-medium text-slate-100" data-testid="admin-user-primary-label">
                    {title}
                  </p>
                  <dl className="mt-2 grid gap-1 text-[11px] text-slate-400 sm:grid-cols-2">
                    <div>
                      <dt className="inline text-slate-500">Email: </dt>
                      <dd className="inline text-slate-200">{u.email || "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-slate-500">Display name: </dt>
                      <dd className="inline text-slate-200">{u.displayName || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2 break-all">
                      <dt className="inline text-slate-500">User ID: </dt>
                      <dd className="inline text-slate-200">{u.userId || "—"}</dd>
                    </div>
                    <div className="sm:col-span-2 break-all">
                      <dt className="inline text-slate-500">Org ID: </dt>
                      <dd className="inline text-slate-300">{u.orgId || subjectRef || "—"}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-slate-500">
                    plan={u.planType} premium={String(u.premiumActive)} agreements={u.agreementCount}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      disabled={busyId === `ent:${subjectRef}`}
                      onClick={() =>
                        void doAction(`ent:${subjectRef}`, () =>
                          adminRefreshEntitlement(subjectRef, "ops_refresh"),
                        )
                      }
                    >
                      Refresh entitlement
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      disabled={!genesisReasonReady || !genesisTarget || busyId === `genesis-grant:${genesisTarget}`}
                      onClick={() =>
                        void doAction(`genesis-grant:${genesisTarget}`, () =>
                          adminGrantGenesisEntitlement(genesisTarget, genesisAuditReason.trim()),
                        )
                      }
                    >
                      Grant Genesis Dog
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      disabled={!genesisReasonReady || !genesisTarget || busyId === `genesis-revoke:${genesisTarget}`}
                      onClick={() =>
                        void doAction(`genesis-revoke:${genesisTarget}`, () =>
                          adminRevokeGenesisEntitlement(genesisTarget, genesisAuditReason.trim()),
                        )
                      }
                    >
                      Revoke Genesis Dog
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      disabled={busyId === `status:${subjectRef}`}
                      onClick={() =>
                        void doAction(`status:${subjectRef}`, () =>
                          adminSetUserDisabled(subjectRef, !disabled, "ops_toggle_account"),
                        )
                      }
                    >
                      {disabled ? "Enable account" : "Disable account"}
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 ? (
              <p className="text-xs text-slate-500" data-testid="admin-users-empty">
                No users match this search.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "queue" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-800/35 bg-amber-950/20 p-3">
              <p className="text-sm font-medium text-amber-100">Stuck revenue</p>
              {blockedDeliveries.length === 0 && pendingPayoutBatches.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">No revenue blockers.</p>
              ) : (
                <div className="mt-2 space-y-2 text-xs">
                  {blockedDeliveries.slice(0, 8).map((d) => (
                    <div key={`${String(d.org_id || "")}:${String(d.delivery_id || "")}`} className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2">
                      <p className="text-slate-200">Delivery {String(d.delivery_id || "")}</p>
                      <p className="text-slate-500">
                        {String(d.event_type || "")} · {String(d.error_code || "error")} · org {String(d.org_id || "")}
                      </p>
                    </div>
                  ))}
                  {pendingPayoutBatches.slice(0, 8).map((b) => (
                    <div key={String(b.batch_id || b.id || "")} className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2">
                      <p className="text-slate-200">Payout batch {String(b.batch_id || b.id || "")}</p>
                      <p className="text-slate-500">status {String(b.status || "unknown")} · total {String(b.total_usd || "Not connected")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-rose-800/35 bg-rose-950/20 p-3">
              <p className="text-sm font-medium text-rose-100">Stuck users</p>
              {disabledUsers.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">No blocked users.</p>
              ) : (
                <div className="mt-2 space-y-2 text-xs">
                  {disabledUsers.slice(0, 12).map((u) => (
                    <div key={String(u.id || "")} className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2">
                      <p className="text-slate-200">{String(u.id || "")}</p>
                      <p className="text-slate-500">plan {String(u.plan_type || "free")} · premium {String(u.premium_active || false)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === "partners" ? (
          <div className="space-y-2">
            {affiliates.slice(0, 80).map((a) => {
              const id = String(a.affiliate_id || "");
              const status = String(a.status || "active") as "active" | "disabled" | "hold";
              return (
                <div key={id} className="rounded border border-slate-800 bg-slate-950/25 p-3 text-xs">
                  <p className="text-slate-200">{id} · {String(a.affiliate_code || "")}</p>
                  <p className="text-slate-500">status={status} due={String(a.commission_due || 0)} paid={String(a.commission_paid || 0)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      disabled={busyId === `aff-active:${id}`}
                      onClick={() => void doAction(`aff-active:${id}`, () => adminSetAffiliateStatus(id, "active", "ops_set_active"))}
                    >
                      Enable
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      disabled={busyId === `aff-hold:${id}`}
                      onClick={() => void doAction(`aff-hold:${id}`, () => adminSetAffiliateStatus(id, "hold", "ops_set_hold"))}
                    >
                      Hold
                    </button>
                    <button
                      type="button"
                      className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                      disabled={busyId === `aff-disable:${id}`}
                      onClick={() => void doAction(`aff-disable:${id}`, () => adminSetAffiliateStatus(id, "disabled", "ops_set_disabled"))}
                    >
                      Disable
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="mt-4 rounded border border-slate-800 bg-slate-950/25 p-3 text-xs">
              <p className="mb-2 text-slate-300">Payout batches</p>
              <div className="space-y-2">
                {payoutBatches.slice(0, 50).map((b) => {
                  const bid = String(b.batch_id || b.id || "");
                  return (
                    <div key={bid} className="rounded border border-slate-800 bg-slate-900/40 p-2">
                      <p className="text-slate-200">{bid} · {String(b.status || "unknown")} · total={String(b.total_usd || "Not connected")}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                          disabled={busyId === `pb-approve:${bid}`}
                          onClick={() => void doAction(`pb-approve:${bid}`, () => adminPayoutBatchAction(bid, "approve", "ops_approve_payout_batch"))}
                        >
                          Approve payout
                        </button>
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                          disabled={busyId === `pb-hold:${bid}`}
                          onClick={() => void doAction(`pb-hold:${bid}`, () => adminPayoutBatchAction(bid, "hold", "ops_hold_payout_batch"))}
                        >
                          Hold payout
                        </button>
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                          disabled={busyId === `pb-paid:${bid}`}
                          onClick={() => void doAction(`pb-paid:${bid}`, () => adminPayoutBatchAction(bid, "mark_paid", "ops_mark_paid_batch"))}
                        >
                          Mark paid
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "systems" ? (
          <div className="space-y-2">
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 text-xs">
              <p className="text-slate-300">Systems status</p>
              <p className="mt-1 text-slate-400">OpenAI: Not connected</p>
              <p className="text-slate-400">Stripe webhooks: {blockedDeliveries.length > 0 ? "Attention needed" : "Healthy"}</p>
              <p className="text-slate-400">Logs: Not connected</p>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 text-xs">
              <p className="mb-2 text-slate-300">Recent admin actions</p>
              {audit.slice(0, 20).map((a) => (
                <div key={String(a.id || Math.random())} className="mb-2 rounded border border-slate-800 bg-slate-900/40 p-2">
                  <p className="text-slate-200">
                    {String(a.action_type || "action")} · {String(a.target_type || "")}:{String(a.target_id || "")}
                  </p>
                  <p className="text-slate-500">by={String(a.admin_user_id || "unknown")} at={String(a.created_at || "")}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "links" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {launchLinks.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 text-xs">
                <p className="text-sm font-medium text-slate-200">{item.label}</p>
                <p className="mt-1 text-slate-500">{item.note}</p>
                {item.href ? (
                  <a className="mt-2 inline-flex rounded border border-slate-700 bg-slate-900/50 px-2 py-1 text-slate-100" href={item.href} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : (
                  <p className="mt-2 text-slate-400">Not connected</p>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {tab === "queue" ? (
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/30 p-3 text-xs">
            <p className="text-slate-300">Agreement queue</p>
            <p className="mt-1 text-slate-400">Stuck agreements: {stuckAgreements.length}</p>
            <div className="mt-2 space-y-1">
              {stuckAgreements.slice(0, 8).map((a) => (
                <p key={String(a.agreement_id || "")} className="text-slate-500">
                  {String(a.agreement_id || "")} · {String(a.current_phase || "draft")}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
