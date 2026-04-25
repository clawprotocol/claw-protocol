import type { PricingCadence } from "./pricingCadenceStorage";
import { LAUNCH_PRICING_TIERS, type LaunchPricingTier } from "./pricingTiersData";
import { TierPriceBlock } from "./TierPriceBlock";

const FREE_BULLETS = [
  "3 agreements to get started",
  "Basic drafting + preview",
  "Watermark on sends, or limited export",
] as const;

function tierById(id: LaunchPricingTier["id"]): LaunchPricingTier {
  const t = LAUNCH_PRICING_TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown tier ${id}`);
  return t;
}

/**
 * Public pricing: Try LawDog (free) · LawDog Plus · LawDog Pro · Enterprise (custom pricing headline).
 * Subscription-first; no per-agreement / per-key / per-API unit pricing on this surface.
 */
export function ConversionPricingTriad(props: {
  cadence: PricingCadence;
  sendReturnFlow: boolean;
  onFree: () => void;
  onStarter: () => void;
  onPro: () => void;
  /** Enterprise / custom pricing — defaults to caller (e.g. billing navigates to contact). */
  onEnterprise: () => void;
  /** Slightly tighter padding when embedded on the ready-to-send bridge. */
  bridge?: boolean;
}) {
  const { cadence, onFree, onStarter, onPro, onEnterprise, bridge } = props;
  const starter = tierById("starter");
  const pro = tierById("pro");
  const enterprise = tierById("enterprise");
  const sidePad = bridge ? "p-4 sm:p-5" : "p-5 sm:p-6";
  const featuredPad = bridge ? "px-5 py-6 sm:px-6 sm:py-8" : "px-6 py-7 sm:px-8 sm:py-9";
  const showFree = !bridge;

  const featuredLayout = showFree
    ? "order-2 md:order-2 md:z-10 md:-my-2 md:min-h-[min(100%,26rem)] md:scale-[1.06] md:self-center"
    : "order-2 md:order-1 md:z-10 md:-my-2 md:min-h-[min(100%,26rem)] md:scale-105";
  const proLayout = showFree ? "order-3 md:order-3" : "order-3 md:order-2";
  const enterpriseLayout = showFree ? "order-4 md:order-4" : "order-4 md:order-3";

  return (
    <div
      className={`flex flex-col gap-5 md:items-stretch md:gap-5 md:pt-2 ${
        showFree ? "md:grid md:grid-cols-2 xl:grid-cols-4" : "md:mx-auto md:grid md:max-w-4xl md:grid-cols-2"
      }`}
    >
      {/* Free — Try LawDog */}
      {showFree ? (
        <section
          className={`order-1 flex min-h-0 flex-col rounded-xl border border-slate-700/80 bg-slate-950/35 ${sidePad} md:order-1`}
          aria-labelledby="plan-free-heading"
        >
          <h2 id="plan-free-heading" className="text-lg font-semibold text-white">
            Try LawDog
          </h2>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">$0</p>
          <p className="mt-1 text-xs text-slate-500">Start fast — upgrade when you need watermark-free sends and export.</p>
          <ul className="mt-4 flex-1 space-y-2.5 text-sm leading-snug text-slate-400">
            {FREE_BULLETS.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="text-emerald-500/80" aria-hidden>
                  ·
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary mt-6 w-full min-h-[2.75rem] border border-slate-600"
            onClick={onFree}
          >
            Start free
          </button>
        </section>
      ) : null}

      {/* LawDog Plus — featured */}
      <section
        className={`flex min-h-0 flex-col rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-b from-emerald-950/35 to-slate-950/50 shadow-[0_0_48px_rgba(16,185,129,0.18)] ring-1 ring-emerald-400/25 ${featuredLayout} ${featuredPad}`}
        aria-labelledby="plan-plus-heading"
      >
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300/95">Most popular · {starter.name}</p>
        <h2 id="plan-plus-heading" className="mt-2 text-center text-xl font-bold text-white sm:text-2xl">
          Create and send agreements in minutes
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">{starter.bestFor}</p>
        <div className="mt-4 text-center">
          <TierPriceBlock tier={starter} cadence={cadence} density="compact" />
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">{starter.capacityLine}</p>
        <ul className="mt-4 space-y-2 text-sm leading-snug text-slate-300">
          {starter.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="shrink-0 text-emerald-400/90" aria-hidden>
                ✓
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="vs01-btn vs01-btn--primary mt-6 w-full min-h-[3rem] px-6 text-base font-semibold shadow-[0_4px_24px_rgba(16,185,129,0.25)]"
          onClick={onStarter}
        >
          Upgrade to send
        </button>
      </section>

      {/* LawDog Pro */}
      <section
        className={`flex min-h-0 flex-col rounded-xl border border-slate-700/80 bg-slate-950/40 ${sidePad} ${proLayout}`}
        aria-labelledby="plan-pro-heading"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{pro.name}</p>
        <h2 id="plan-pro-heading" className="mt-1 text-lg font-semibold text-white md:text-xl">
          Team features &amp; advanced AI
        </h2>
        <p className="mt-1 text-xs text-slate-500">{pro.bestFor}</p>
        <div className="mt-3">
          <TierPriceBlock tier={pro} cadence={cadence} density="compact" />
        </div>
        <p className="mt-2 text-[11px] text-slate-600">{pro.capacityLine}</p>
        <ul className="mt-4 flex-1 space-y-2 text-sm leading-snug text-slate-400">
          {pro.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="shrink-0 text-emerald-500/70" aria-hidden>
                ✓
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary mt-6 w-full min-h-[2.75rem] border border-slate-600"
          onClick={onPro}
        >
          Upgrade to Pro
        </button>
      </section>

      {/* Enterprise — only on full pricing grid (not bridge) */}
      {showFree ? (
        <section
          className={`flex min-h-0 flex-col rounded-xl border border-slate-700/80 bg-slate-950/35 ${sidePad} ${enterpriseLayout}`}
          aria-labelledby="plan-ent-heading"
        >
          <h2 id="plan-ent-heading" className="text-lg font-semibold text-white">
            {enterprise.name}
          </h2>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Custom pricing</p>
          <p className="mt-1 text-xs text-slate-500">{enterprise.capacityLine}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">{enterprise.bestFor}</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm leading-snug text-slate-400">
            {enterprise.bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="shrink-0 text-emerald-500/70" aria-hidden>
                  ✓
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="vs01-btn vs01-btn--secondary mt-6 w-full min-h-[2.75rem] border border-slate-600"
            onClick={onEnterprise}
          >
            Contact sales
          </button>
        </section>
      ) : null}

      {!showFree ? (
        <p className="mt-2 text-center text-xs text-slate-500 md:col-span-2">
          <button type="button" className="font-medium text-emerald-400/95 underline-offset-2 hover:underline" onClick={onEnterprise}>
            Enterprise or custom terms?
          </button>
        </p>
      ) : null}
    </div>
  );
}
