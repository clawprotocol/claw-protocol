import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../AppShell";
import { apiUrl, errorMessageFromResponse } from "../../lib/clawApi";
import { useLaunchNav } from "../LaunchNavContext";

type AffiliateRow = {
  id: string;
  user_id: string;
  display_name: string;
  referral_code: string;
  community_slug?: string | null;
  affiliate_status: string;
  payout_rate: number;
  converted_referrals: number;
  commission_pending_usd: number;
  commission_payable_usd: number;
  commission_paid_usd: number;
  commission_void_usd: number;
};

function adminSecret(): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem("claw_admin_console_secret_v1")?.trim() || "";
  } catch {
    return "";
  }
}

export function GenesisReferralOpsPage() {
  const { navigate } = useLaunchNav();
  const [rows, setRows] = useState<AffiliateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const secret = adminSecret();
    if (!secret) {
      setError("Set admin secret in /app/admin first.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/v1/genesis-referral/ops/summary"), {
        headers: { "x-claw-admin-secret": secret },
      });
      if (!res.ok) {
        setError(await errorMessageFromResponse(res, "Could not load summary"));
        setRows([]);
        return;
      }
      const data = (await res.json()) as { affiliates?: AffiliateRow[] };
      setRows(data.affiliates ?? []);
    } catch {
      setError("Could not reach genesis referral ops API.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function exportCsv(): void {
    const secret = adminSecret();
    if (!secret) return;
    const url = apiUrl("/v1/genesis-referral/ops/commissions/export.csv");
    void fetch(url, { headers: { "x-claw-admin-secret": secret } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "genesis_commissions.csv";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => setError("CSV export failed"));
  }

  return (
    <AppShell
      title="Genesis Referral — Ops"
      subtitle="Affiliates, commissions, manual payout export"
      navMode="minimal"
      compactFooter
    >
      <div className="max-w-5xl space-y-4">
        <p className="text-sm text-slate-400">
          Genesis Referral Access: 30% recurring share on active LawDog Pro ($39/mo) subscriptions. Manual payouts during
          launch.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="vs01-btn vs01-btn--secondary text-sm" onClick={() => void load()}>
            Refresh
          </button>
          <button type="button" className="vs01-btn vs01-btn--primary text-sm" onClick={exportCsv}>
            Export commissions CSV
          </button>
          <button type="button" className="vs01-btn vs01-btn--secondary text-sm" onClick={() => navigate("/app/admin")}>
            Admin console
          </button>
        </div>
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {error ? <p className="text-sm text-amber-300">{error}</p> : null}
        {!loading && rows.length === 0 && !error ? (
          <p className="text-sm text-slate-500">No Genesis affiliates yet. Create via POST /v1/genesis-referral/ops/affiliates.</p>
        ) : null}
        {rows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-700/50">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Referrals</th>
                  <th className="px-3 py-2">Pending</th>
                  <th className="px-3 py-2">Payable</th>
                  <th className="px-3 py-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800/80">
                    <td className="px-3 py-2 font-mono text-xs">{r.referral_code}</td>
                    <td className="px-3 py-2">{r.display_name}</td>
                    <td className="px-3 py-2">{r.affiliate_status}</td>
                    <td className="px-3 py-2">{r.converted_referrals}</td>
                    <td className="px-3 py-2">${r.commission_pending_usd.toFixed(2)}</td>
                    <td className="px-3 py-2">${r.commission_payable_usd.toFixed(2)}</td>
                    <td className="px-3 py-2">${r.commission_paid_usd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
