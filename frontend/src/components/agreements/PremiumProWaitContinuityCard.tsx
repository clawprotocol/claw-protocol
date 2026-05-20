/**
 * In-preview continuity while post-checkout Pro generation runs (modal may cover this on desktop;
 * mobile split-pane users still see a calm holding state instead of an empty preview).
 */

import { PREMIUM_PRO_WAIT_REASSURANCE } from "../../lib/premiumPostCheckoutReturnUx";

export function PremiumProWaitContinuityCard() {
  return (
    <div className="mx-auto w-full max-w-[850px] px-0 sm:px-1" data-testid="premium-pro-wait-continuity-card">
      <div
        className="rounded-xl border border-emerald-500/25 bg-slate-950/70 px-5 py-8 sm:px-8 sm:py-10"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/90">LawDog Pro</p>
        <p className="mt-2 text-base font-semibold text-slate-100 sm:text-lg">Building your Pro agreement</p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-400">
          Using your deal terms. This usually takes under a minute — your checkout is already confirmed.
        </p>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">{PREMIUM_PRO_WAIT_REASSURANCE}</p>
        <div className="mt-6 space-y-2.5 motion-safe:animate-pulse" aria-hidden="true">
          <div className="h-3 w-4/5 rounded bg-slate-800/90" />
          <div className="h-3 w-full rounded bg-slate-800/70" />
          <div className="h-3 w-[92%] rounded bg-slate-800/70" />
          <div className="h-28 w-full rounded-lg border border-slate-800/60 bg-[#0d1424]/80" />
        </div>
      </div>
    </div>
  );
}
