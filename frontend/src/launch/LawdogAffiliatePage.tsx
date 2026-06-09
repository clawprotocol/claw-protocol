import { useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { LawdogDashboardLayout } from "./LawdogProductNav";
import {
  AFFILIATE_MONTHLY_COMMISSION_USD,
  AFFILIATE_COMMISSION_RATE,
  affiliateShareEmailHref,
  affiliateShareXHref,
  formatAffiliateUsd,
  resolveAffiliateDashboardSnapshot,
} from "../account/affiliatePresentation";

function StatCard(props: { label: string; value: string; testId: string }) {
  return (
    <div
      className="rounded-xl border border-slate-800/70 bg-slate-950/30 px-4 py-3"
      data-testid={props.testId}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{props.label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-100">{props.value}</p>
    </div>
  );
}

export function LawdogAffiliatePage() {
  const snapshot = useMemo(() => resolveAffiliateDashboardSnapshot(), []);
  const [copied, setCopied] = useState(false);

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(snapshot.referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <AppShell
      title="Affiliate"
      subtitle={
        <>
          <span className="block text-sm text-slate-400">
            Share LawDog Pro and earn {Math.round(AFFILIATE_COMMISSION_RATE * 100)}% recurring commission (
            {formatAffiliateUsd(AFFILIATE_MONTHLY_COMMISSION_USD)}/month per $39 subscriber).
          </span>
        </>
      }
    >
      <LawdogDashboardLayout activeId="affiliate">
        <section
          className="rounded-xl border border-slate-800/70 bg-slate-950/25 p-4 sm:p-5"
          data-testid="affiliate-referral-link-box"
        >
          <h2 className="text-sm font-semibold text-slate-200">Your referral link</h2>
          <code
            className="mt-2 block break-all rounded-lg bg-slate-900/60 px-3 py-2 text-xs text-emerald-300/90"
            data-testid="affiliate-referral-link"
          >
            {snapshot.referralLink}
          </code>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="vs01-btn vs01-btn--primary vs01-btn--compact"
              data-testid="affiliate-copy-link"
              onClick={() => void copyLink()}
            >
              {copied ? "Copied" : "Copy Link"}
            </button>
            <a
              className="vs01-btn vs01-btn--secondary vs01-btn--compact inline-flex items-center"
              data-testid="affiliate-share-x"
              href={affiliateShareXHref(snapshot.referralLink)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Share X
            </a>
            <a
              className="vs01-btn vs01-btn--secondary vs01-btn--compact inline-flex items-center"
              data-testid="affiliate-share-email"
              href={affiliateShareEmailHref(snapshot.referralLink)}
            >
              Share Email
            </a>
          </div>
        </section>

        <div
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="affiliate-kpi-cards"
        >
          <StatCard
            label="Referrals"
            value={String(snapshot.referrals)}
            testId="affiliate-kpi-referrals"
          />
          <StatCard
            label="Active Subscribers"
            value={String(snapshot.activeSubscribers)}
            testId="affiliate-kpi-active-subs"
          />
          <StatCard
            label="Monthly Earnings"
            value={formatAffiliateUsd(snapshot.monthlyEarningsUsd)}
            testId="affiliate-kpi-monthly"
          />
          <StatCard
            label="Lifetime Earnings"
            value={formatAffiliateUsd(snapshot.lifetimeEarningsUsd)}
            testId="affiliate-kpi-lifetime"
          />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section data-testid="affiliate-referral-table">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Referral performance
            </h2>
            {snapshot.referralRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No referrals yet — share your link to get started.</p>
            ) : (
              <table className="mt-3 min-w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Referral</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.referralRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-800/60 text-slate-300">
                      <td className="py-2 pr-4">{row.label}</td>
                      <td className="py-2 pr-4 capitalize">{row.status}</td>
                      <td className="py-2">{row.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section data-testid="affiliate-earnings-ledger">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Earnings ledger
            </h2>
            {snapshot.earningsRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Earnings appear here when referrals convert.</p>
            ) : (
              <table className="mt-3 min-w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Event</th>
                    <th className="py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.earningsRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-800/60 text-slate-300">
                      <td className="py-2 pr-4">{row.date}</td>
                      <td className="py-2 pr-4">{row.event}</td>
                      <td className="py-2">{formatAffiliateUsd(row.amountUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </LawdogDashboardLayout>
    </AppShell>
  );
}
