import { useCallback, useEffect, useId, useState } from "react";
import { AppShell } from "./AppShell";
import { getOrgId } from "./orgContext";
import { useLaunchNav } from "./LaunchNavContext";
import { fetchAgreementUsageSummary } from "../agreement/agreementWorkspaceApi";
import { fetchSubscription } from "./billingApi";
import {
  type IntegrationWebhookRow,
  type WebhookDeliveryRow,
  auditIntegrationSettingsOpened,
  deleteIntegrationWebhook,
  fetchIntegrationWebhooks,
  fetchWebhookDeliveries,
  patchIntegrationWebhook,
  registerIntegrationWebhook,
  retryWebhookDelivery,
  rotateWebhookSecret,
} from "./integrationsApi";

/** Short descriptions — keep aligned with `backend/integrations/DEVELOPER.md` event catalog. */
const WEBHOOK_EVENT_HELP: Record<string, string> = {
  "agreement.created": "Draft created or forked from a prior agreement.",
  "agreement.updated": "Workspace owner updated a draft field.",
  "agreement.sent": "Review / send milestone recorded.",
  "agreement.signed": "All required signers completed (fully executed).",
  "agreement.completed": "Same milestone as signed — workflow-complete automations.",
  "agreement.expired": "Free-plan draft TTL expired.",
  "agreement.memory.indexed": "Agreement Memory index updated for one agreement.",
  "document.analysis.completed": "Document layout analysis finished.",
  "field.review.completed": "Field review manifest saved.",
  "paywall.triggered": "Usage economics blocked an action (object is workspace / org id).",
  "subscription.upgraded": "New subscription recorded (initial purchase).",
};

function workspaceHasIntegrationsAccess(tier: string | undefined, planCode: string | null): boolean {
  if (import.meta.env.DEV) return true;
  if (planCode) return true;
  return Boolean(tier && tier !== "free");
}

