import { describe, expect, it } from "vitest";
import {
  computeStarterProRefineExperimentStats,
  formatPct,
  STARTER_PRO_REFINE_EXPERIMENT_EVENTS,
} from "./starterProRefineExperimentStats";
import type { PersistedProductEvent } from "./growthEventPersistence";

function ev(name: string, ts: number, payload?: Record<string, unknown>): PersistedProductEvent {
  return { name, ts, payload };
}

describe("computeStarterProRefineExperimentStats", () => {
  it("counts by event name and derives rates", () => {
    const e = STARTER_PRO_REFINE_EXPERIMENT_EVENTS;
    const events: PersistedProductEvent[] = [
      ev(e.controlImpression, 1, { session_id: "a" }),
      ev(e.controlClick, 2, { session_id: "a" }),
      ev(e.variantImpression, 1, { session_id: "b" }),
      ev(e.variantClick, 2, { session_id: "b" }),
      ev(e.controlPurchase, 100, { session_id: "a" }),
    ];
    const s = computeStarterProRefineExperimentStats(events);
    expect(s.controlImpressions).toBe(1);
    expect(s.controlClicks).toBe(1);
    expect(s.controlPurchases).toBe(1);
    expect(s.variantImpressions).toBe(1);
    expect(s.variantClicks).toBe(1);
    expect(s.variantPurchases).toBe(0);
    expect(s.controlCtr).toBe(1);
    expect(s.controlClickToPurchase).toBe(1);
    expect(s.controlImpressionToPurchase).toBe(1);
  });

  it("joins paywall_revenue_attributed before purchase in same session", () => {
    const e = STARTER_PRO_REFINE_EXPERIMENT_EVENTS;
    const events: PersistedProductEvent[] = [
      ev(e.controlImpression, 1, { session_id: "x" }),
      ev("paywall_revenue_attributed", 99, { session_id: "x", revenue_usd: 42 }),
      ev(e.controlPurchase, 100, { session_id: "x" }),
    ];
    const s = computeStarterProRefineExperimentStats(events);
    expect(s.controlRevenueUsd).toBe(42);
    expect(s.controlRpi).toBe(42);
    expect(s.controlPurchasesWithoutRevenue).toBe(0);
  });

  it("attribute variant purchase revenue to variant RPI", () => {
    const e = STARTER_PRO_REFINE_EXPERIMENT_EVENTS;
    const events: PersistedProductEvent[] = [
      ev(e.variantImpression, 10, { session_id: "v" }),
      ev("paywall_revenue_attributed", 20, { session_id: "v", revenue_usd: 5 }),
      ev(e.variantPurchase, 21, { session_id: "v" }),
    ];
    const s = computeStarterProRefineExperimentStats(events);
    expect(s.variantRevenueUsd).toBe(5);
    expect(s.variantRpi).toBe(5);
  });

  it("increments purchases without revenue when no paywall row in window", () => {
    const e = STARTER_PRO_REFINE_EXPERIMENT_EVENTS;
    const s = computeStarterProRefineExperimentStats([
      ev(e.controlPurchase, 1_000, { session_id: "a" }),
    ]);
    expect(s.controlPurchasesWithoutRevenue).toBe(1);
    expect(s.controlRevenueUsd).toBe(0);
  });
});

describe("formatPct", () => {
  it("formats or dashes on null", () => {
    expect(formatPct(0.125)).toBe("12.5%");
    expect(formatPct(null)).toBe("—");
  });
});
