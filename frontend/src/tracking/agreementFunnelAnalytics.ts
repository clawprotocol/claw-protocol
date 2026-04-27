/**
 * Lightweight, privacy-safe agreement funnel events (no document / intake text).
 * Merges device, viewport, session, plan tier, and optional timing from landing.
 * Forwards to PostHog when `window.posthog.capture` is present; otherwise no-op.
 */
import { getOrCreateLawdogSessionId } from "./lawdogSession";
import { logProductEvent, type ProductEventName } from "../lib/experimentation/productEvents";

const LANDING_MS_KEY = "lawdog_agreement_funnel_landing_ms_v1";

export type AgreementFunnelEventName =
  | "landing_view"
  | "first_input_started"
  | "free_draft_generated"
  | "premium_upgrade_clicked"
  | "checkout_success_returned"
  | "pro_draft_loaded"
  | "continue_to_recipient_setup"
  | "review_link_created"
  | "signing_link_created"
  | "recipient_opened_link"
  | "recipient_submitted_edits"
  | "owner_applied_edits"
  | "signature_flow_started"
  | "agreement_completed";

export function getFunnelDeviceType(): "mobile" | "desktop" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "desktop";
  try {
    return window.matchMedia("(max-width: 1023px)").matches ? "mobile" : "desktop";
  } catch {
    return "desktop";
  }
}

export function getFunnelViewportBucket(): "xs" | "sm" | "md" | "lg" | "xl" | "unknown" {
  if (typeof window === "undefined") return "unknown";
  const w = window.innerWidth;
  if (w < 480) return "xs";
  if (w < 640) return "sm";
  if (w < 1024) return "md";
  if (w < 1280) return "lg";
  return "xl";
}

export function markAgreementFunnelLandingT0IfUnset(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(LANDING_MS_KEY)) return;
    window.sessionStorage.setItem(LANDING_MS_KEY, String(Date.now()));
  } catch {
    /* quota / private mode */
  }
}

export function readAgreementFunnelLandingT0Ms(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(LANDING_MS_KEY);
    if (v == null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function getAgreementFunnelContextProps(opts?: {
  planTier?: string | null;
  atMsProDraft?: number;
  atMsLink?: number;
}): Record<string, unknown> {
  const plan_tier = opts?.planTier != null && String(opts.planTier).trim() ? String(opts.planTier) : "unknown";
  const base: Record<string, unknown> = {
    device: getFunnelDeviceType(),
    viewport_bucket: getFunnelViewportBucket(),
    plan_tier,
  };
  if (typeof window !== "undefined") {
    base.session_id = getOrCreateLawdogSessionId();
  } else {
    base.session_id = "ssr";
  }
  const t0 = readAgreementFunnelLandingT0Ms();
  if (t0 != null) {
    if (typeof opts?.atMsProDraft === "number" && Number.isFinite(opts.atMsProDraft)) {
      base.time_to_pro_draft_ms = Math.max(0, Math.round(opts.atMsProDraft - t0));
    }
    if (typeof opts?.atMsLink === "number" && Number.isFinite(opts.atMsLink)) {
      base.time_to_link_created_ms = Math.max(0, Math.round(opts.atMsLink - t0));
    }
  }
  return base;
}

/** Optional `window.posthog` mirror — no-op if unavailable. */
export function captureToPostHogIfAvailable(name: string, payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const ph = (window as Window & { posthog?: { capture?: (n: string, p?: Record<string, unknown>) => void } }).posthog;
  if (!ph?.capture) return;
  try {
    ph.capture(name, payload);
  } catch {
    /* optional analytics */
  }
}

/**
 * Canonical funnel event: envelope fields + `extra` + optional timing relative to first landing in tab.
 * Safe if PostHog (or the network) is unavailable; never includes agreement body text.
 */
export function trackAgreementFunnelEvent(
  name: AgreementFunnelEventName,
  extra?: Record<string, unknown>,
  options?: { planTier?: string | null; atMsProDraft?: number; atMsLink?: number; agreementId?: string },
): void {
  const now = Date.now();
  let atPro: number | undefined;
  if (name === "pro_draft_loaded") {
    atPro = typeof options?.atMsProDraft === "number" && Number.isFinite(options.atMsProDraft) ? options.atMsProDraft : now;
  }
  let atLink: number | undefined;
  if (name === "review_link_created" || name === "signing_link_created") {
    atLink = typeof options?.atMsLink === "number" && Number.isFinite(options.atMsLink) ? options.atMsLink : now;
  }
  const env = getAgreementFunnelContextProps({
    planTier: options?.planTier,
    atMsProDraft: atPro,
    atMsLink: atLink,
  });
  const id = (options?.agreementId || "").trim();
  const payload: Record<string, unknown> = { ...env, ...extra, ...(id ? { agreementId: id } : {}) };
  logProductEvent(name as ProductEventName, payload);
  captureToPostHogIfAvailable(name, payload);
}
