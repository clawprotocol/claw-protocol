import type { PersistedProductEvent } from "./growthEventPersistence";

/** Events the growth dashboard panels assume for meaningful local QA. */
export const GROWTH_FUNNEL_SIGNAL_EVENT_NAMES = [
  "landing_view",
  "step_completed",
  "ready_state_reached",
  "agreement_generated",
] as const;

export type GrowthDashboardDiagnostic =
  | { kind: "ok" }
  | { kind: "no_events" }
  | { kind: "no_events_for_day" }
  | { kind: "missing_funnel_signals"; missing: readonly string[] };

export function computeGrowthDashboardDiagnostics(
  allEvents: PersistedProductEvent[],
  dayEvents: PersistedProductEvent[],
): GrowthDashboardDiagnostic {
  if (allEvents.length === 0) return { kind: "no_events" };
  if (dayEvents.length === 0) return { kind: "no_events_for_day" };

  const missing: string[] = [];
  for (const name of GROWTH_FUNNEL_SIGNAL_EVENT_NAMES) {
    const has = dayEvents.some((e) => e.name === name);
    if (!has) missing.push(name);
  }
  if (missing.length > 0) {
    return { kind: "missing_funnel_signals", missing };
  }
  return { kind: "ok" };
}
