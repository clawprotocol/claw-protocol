import { describe, expect, it } from "vitest";
import { persistedEventToAnalyticsPayload } from "./analyticsProductEvent";
import { computeGrowthDashboardDiagnostics } from "./growthDashboardDiagnostics";
import type { PersistedProductEvent } from "./growthEventPersistence";

describe("analyticsProductEvent", () => {
  it("maps persisted row to canonical payload", () => {
    const ev: PersistedProductEvent = {
      name: "paywall_shown",
      ts: 1_700_000_000_000,
      payload: {
        session_id: "sid-1",
        surface: "post_generation_send",
        paywall_experiment_key: "send_conversion_paywall",
        paywall_variant: "control",
        flow: "agreement",
      },
    };
    const o = persistedEventToAnalyticsPayload(ev);
    expect(o.event_name).toBe("paywall_shown");
    expect(o.session_id).toBe("sid-1");
    expect(o.surface).toBe("post_generation_send");
    expect(o.experiment).toBe("send_conversion_paywall");
    expect(o.variant).toBe("control");
    expect(o.metadata.flow).toBe("agreement");
  });
});

describe("growthDashboardDiagnostics", () => {
  it("detects no events", () => {
    expect(computeGrowthDashboardDiagnostics([], []).kind).toBe("no_events");
  });

  it("detects no events for selected day", () => {
    const all: PersistedProductEvent[] = [{ name: "landing_view", ts: Date.UTC(2024, 0, 1, 12), payload: {} }];
    expect(computeGrowthDashboardDiagnostics(all, []).kind).toBe("no_events_for_day");
  });

  it("flags missing funnel signals", () => {
    const day: PersistedProductEvent[] = [{ name: "pricing_viewed", ts: Date.now(), payload: {} }];
    const d = computeGrowthDashboardDiagnostics(day, day);
    expect(d.kind).toBe("missing_funnel_signals");
    if (d.kind === "missing_funnel_signals") {
      expect(d.missing.length).toBeGreaterThan(0);
    }
  });
});
