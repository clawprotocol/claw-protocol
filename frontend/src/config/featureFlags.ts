/**
 * Launch scope gating — env-overridable for production without deleting code paths.
 * New gates & dynamic UI: see `CONTROL_PLANE.md`, `config/featureFlags/useFeatureGate`,
 * `config/dynamicConfig/`, `config/experiments/`, `lib/runtimeConfig/`, `lib/experimentation/`.
 *
 * VITE_CLAW_FEATURE_* = "0" | "1"
 *
 * Central map (keep in sync with UI):
 * - PUBLIC_FEED → /feed marketing (default off; /feed redirects home when off)
 * - NEGOTIATION_TIMELINE → agreement negotiation timeline panels
 * - ANALYST → legal analyst surfaces (default off)
 * - AFFILIATE_ADMIN → referral / affiliate admin (default off)
 * - OPS_GROWTH → internal /app/ops/growth funnel dashboard (default off)
 * - ADMIN_CONSOLE → `/app/admin` operator API console (default off; enable only on internal/staging builds)
 * - PRODUCT_EVENTS_INGEST → POST copies of product events to /api/product-events (default off; stub)
 * - SERVER_BILLING → GET /v1/orgs/…/keys and subscriptions (default on)
 * - SIMPLE_SEND_PAYWALL → review → ready-to-send bridge before live send/payment (default on)
 * - BYPASS_SIMPLE_SEND_PAYWALL → QA: skip gate (default off)
 * - SEND_PAYMENT_REQUESTS → optional attach-payment UI on simple send (default off until wired end-to-end)
 * - TRIAL_CHECKOUT → conversion CTA emphasizes trial (default off)
 */
function getFlag(key: string, defaultOn: boolean): boolean {
  try {
    const raw = (import.meta.env as Record<string, string | undefined>)[key];
    if (raw === undefined || raw === "") return defaultOn;
    return raw.trim() !== "0" && raw.toLowerCase() !== "false" && raw.toLowerCase() !== "no";
  } catch {
    return defaultOn;
  }
}

export const featureFlags = {
  /** Public /feed marketing surface */
  publicFeed: getFlag("VITE_CLAW_FEATURE_PUBLIC_FEED", false),
  /** Negotiation timeline panels inside VS01 / agreements */
  negotiationTimelineUi: getFlag("VITE_CLAW_FEATURE_NEGOTIATION_TIMELINE", false),
  /** Legal analyst surfaces */
  analystUi: getFlag("VITE_CLAW_FEATURE_ANALYST", false),
  /** Affiliate admin / referral dashboards */
  affiliateAdminUi: getFlag("VITE_CLAW_FEATURE_AFFILIATE_ADMIN", false),
  /** Internal operator dashboard: funnel, experiments, share metrics (local persistence). */
  opsGrowthDashboard: getFlag("VITE_CLAW_FEATURE_OPS_GROWTH", false),
  /**
   * `/app/admin` (aliases: `/founder`, `/admin`, `/app/founder`) — x-claw-admin-secret console.
   * Off by default on generic customer builds; enabled on lawdog.me / lawdog.ai (server auth required)
   * or when `VITE_CLAW_FEATURE_ADMIN_CONSOLE=1` / `VITE_LAWDOG_QA_PAYMENT_BYPASS=1` on internal hosts.
   */
  adminConsoleUi: getFlag("VITE_CLAW_FEATURE_ADMIN_CONSOLE", false),
  /** Backend-backed billing & keys (vs local-only tier demo) */
  serverBilling: getFlag("VITE_CLAW_FEATURE_SERVER_BILLING", true),
  /**
   * Simple flow: gate live send (links, payment attach, outbound send) behind an upgrade bridge.
   * Off = prior behavior (review → send on the same screen without a conversion step).
   */
  simpleFlowSendPaywall: getFlag("VITE_CLAW_FEATURE_SIMPLE_SEND_PAYWALL", true),
  /** Dev/QA: treat send actions as unlocked without checkout (does not disable the bridge UI route). */
  simpleFlowPaywallBypass: getFlag("VITE_CLAW_BYPASS_SIMPLE_SEND_PAYWALL", false),
  /** Conversion copy: primary CTA emphasizes free trial vs one-click unlock. */
  trialCheckoutCopy: getFlag("VITE_CLAW_FEATURE_TRIAL_CHECKOUT", false),
  /**
   * Send modal paywall A/B (`send_conversion_paywall`). When off, variant is always `control`.
   * Disable other paywall-adjacent experiments in experiments/registry while this is on.
   */
  sendConversionPaywallExperiment: getFlag("VITE_CLAW_EXPERIMENT_SEND_PAYWALL", true),
  /** Optional: forward each product event to same-origin /api/product-events (non-blocking). */
  productEventsIngestApi: getFlag("VITE_CLAW_FEATURE_PRODUCT_EVENTS_INGEST", false),
  /**
   * Simple send: “Attach payment” / optional payment-request UI. Off by default — enable only when invoice/payment UX is fully wired.
   */
  sendPaymentRequestsUi: getFlag("VITE_CLAW_FEATURE_SEND_PAYMENT_REQUESTS", false),
} as const;
