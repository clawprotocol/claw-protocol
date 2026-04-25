import { useEffect, useState } from "react";

export type LatestPayoutNotice = {
  payout_id: string;
  amount_usd: number;
  paid_at?: string | null;
  tx_hash?: string | null;
  explorer_tx_url?: string | null;
};

export function AffiliatePayoutBanners(props: {
  affiliateId: string;
  payableUsd: number;
  latestPayout: LatestPayoutNotice | null | undefined;
}) {
  const { affiliateId, payableUsd, latestPayout } = props;
  const [hidePayable, setHidePayable] = useState(false);
  const [hideSent, setHideSent] = useState(false);

  useEffect(() => {
    setHidePayable(sessionStorage.getItem(`lawdog_payable_banner_${affiliateId}`) === "1");
    const ack = localStorage.getItem(`lawdog_payout_sent_ack_${affiliateId}`) || "";
    if (latestPayout?.payout_id && ack === latestPayout.payout_id) {
      setHideSent(true);
    } else {
      setHideSent(false);
    }
  }, [affiliateId, latestPayout?.payout_id]);

  const showPayable = payableUsd >= 0.01 && !hidePayable;
  const showSent = Boolean(latestPayout?.payout_id) && !hideSent;

  return (
    <div className="space-y-2">
      {showPayable ? (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-emerald-800/45 bg-emerald-950/30 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-emerald-100/95">
            <span className="font-semibold">You have a balance ready to pay out.</span>{" "}
            It is in line for the next USDC run — you do not need to take action in the app.
          </p>
          <button
            type="button"
            className="shrink-0 rounded border border-emerald-800/50 px-2 py-0.5 text-[10px] font-medium text-emerald-200/90 hover:bg-emerald-950/50"
            onClick={() => {
              sessionStorage.setItem(`lawdog_payable_banner_${affiliateId}`, "1");
              setHidePayable(true);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {showSent && latestPayout ? (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-violet-800/45 bg-violet-950/30 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-violet-100/95">
            <span className="font-semibold">Your payout was sent</span> — USDC transfer completed
            {latestPayout.amount_usd != null ? (
              <>
                {" "}
                (<span className="tabular-nums">${latestPayout.amount_usd.toFixed(2)}</span>)
              </>
            ) : null}
            . Check your wallet and on-chain explorer for the transaction.
            {latestPayout.explorer_tx_url ? (
              <>
                {" "}
                <a
                  href={latestPayout.explorer_tx_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-violet-200 underline decoration-violet-500/50 underline-offset-2"
                >
                  View transaction
                </a>
              </>
            ) : null}
          </p>
          <button
            type="button"
            className="shrink-0 rounded border border-violet-800/50 px-2 py-0.5 text-[10px] font-medium text-violet-200/90 hover:bg-violet-950/50"
            onClick={() => {
              localStorage.setItem(`lawdog_payout_sent_ack_${affiliateId}`, latestPayout.payout_id);
              setHideSent(true);
            }}
          >
            Got it
          </button>
        </div>
      ) : null}
    </div>
  );
}
