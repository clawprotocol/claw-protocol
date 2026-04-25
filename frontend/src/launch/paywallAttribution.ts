/**
 * Hands off paywall experiment + view id to checkout for revenue attribution.
 * Not used for public pricing copy.
 */

import { SEND_CONVERSION_PAYWALL_EXPERIMENT_KEY } from "./paywallExperiment";

export const PAYWALL_ATTRIBUTION_STORAGE_KEY = "claw_paywall_attribution_v1";

export type PaywallAttributionPayload = {
  paywallViewId: string;
  paywall_experiment_key: string;
  paywall_variant: string;
  agreementId: string;
  viewedAtMs: number;
  /** Flat dimension keys for dashboards (e.g. headline_frame, cta_copy). */
  paywall_dim?: Record<string, string>;
};

export function stashPaywallAttribution(payload: PaywallAttributionPayload): void {
  try {
    sessionStorage.setItem(PAYWALL_ATTRIBUTION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readPaywallAttribution(): PaywallAttributionPayload | null {
  try {
    const raw = sessionStorage.getItem(PAYWALL_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PaywallAttributionPayload;
    if (!p?.agreementId || !p?.paywallViewId) return null;
    return p;
  } catch {
    return null;
  }
}

export function paywallAttributionForAgreement(agreementId: string): PaywallAttributionPayload | null {
  const p = readPaywallAttribution();
  if (!p || p.agreementId !== agreementId) return null;
  return p;
}

export function clearPaywallAttribution(): void {
  try {
    sessionStorage.removeItem(PAYWALL_ATTRIBUTION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Merge into product event payloads for checkout. Does not expose usage unit pricing. */
export function checkoutPayloadFromPaywallAttribution(
  agreementId: string,
): Record<string, string | number | Record<string, string> | undefined> {
  const p = paywallAttributionForAgreement(agreementId);
  if (!p) return {};
  return {
    paywall_view_id: p.paywallViewId,
    paywall_experiment_key: p.paywall_experiment_key ?? SEND_CONVERSION_PAYWALL_EXPERIMENT_KEY,
    paywall_variant: p.paywall_variant,
    ...(p.paywall_dim ? { paywall_dim: p.paywall_dim } : {}),
  };
}
