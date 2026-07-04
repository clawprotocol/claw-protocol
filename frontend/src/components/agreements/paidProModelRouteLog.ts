/**
 * Safe client diagnostic for paid Pro generator route / model (no secrets).
 */

import type { PremiumGenerationCallReason } from "./paidProPremiumGenerationCallAudit";

export type PaidProModelRouteLogPayload = {
  route: string;
  model: string;
  tier: string;
  source: string;
  generationOutcome?: string | null;
  serverFullLen?: number;
  documentLen?: number;
  callReason?: PremiumGenerationCallReason | string | null;
};

export function buildPaidProModelRouteLogPayload(
  payload: PaidProModelRouteLogPayload,
): Record<string, unknown> {
  return {
    route: payload.route,
    model: payload.model || "premium_unresolved",
    tier: payload.tier,
    source: payload.source,
    generationOutcome: payload.generationOutcome ?? null,
    serverFullLen: payload.serverFullLen ?? 0,
    documentLen: payload.documentLen ?? 0,
    callReason: payload.callReason ?? null,
  };
}

export function logPaidProModelRoute(payload: PaidProModelRouteLogPayload): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-model-route]", buildPaidProModelRouteLogPayload(payload));
}
