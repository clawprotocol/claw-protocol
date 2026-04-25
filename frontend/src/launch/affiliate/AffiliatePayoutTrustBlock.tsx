import type { AffiliateDashboardResponse } from "./affiliateGamificationApi";

type PayoutUi = NonNullable<AffiliateDashboardResponse["payout_ui"]>;

/** Calm expectation-setting at the top of the payout area (no hype). */
export function AffiliatePayoutTrustIntro() {
  return (
    <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">How you get paid</p>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-400">
        <li className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500/70" aria-hidden />
          <span>We batch USDC on a weekly rhythm (Fridays) when your balance is above the program minimum and past any hold.</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500/70" aria-hidden />
          <span>First-time payers often see about 30–45 days to the first send while new referrals clear review windows.</span>
        </li>
        <li className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500/70" aria-hidden />
          <span>Each send includes a transaction link you can keep for your records.</span>
        </li>
      </ul>
    </div>
  );
}

export function AffiliatePayoutMicroTrustRow(props: { payoutUi: PayoutUi }) {
  const { payoutUi } = props;
  const last = payoutUi.latest_completed_payout;
  const lastLine =
    last && typeof last.amount_usd === "number"
      ? `$${last.amount_usd.toFixed(2)}${
          last.paid_at ? ` · ${String(last.paid_at).slice(0, 10)}` : ""
        }`
      : "—";

  const windowLineRaw = payoutUi.next_payout_window_copy.split(".")[0]?.trim() || payoutUi.next_payout_window_copy;
  const windowLine = windowLineRaw.endsWith(".") ? windowLineRaw.slice(0, -1) : windowLineRaw;

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg border border-slate-800/70 bg-slate-950/35 px-2.5 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Total paid to you</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-200/90">
          ${payoutUi.totals.total_paid_usd.toFixed(2)}
        </p>
      </div>
      <div className="rounded-lg border border-slate-800/70 bg-slate-950/35 px-2.5 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Last payout sent</p>
        <p className="mt-0.5 text-[11px] font-medium tabular-nums text-slate-200">{lastLine}</p>
      </div>
      <div className="rounded-lg border border-slate-800/70 bg-slate-950/35 px-2.5 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Weekly run</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
          {windowLine ? `${windowLine}.` : "Fridays (UTC) after minimum and hold are met."}
        </p>
      </div>
    </div>
  );
}
