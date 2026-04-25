/**
 * Persists product analytics rows locally for operator dashboards (browser-only).
 * Ring buffer — does not replace server-side telemetry.
 */

export const GROWTH_EVENTS_LOCAL_STORAGE_KEY = "claw_growth_events_v1";
const MAX_EVENTS = 4000;

export type PersistedProductEvent = {
  name: string;
  ts: number;
  payload?: Record<string, unknown>;
};

function readRaw(): PersistedProductEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GROWTH_EVENTS_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is PersistedProductEvent =>
        x != null &&
        typeof x === "object" &&
        typeof (x as PersistedProductEvent).name === "string" &&
        typeof (x as PersistedProductEvent).ts === "number",
    );
  } catch {
    return [];
  }
}

function writeRaw(rows: PersistedProductEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = rows.length > MAX_EVENTS ? rows.slice(rows.length - MAX_EVENTS) : rows;
    window.localStorage.setItem(GROWTH_EVENTS_LOCAL_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota */
  }
}

export function appendGrowthEvent(row: PersistedProductEvent): void {
  const cur = readRaw();
  cur.push(row);
  writeRaw(cur);
}

export function loadPersistedGrowthEvents(): PersistedProductEvent[] {
  return readRaw();
}

/** Clears operator / QA persisted growth events (same storage key as production-local testing). */
export function clearPersistedGrowthEvents(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GROWTH_EVENTS_LOCAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** @deprecated Use {@link clearPersistedGrowthEvents} */
export function clearPersistedGrowthEventsForTests(): void {
  clearPersistedGrowthEvents();
}
