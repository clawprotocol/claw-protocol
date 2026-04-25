import { describe, expect, it } from "vitest";
import type { PersistedProductEvent } from "./growthEventPersistence";
import {
  computeBiggestStepDropOff,
  computeLiveFunnelCounts,
  computePaywallSummary,
  formatDailySnapshotLine,
} from "./growthMetricsAggregate";

describe("growthMetricsAggregate", () => {
  it("picks largest consecutive step drop for snapshot line", () => {
    const events: PersistedProductEvent[] = [
      { name: "step_completed", ts: 1, payload: { step_number: 1, session_id: "a" } },
      { name: "step_completed", ts: 2, payload: { step_number: 1, session_id: "b" } },
      { name: "step_completed", ts: 3, payload: { step_number: 1, session_id: "c" } },
      { name: "step_completed", ts: 4, payload: { step_number: 2, session_id: "a" } },
      { name: "step_completed", ts: 5, payload: { step_number: 2, session_id: "b" } },
    ];
    const drop = computeBiggestStepDropOff(events);
    expect(drop).not.toBeNull();
    expect(drop!.fromStep).toBe(1);
    expect(drop!.toStep).toBe(2);
    const line = formatDailySnapshotLine(events, { 2: "Step 2 (scope)" });
    expect(line).toContain("Step 2 (scope)");
    expect(line).toMatch(/\d+%/);
  });

  it("computeLiveFunnelCounts uses unique sessions per stage", () => {
    const sid = "sess-1";
    const events: PersistedProductEvent[] = [
      { name: "landing_view", ts: 1, payload: { session_id: sid } },
      { name: "step_completed", ts: 2, payload: { session_id: sid, step_number: 1 } },
      { name: "step_completed", ts: 3, payload: { session_id: sid, step_number: 2 } },
      { name: "ready_state_reached", ts: 4, payload: { session_id: sid } },
      { name: "agreement_generated", ts: 5, payload: { session_id: sid } },
    ];
    const c = computeLiveFunnelCounts(events);
    expect(c.landing).toBe(1);
    expect(c.step1).toBe(1);
    expect(c.step2).toBe(1);
    expect(c.ready).toBe(1);
    expect(c.generate).toBe(1);
  });

  it("computePaywallSummary derives session rates", () => {
    const sid = "s-pay";
    const events: PersistedProductEvent[] = [
      { name: "paywall_shown", ts: 1, payload: { session_id: sid } },
      { name: "upgrade_clicked", ts: 2, payload: { session_id: sid } },
      { name: "unlock_completed", ts: 3, payload: { session_id: "other" } },
    ];
    const p = computePaywallSummary(events);
    expect(p.paywall_shown).toBe(1);
    expect(p.upgrade_clicked).toBe(1);
    expect(p.subscription_session_rate_pct).toBe(100);
    expect(p.one_time_session_rate_pct).toBe(0);
  });
});
