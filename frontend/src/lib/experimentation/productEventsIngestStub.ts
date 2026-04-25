/**
 * Optional forwarder to a future `/api/product-events` ingestion endpoint.
 * Disabled unless `VITE_CLAW_FEATURE_PRODUCT_EVENTS_INGEST=1` — see
 * `docs/ops/PRODUCT_EVENTS_INGESTION_STUB.md`.
 */

import { featureFlags } from "../../config/featureFlags";
import type { ProductEventRow } from "./productEvents";
import { persistedEventToAnalyticsPayload } from "./analyticsProductEvent";

export const PRODUCT_EVENTS_INGEST_PATH = "/api/product-events";

export async function maybeForwardProductEventToBackend(row: ProductEventRow): Promise<void> {
  if (!featureFlags.productEventsIngestApi) return;
  if (typeof window === "undefined") return;
  const body = persistedEventToAnalyticsPayload(row);
  try {
    await fetch(`${window.location.origin}${PRODUCT_EVENTS_INGEST_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    /* non-blocking; local persistence remains source of truth */
  }
}