export function IntegrationsPage() {
  const { navigate } = useLaunchNav();
  const orgId = getOrgId();
  const formId = useId();
  const [usTier, setUsTier] = useState<string | undefined>(undefined);
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [hooks, setHooks] = useState<IntegrationWebhookRow[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [lastSecret, setLastSecret] = useState<{ hookId: string; secret: string } | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<{ hookId: string; secret: string } | null>(null);

  const unlocked = workspaceHasIntegrationsAccess(usTier, planCode);

  const refresh = useCallback(async () => {
    const [wh, del] = await Promise.all([
      fetchIntegrationWebhooks(orgId),
      fetchWebhookDeliveries(orgId, 80),
    ]);
    setHooks(wh.hooks);
    setEventTypes(wh.available_event_types);
    setDeliveries(del);
    setSelectedEvents((prev) => {
      if (prev.size > 0) return prev;
      return new Set(wh.available_event_types);
    });
  }, [orgId]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setLoadErr(null);
      try {
        const [u, sub] = await Promise.all([fetchAgreementUsageSummary(), fetchSubscription(orgId)]);
        if (cancel) return;
        setUsTier(u.data?.tier);
        setPlanCode(sub.data?.plan_code ?? null);
      } catch (e) {
        if (!cancel) setLoadErr(e instanceof Error ? e.message : "Could not load workspace.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!unlocked) return;
    let cancel = false;
    void (async () => {
      try {
        await auditIntegrationSettingsOpened(orgId);
      } catch {
        /* non-blocking */
      }
      if (cancel) return;
      try {
        await refresh();
      } catch (e) {
        if (!cancel) setLoadErr(e instanceof Error ? e.message : "Could not load integrations.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [orgId, refresh, unlocked]);

  const toggleEventType = (ev: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  };

  const onRegister = async () => {
    setActionErr(null);
    const url = newUrl.trim();
    const evs = [...selectedEvents];
    if (!url || evs.length === 0) {
      setActionErr("Add a URL and choose at least one event.");
      return;
    }
    setBusy(true);
    try {
      const res = await registerIntegrationWebhook(orgId, { url, events: evs });
      const hid = String(res.hook_id ?? "");
      const sec = String(res.signing_secret ?? "");
      if (hid && sec) setLastSecret({ hookId: hid, secret: sec });
      setNewUrl("");
      await refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (hookId: string) => {
    if (!window.confirm("Delete this webhook endpoint?")) return;
    setActionErr(null);
    setBusy(true);
    try {
      await deleteIntegrationWebhook(orgId, hookId);
      await refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const onRotate = async (hookId: string) => {
    const ok = window.confirm(
      "Rotate the signing secret for this endpoint? The previous secret stops working immediately — update your receiver before confirming.",
    );
    if (!ok) return;
    setActionErr(null);
    setBusy(true);
    try {
      const r = await rotateWebhookSecret(orgId, hookId);
      setRotatedSecret({ hookId, secret: r.signing_secret });
      await refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Rotate failed.");
    } finally {
      setBusy(false);
    }
  };

  const onToggleEnabled = async (row: IntegrationWebhookRow) => {
    setActionErr(null);
    setBusy(true);
    try {
      await patchIntegrationWebhook(orgId, row.hook_id, { enabled: !row.enabled });
      await refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const onRetry = async (deliveryId: string) => {
    setActionErr(null);
    setBusy(true);
    try {
      await retryWebhookDelivery(orgId, deliveryId);
      await refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Retry failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title="Integrations & webhooks"
      subtitle="Automate CLAW with outbound events and stable inbound API aliases — org-scoped and signed."
    >
      {loadErr ? (
        <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          {loadErr}
        </div>
      ) : null}

      {!unlocked ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-6 text-sm text-slate-200">
          <p className="font-medium text-white">Integrations are available on paid workspaces.</p>
          <p className="mt-2 text-slate-400">
            Upgrade to register webhook URLs, verify signed payloads, and monitor deliveries.
          </p>
          <button
            type="button"
            className="vs01-btn vs01-btn--primary mt-4"
            onClick={() => navigate("/app/billing")}
          >
            View plans
          </button>
        </div>
      ) : (
        <>
          {actionErr ? (
            <div className="mb-4 rounded-lg border border-rose-800/40 bg-rose-950/25 px-4 py-3 text-sm text-rose-100">
              {actionErr}
            </div>
          ) : null}

          <p className="mb-6 text-sm text-slate-400">
            Workspace <code className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-300">{orgId}</code>
            — use the same <code className="text-xs">X-Claw-Org-Id</code> header as other CLAW APIs.
          </p>

          <section className="mb-10 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Register webhook</h2>
            <form
              id={formId}
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void onRegister();
              }}
            >
              <div>
                <label className="block text-xs text-slate-500" htmlFor={`${formId}-url`}>
                  HTTPS URL
                </label>
                <input
                  id={`${formId}-url`}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  placeholder="https://example.com/claw-webhook"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  disabled={busy}
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-xs text-slate-500">Subscribed events</legend>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Names are stable dotted identifiers. Payload schema{" "}
                  <code className="text-slate-400">claw.integration.webhook/v1</code> — verify with HMAC (see repo{" "}
                  <code className="text-slate-400">DEVELOPER.md</code>).
                </p>
                <div className="mt-2 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                  {eventTypes.map((ev) => (
                    <label
                      key={ev}
                      className="flex cursor-pointer gap-2 rounded border border-slate-800/80 bg-slate-900/30 px-2 py-1.5 text-sm text-slate-300 hover:border-slate-700/90"
                      title={WEBHOOK_EVENT_HELP[ev] ?? ev}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={selectedEvents.has(ev)}
                        onChange={() => toggleEventType(ev)}
                        disabled={busy}
                      />
                      <span className="min-w-0">
                        <code className="text-xs text-teal-200/90">{ev}</code>
                        {WEBHOOK_EVENT_HELP[ev] ? (
                          <span className="mt-0.5 block text-[11px] font-normal leading-snug text-slate-500">
                            {WEBHOOK_EVENT_HELP[ev]}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className="vs01-btn vs01-btn--primary" disabled={busy}>
                {busy ? "Saving…" : "Register webhook"}
              </button>
            </form>
            {lastSecret ? (
              <div className="mt-4 rounded border border-teal-800/50 bg-teal-950/20 p-3 text-xs text-teal-100">
                <p className="font-medium text-teal-50">Signing secret (copy now; not shown again)</p>
                <p className="mt-1 break-all font-mono text-teal-200/90">{lastSecret.secret}</p>
                <p className="mt-1 text-teal-200/70">Hook {lastSecret.hookId}</p>
              </div>
            ) : null}
            {rotatedSecret ? (
              <div className="mt-4 rounded border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-100">
                <p className="font-medium">New signing secret — previous secret is invalid</p>
                <p className="mt-1 break-all font-mono">{rotatedSecret.secret}</p>
              </div>
            ) : null}
          </section>

          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configured endpoints</h2>
            {hooks.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No webhooks yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {hooks.map((h) => (
                  <li
                    key={h.hook_id}
                    className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-200"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <code className="text-xs text-slate-500">{h.hook_id}</code>
                        <p className="mt-1 break-all text-slate-100">{h.url}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Secret preview: {h.secret_preview || "—"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                          disabled={busy}
                          onClick={() => void onToggleEnabled(h)}
                        >
                          {h.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                          disabled={busy}
                          onClick={() => void onRotate(h.hook_id)}
                        >
                          Rotate secret
                        </button>
                        <button
                          type="button"
                          className="vs01-btn vs01-btn--secondary vs01-btn--compact text-rose-200"
                          disabled={busy}
                          onClick={() => void onDelete(h.hook_id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Events:{" "}
                      {(h.events || []).map((e) => (
                        <code key={e} className="mr-1 text-teal-200/80">
                          {e}
                        </code>
                      ))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent deliveries</h2>
            {deliveries.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No delivery attempts logged yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
                <table className="min-w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Started</th>
                      <th className="px-3 py-2 font-medium">Event</th>
                      <th className="px-3 py-2 font-medium">Object</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Tries</th>
                      <th className="px-3 py-2 font-medium">HTTP</th>
                      <th className="px-3 py-2 font-medium">Error</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d) => (
                      <tr key={d.delivery_id} className="border-t border-slate-800/80">
                        <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                          {d.created_at || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <code className="text-teal-200/90">{d.event_type}</code>
                        </td>
                        <td className="max-w-[8rem] truncate px-3 py-2 text-slate-400" title={d.object_id ?? ""}>
                          {d.object_type ? (
                            <>
                              <span className="text-[10px] uppercase text-slate-500">{d.object_type}</span>
                              <br />
                              <code className="text-[10px] text-slate-400">{d.object_id ?? "—"}</code>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">{d.status}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-400" title={d.last_attempt_at ?? ""}>
                          {d.retry_count ?? d.attempts ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {d.response_code ?? d.http_status ?? "—"}
                        </td>
                        <td
                          className="max-w-[10rem] truncate px-3 py-2 text-rose-200/80"
                          title={d.error_summary ?? d.last_error ?? ""}
                        >
                          {d.error_summary ?? d.last_error ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {d.status === "failed" ? (
                            <button
                              type="button"
                              className="vs01-btn vs01-btn--secondary vs01-btn--compact"
                              disabled={busy}
                              onClick={() => void onRetry(d.delivery_id)}
                              title="Re-send using stored event + summary when available"
                            >
                              Retry
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              Developer reference: <code className="text-slate-500">backend/integrations/DEVELOPER.md</code> — headers{" "}
              <code className="text-slate-500">X-Claw-Webhook-Signature</code>,{" "}
              <code className="text-slate-500">X-Claw-Webhook-Timestamp</code>,{" "}
              <code className="text-slate-500">X-Claw-Webhook-Schema</code>. Optional replay protection: reject timestamps
              skewed more than a few minutes.
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
