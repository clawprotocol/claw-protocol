/**
 * Canonical product analytics event shape for future server ingestion.
 * Keep in sync with `docs/ops/PRODUCT_EVENTS_INGESTION_STUB.md` (backend contract).
 */

import type { PersistedProductEvent } from "./growthEventPersistence";

/** Shared frontend ↔ backend contract (JSON-serializable). */
export type AnalyticsProductEventPayload = {
  event_name: string;
  session_id: string;
  anonymous_user_id: string | null;
  event_ts_ms: number;
  surface: string | null;
  experiment: string | null;
  variant: string | null;
  agreement_type: string | null;
  step_number: number | null;
  revenue_usd: number | null;
  /** Remaining envelope fields (flow, step, agreementId, paywall_*, etc.). */
  metadata: Record<string, unknown>;
};

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

const METADATA_EXCLUDE = new Set([
  "session_id",
  "lawdog_session_id",
  "surface",
  "paywall_experiment_key",
  "experiment_id",
  "experiment",
  "paywall_variant",
  "variant_id",
  "variant",
  "agreement_type",
  "step_number",
  "revenue_usd",
  "revenue_per_paywall_view_usd",
  "anonymous_user_id",
  "identity_email",
]);

/**
 * Normalizes a persisted browser event into the canonical analytics payload.
 * Safe for POST /api/product-events when the endpoint exists.
 */
export function persistedEventToAnalyticsPayload(ev: PersistedProductEvent): AnalyticsProductEventPayload {
  const p = ev.payload ?? {};
  const sessionId = strOrNull(p.session_id) ?? strOrNull(p.lawdog_session_id) ?? "";

  const experiment =
    strOrNull(p.paywall_experiment_key) ??
    strOrNull(p.experiment_id) ??
    (typeof p.experiment === "string" ? strOrNull(p.experiment) : null);
  const variant =
    strOrNull(p.paywall_variant) ??
    strOrNull(p.variant_id) ??
    (typeof p.variant === "string" ? strOrNull(p.variant) : null);

  const metadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (!METADATA_EXCLUDE.has(k)) metadata[k] = v;
  }

  return {
    event_name: ev.name,
    session_id: sessionId,
    anonymous_user_id: strOrNull(p.anonymous_user_id),
    event_ts_ms: ev.ts,
    surface: strOrNull(p.surface),
    experiment,
    variant,
    agreement_type: strOrNull(p.agreement_type),
    step_number: numOrNull(p.step_number),
    revenue_usd: numOrNull(p.revenue_usd) ?? numOrNull(p.revenue_per_paywall_view_usd),
    metadata,
  };
}
