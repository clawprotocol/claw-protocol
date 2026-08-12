import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../AppShell";
import { useLaunchNav } from "../LaunchNavContext";
import { buildGenesisReferralLink } from "./genesisReferralCapture";
import { fetchGenesisAffiliateDashboard, type GenesisAffiliateDashboard } from "./genesisReferralApi";
import { RequireActiveGenesisAffiliate } from "./RequireActiveGenesisAffiliate";

const GOOD_STANDING_NOTE =
  "Genesis Referral Access pays a 30% recurring referral share while referred Pro subscriptions remain active, subject to good standing and fair-use participation. Payouts are processed manually during early launch.";

export function GenesisAffiliateDashboardPage() {
  return (
    <RequireActiveGenesisAffiliate>
      <GenesisAffiliateDashboardBody />
    </RequireActiveGenesisAffiliate>
  );
}

function GenesisAffiliateDashboardBody() {
  const { navigate } = useLaunchNav();
  const [data, setData] = useState<GenesisAffiliateDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetchGenesisAffiliateDashboard();
      if (!cancelled) {
        setData(res);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const referralLink = useMemo(() => {
    const code = data?.affiliate?.referral_code;
    if (!code) return "";
    return buildGenesisReferralLink(code);
  }, [data?.affiliate?.referral_code]);

  async function copyLink(): Promise<void> {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <AppShell
      title="Genesis Referral Access"
      subtitle="30% recurring referral share on LawDog Pro"
      navMode="minimal"
      compactFooter
    >
      {loading ? (
        <p className="text-sm text-slate-400">Loading your referral dashboard…</p>
      ) : !data?.ok ? (
        <div className="max-w-lg space-y-4" data-testid="genesis-affiliate-access-denied">
          <p className="text-sm text-slate-300">This area is not available for your account.</p>
          <button type="button" className="vs01-btn vs01-btn--secondary" onClick={() => navigate("/app")}>
            Back to dashboard
          </button>
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <p className="text-sm text-slate-300">
            Welcome, <strong className="text-slate-100">{data.affiliate?.display_name}</strong>. Share your link for
            LawDog Pro ($99/month). You earn a <strong className="text-slate-100">30% recurring referral share</strong>{" "}
            while referred Pro subscriptions remain active.
          </p>

          <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-100">Your referral link</h2>
            <code className="block text-xs text-emerald-300/90 break-all">{referralLink}</code>
            <button type="button" className="vs01-btn vs01-btn--primary text-sm" onClick={() => void copyLink()}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Converted referrals" value={String(data.converted_referrals ?? 0)} />
            <Stat label="Active referred Pro subs" value={String(data.active_referred_subscriptions ?? 0)} />
            <Stat label="Pending commission" value={`$${(data.pending_commission_usd ?? 0).toFixed(2)}`} />
            <Stat label="Payable commission" value={`$${(data.payable_commission_usd ?? 0).toFixed(2)}`} />
            <Stat label="Paid to date" value={`$${(data.paid_commission_usd ?? 0).toFixed(2)}`} />
            <Stat label="Your rate" value={`${Math.round((data.affiliate?.payout_rate ?? 0.3) * 100)}%`} />
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">{GOOD_STANDING_NOTE}</p>
        </div>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}
