import type { PersistedProductEvent } from "./growthEventPersistence";
import { sessionId } from "./growthMetricsAggregate";

/** Funnel (agreement) events — match productEvents + agreementFunnel wiring. */
export const STARTER_PRO_REFINE_EXPERIMENT_EVENTS = {
  controlImpression: "starter_pro_refine_control_impression",
  variantImpression: "starter_pro_refine_variant_impression",
  controlClick: "starter_pro_refine_upsell_control_click",
  variantClick: "starter_pro_refine_upsell_variant_click",
  controlPurchase: "starter_pro_refine_control_checkout_success",
  variantPurchase: "starter_pro_refine_variant_checkout_success",
} as const;

const REVENUE_LOOKBACK_MS = 15_000;

/**
 * `paywall_revenue_attributed` is emitted in the same checkout commit as
 * `starter_pro_refine_*_checkout_success` when a paywall view is attributed. Same-session, prior row.
 */
function revenueUsdForPurchase(
  purchase: PersistedProductEvent,
  sorted: PersistedProductEvent[],
): { usd: number; attributed: boolean } {
  const sid = sessionId(purchase);
  const t0 = purchase.ts - REVENUE_LOOKBACK_MS;
  let best: PersistedProductEvent | null = null;
  for (const p of sorted) {
    if (p.ts >= purchase.ts) break;
    if (p.ts < t0) continue;
    if (sessionId(p) !== sid) continue;
    if (p.name !== "paywall_revenue_attributed") continue;
    if (!best || p.ts > best.ts) best = p;
  }
  if (!best) return { usd: 0, attributed: false };
  const r = best.payload?.revenue_usd;
  if (typeof r === "number" && Number.isFinite(r) && r > 0) {
    return { usd: r, attributed: true };
  }
  return { usd: 0, attributed: false };
}

export type StarterProRefineExperimentStats = {
  controlImpressions: number;
  variantImpressions: number;
  controlClicks: number;
  variantClicks: number;
  controlPurchases: number;
  variantPurchases: number;
  controlRevenueUsd: number;
  variantRevenueUsd: number;
  controlPurchasesWithoutRevenue: number;
  variantPurchasesWithoutRevenue: number;
  controlCtr: number | null;
  variantCtr: number | null;
  controlClickToPurchase: number | null;
  variantClickToPurchase: number | null;
  controlImpressionToPurchase: number | null;
  variantImpressionToPurchase: number | null;
  controlRpi: number | null;
  variantRpi: number | null;
};

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return num / den;
}

/**
 * Local persisted product events (browser) — not authoritative server totals.
 * Revenue joins `paywall_revenue_attributed` when it precedes the success row in the same session.
 */
export function computeStarterProRefineExperimentStats(
  events: readonly PersistedProductEvent[],
): StarterProRefineExperimentStats {
  const e = STARTER_PRO_REFINE_EXPERIMENT_EVENTS;
  let ci = 0,
    vi = 0,
    cc = 0,
    vc = 0,
    cp = 0,
    vp = 0;
  for (const row of events) {
    if (row.name === e.controlImpression) ci++;
    else if (row.name === e.variantImpression) vi++;
    else if (row.name === e.controlClick) cc++;
    else if (row.name === e.variantClick) vc++;
    else if (row.name === e.controlPurchase) cp++;
    else if (row.name === e.variantPurchase) vp++;
  }

  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  let cRev = 0,
    vRev = 0;
  let cNoRev = 0,
    vNoRev = 0;
  for (const row of events) {
    if (row.name === e.controlPurchase) {
      const { usd, attributed } = revenueUsdForPurchase(row, sorted);
      cRev += usd;
      if (!attributed) cNoRev++;
    } else if (row.name === e.variantPurchase) {
      const { usd, attributed } = revenueUsdForPurchase(row, sorted);
      vRev += usd;
      if (!attributed) vNoRev++;
    }
  }

  return {
    controlImpressions: ci,
    variantImpressions: vi,
    controlClicks: cc,
    variantClicks: vc,
    controlPurchases: cp,
    variantPurchases: vp,
    controlRevenueUsd: cRev,
    variantRevenueUsd: vRev,
    controlPurchasesWithoutRevenue: cNoRev,
    variantPurchasesWithoutRevenue: vNoRev,
    controlCtr: rate(cc, ci),
    variantCtr: rate(vc, vi),
    controlClickToPurchase: rate(cp, cc),
    variantClickToPurchase: rate(vp, vc),
    controlImpressionToPurchase: rate(cp, ci),
    variantImpressionToPurchase: rate(vp, vi),
    controlRpi: rate(cRev, ci),
    variantRpi: rate(vRev, vi),
  };
}

export function formatPct(fraction: number | null): string {
  if (fraction == null) return "—";
  if (!Number.isFinite(fraction)) return "—";
  return `${Math.round(fraction * 10_000) / 100}%`;
}

export function formatUsd5(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}
