import { logProductEvent } from "../lib/experimentation/productEvents";
import { paywallCopyForTrigger } from "./paywallMessaging";

/** Keys safe to log on `paywall_triggered` — never forward arbitrary API error bodies or user text. */
const PAYWALL_ANALYTICS_KEYS = new Set(["code", "surface", "reason", "agreementId"]);

/**
 * Single entry point when the product must drive upgrade (mirrors backend `paywall_triggered` analytics).
 * Listeners (e.g. SimpleSendPage) can subscribe to `claw:paywall-required` on `window`.
 * Event detail includes paywallHeadline + paywallSub for consistent modal copy.
 */
export function triggerPaywall(payload?: Record<string, unknown>): void {
  const base = payload ?? {};
  const { headline, sub } = paywallCopyForTrigger(base);
  const detail = { ...base, paywallHeadline: headline, paywallSub: sub };
  const analyticsPayload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
    if (PAYWALL_ANALYTICS_KEYS.has(k)) analyticsPayload[k] = v;
  }
  logProductEvent("paywall_triggered", analyticsPayload);
  window.dispatchEvent(new CustomEvent("claw:paywall-required", { detail }));
}
