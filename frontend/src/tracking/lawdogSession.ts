/**
 * Trust-aligned session context for product analytics.
 *
 * - One persistent browser session id (`lawdog_session_id`) — no canvas/device fingerprinting.
 * - Funnel `flow` + `step` mirror high-level product surfaces (not invasive profiling).
 * - `traffic_source` from optional `?src=` on the URL (e.g. csn, doginal); defaults to `direct`.
 * - Optional `referral_source` when the first in-app landing path is an agreement deep link
 *   (`agreement_link`) or an affiliate / Doginal landing page (`affiliate_page`); omitted until set.
 * - Optional creator/account identity email is stored locally for UX hints only; analytics envelopes
 *   intentionally do not include the raw email.
 */

import { parseAffiliateLandingPath } from "../launch/affiliate/affiliateLandingRoutes";
import { matchAppPath } from "../launch/routes";

export const LAWDOG_SESSION_ID_KEY = "lawdog_session_id";
const LAWDOG_SESSION_STATE_KEY = "lawdog_session_state_v1";
const LAWDOG_DASHBOARD_VISIT_COUNT_KEY = "lawdog_dashboard_visit_count";

export type LawdogProductFlow = "esign" | "agreement";

export type LawdogSessionStateV1 = {
  /** Product funnel: e-sign path vs agreement workspace path. */
  flow: LawdogProductFlow;
  /** Coarse funnel position for analytics (homepage, create, …). */
  step: string;
  /** ISO timestamps when each step key was first entered this session. */
  step_timestamps: Record<string, string>;
  /** Agreements created in this browser session (client-side counter; server enforces limits). */
  agreements_created_session: number;
  /** Recent agreement_created event times (ms) for light abuse UX nudges. */
  recent_agreement_create_ms: number[];
  /** User-supplied email (normalized); never derived from fingerprinting. */
  identity_email: string | null;
  /** Latest claim card impression (for time_to_claim on click). */
  claim_view_record_id: string | null;
  claim_view_started_ms: number | null;
  /** User completed claim handoff to auth (email/google). */
  signup_completed_via_claim: boolean;
  /** User chose “keep going” on the claim card — suppress return-save banner. */
  claim_keep_going_chosen: boolean;
  /**
   * Campaign / traffic label from `?src=` on first or later navigations; persists until overwritten.
   * Default when never set: `"direct"` (see {@link getLawdogTrafficSource}).
   */
  traffic_source: string;
  /**
   * Set when the session lands on an agreement-related deep link (see
   * {@link syncLawdogReferralSourceFromPathname}); same normalization rules as traffic labels.
   */
  referral_source: string | null;
};

const STEP_KEYS = new Set([
  "homepage",
  "marketing",
  "create",
  "review_send",
  "done",
  "verification",
  "claim",
  "signup",
  "workspace",
  "billing",
  "other",
]);

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function defaultState(): LawdogSessionStateV1 {
  return {
    flow: "agreement",
    step: "other",
    step_timestamps: {},
    agreements_created_session: 0,
    recent_agreement_create_ms: [],
    identity_email: null,
    claim_view_record_id: null,
    claim_view_started_ms: null,
    signup_completed_via_claim: false,
    claim_keep_going_chosen: false,
    traffic_source: "direct",
    referral_source: null,
  };
}

const TRAFFIC_SOURCE_MAX_LEN = 64;

/** Normalize `?src=` for storage; returns `null` if missing or unsafe (no hidden IDs — label only). */
export function normalizeTrafficSourceParam(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s.length > TRAFFIC_SOURCE_MAX_LEN) return null;
  if (!/^[a-z0-9_-]+$/.test(s)) return null;
  return s;
}

/**
 * Read `src` from a query string (e.g. `window.location.search`). If valid, persist `traffic_source`.
 * If the URL has no `src`, existing session value is kept (persist across navigation).
 */
export function syncLawdogTrafficSourceFromSearch(search: string): void {
  if (typeof window === "undefined") return;
  const raw = (search || "").startsWith("?") ? search.slice(1) : search.replace(/^\?/, "");
  const src = normalizeTrafficSourceParam(new URLSearchParams(raw).get("src"));
  if (!src) return;
  const st = readLawdogSessionState();
  if (st.traffic_source === src) return;
  writeLawdogSessionState({ ...st, traffic_source: src });
}

/** Resolved label for analytics — always at least `"direct"`. */
export function getLawdogTrafficSource(): string {
  const v = readLawdogSessionState().traffic_source;
  return normalizeTrafficSourceParam(v) ?? "direct";
}

/** High-intent CSN campaign traffic (`?src=csn`). */
export function isLawdogCsnTraffic(): boolean {
  return getLawdogTrafficSource() === "csn";
}

const AGREEMENT_LINK_REFERRAL = "agreement_link";
const AFFILIATE_PAGE_REFERRAL = "affiliate_page";

/**
 * First landing on an agreement deep link sets `referral_source` for the session (sticky).
 * Does not overwrite a value already set (e.g. first touch wins).
 */
export function syncLawdogReferralSourceFromPathname(pathname: string): void {
  if (typeof window === "undefined") return;
  const st = readLawdogSessionState();
  if (st.referral_source) return;

  const p = (pathname || "/").split("?")[0];
  const m = matchAppPath(p);
  if (!m) return;

  let isAgreementDeepLink = false;
  if (m.kind === "agreements" && typeof m.sub === "object" && "id" in m.sub) {
    isAgreementDeepLink = true;
  } else if (
    m.kind === "simpleReady" ||
    m.kind === "simpleSend" ||
    m.kind === "simpleDone" ||
    m.kind === "simpleVerification" ||
    m.kind === "simpleCheckout"
  ) {
    isAgreementDeepLink = true;
  } else if (m.kind === "esign" && typeof m.sub === "object" && "id" in m.sub) {
    isAgreementDeepLink = true;
  }

  if (!isAgreementDeepLink) return;

  const normalized = normalizeTrafficSourceParam(AGREEMENT_LINK_REFERRAL);
  if (!normalized) return;
  writeLawdogSessionState({ ...st, referral_source: normalized });
}

/**
 * First visit to `/@{username}` or `/doginal/{username}` sets `referral_source` to `affiliate_page`.
 * First touch wins (see {@link syncLawdogReferralSourceFromPathname}).
 */
export function syncLawdogReferralSourceFromAffiliateLanding(pathname: string): void {
  if (typeof window === "undefined") return;
  const st = readLawdogSessionState();
  if (st.referral_source) return;
  const p = (pathname || "/").split("?")[0].split("#")[0];
  if (!parseAffiliateLandingPath(p)) return;
  const normalized = normalizeTrafficSourceParam(AFFILIATE_PAGE_REFERRAL);
  if (!normalized) return;
  writeLawdogSessionState({ ...st, referral_source: normalized });
}

/** Programmatic referral label, or `null` if never set. */
export function getLawdogReferralSource(): string | null {
  return normalizeTrafficSourceParam(readLawdogSessionState().referral_source);
}

export function readLawdogSessionState(): LawdogSessionStateV1 {
  if (typeof window === "undefined") return defaultState();
  try {
    const parsed = safeJsonParse<LawdogSessionStateV1>(window.localStorage.getItem(LAWDOG_SESSION_STATE_KEY));
    if (!parsed || typeof parsed !== "object") return defaultState();
    return {
      ...defaultState(),
      ...parsed,
      step_timestamps: typeof parsed.step_timestamps === "object" && parsed.step_timestamps ? parsed.step_timestamps : {},
      recent_agreement_create_ms: Array.isArray(parsed.recent_agreement_create_ms)
        ? parsed.recent_agreement_create_ms.filter((n) => typeof n === "number")
        : [],
      claim_view_record_id:
        typeof parsed.claim_view_record_id === "string" ? parsed.claim_view_record_id : defaultState().claim_view_record_id,
      claim_view_started_ms:
        typeof parsed.claim_view_started_ms === "number" ? parsed.claim_view_started_ms : defaultState().claim_view_started_ms,
      signup_completed_via_claim: Boolean(parsed.signup_completed_via_claim),
      claim_keep_going_chosen: Boolean(parsed.claim_keep_going_chosen),
      traffic_source:
        typeof parsed.traffic_source === "string"
          ? normalizeTrafficSourceParam(parsed.traffic_source) ?? "direct"
          : "direct",
      referral_source:
        typeof parsed.referral_source === "string"
          ? normalizeTrafficSourceParam(parsed.referral_source)
          : null,
    };
  } catch {
    return defaultState();
  }
}

function writeLawdogSessionState(next: LawdogSessionStateV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAWDOG_SESSION_STATE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

/** UUID v4 persisted for the lifetime of this browser profile (cleared if user clears site data). */
export function getOrCreateLawdogSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.localStorage.getItem(LAWDOG_SESSION_ID_KEY);
    if (id && id.trim()) return id.trim();
    id = crypto.randomUUID();
    window.localStorage.setItem(LAWDOG_SESSION_ID_KEY, id);
    return id;
  } catch {
    return `lawdog_sess_${Date.now()}`;
  }
}

function touchStepTimestamp(st: LawdogSessionStateV1, stepKey: string): LawdogSessionStateV1 {
  const iso = new Date().toISOString();
  const nextTs = { ...st.step_timestamps };
  if (!nextTs[stepKey]) nextTs[stepKey] = iso;
  return { ...st, step_timestamps: nextTs };
}

/** Set funnel flow and step (records first-seen timestamp per step key). */
export function setLawdogFlowStep(flow: LawdogProductFlow, step: string): void {
  const st = readLawdogSessionState();
  const sk = STEP_KEYS.has(step) ? step : "other";
  const next = touchStepTimestamp({ ...st, flow, step: sk }, sk);
  writeLawdogSessionState(next);
}

/**
 * Derive flow/step from the current in-app URL. Safe to call on every navigation tick.
 * Non-`/app` URLs are treated as marketing/homepage surfaces.
 */
export function syncLawdogFlowFromPathname(pathname: string): void {
  const p = (pathname || "/").split("?")[0];
  if (!p.startsWith("/app")) {
    setLawdogFlowStep("agreement", "homepage");
    return;
  }
  const m = matchAppPath(p);
  if (!m) {
    setLawdogFlowStep("agreement", "other");
    return;
  }
  const flow: LawdogProductFlow = m.kind === "esign" ? "esign" : "agreement";
  let step: string = "workspace";
  switch (m.kind) {
    case "simpleCreate":
      step = "create";
      break;
    case "esign":
      step = m.sub === "new" ? "create" : "workspace";
      break;
    case "agreements":
      step = m.sub === "new" ? "create" : "workspace";
      break;
    case "simpleReady":
    case "simpleSend":
    case "simpleCheckout":
      step = "review_send";
      break;
    case "simpleDone":
      step = "done";
      break;
    case "simpleVerification":
      step = "verification";
      break;
    case "billing":
      step = "billing";
      break;
    default:
      step = "workspace";
  }
  setLawdogFlowStep(flow, step);
}

/** After a successful agreement draft creation (client-side; pairs with server metering). */
export function noteLawdogSessionAgreementCreated(): void {
  const st = readLawdogSessionState();
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const recent = [...st.recent_agreement_create_ms, now].filter((t) => now - t <= windowMs);
  writeLawdogSessionState({
    ...st,
    agreements_created_session: st.agreements_created_session + 1,
    recent_agreement_create_ms: recent.slice(-20),
  });
}

/**
 * Attach the user’s own account email to the session for event context.
 * Do **not** call with counterparty/signer/reviewer emails — use only explicit “this is my email” flows.
 */
export function bindLawdogSessionEmail(email: string): void {
  const norm = (email || "").trim().toLowerCase();
  if (!norm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) return;
  const st = readLawdogSessionState();
  if (st.identity_email === norm) return;
  writeLawdogSessionState({ ...st, identity_email: norm });
}

export function getLawdogSessionEmail(): string | null {
  return readLawdogSessionState().identity_email;
}

/** Soft UX hints — state-driven, not fingerprinting. */
export function getLawdogTrustNudges(): {
  suggestEmailForTrust: boolean;
  agreementsCreatedInSession: number;
} {
  const st = readLawdogSessionState();
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const recent = st.recent_agreement_create_ms.filter((t) => now - t <= windowMs);
  return {
    suggestEmailForTrust: recent.length >= 3 && !st.identity_email,
    agreementsCreatedInSession: st.agreements_created_session,
  };
}

/** Merged into every {@link logProductEvent} payload. */
export function getLawdogEventEnvelope(): Record<string, unknown> {
  const st = readLawdogSessionState();
  const base: Record<string, unknown> = {
    session_id: getOrCreateLawdogSessionId(),
    flow: st.flow,
    step: st.step,
    traffic_source: getLawdogTrafficSource(),
    timestamp: new Date().toISOString(),
  };
  if (st.identity_email) base.identity_email_bound = true;
  const ref = getLawdogReferralSource();
  if (ref) base.referral_source = ref;
  return base;
}

export function markLawdogFunnelStep(step: string): void {
  const st = readLawdogSessionState();
  const sk = STEP_KEYS.has(step) ? step : "other";
  writeLawdogSessionState(touchStepTimestamp({ ...st, step: sk }, sk));
}

/** Call when `claim_record_viewed` fires — starts the time-to-claim window for this record. */
export function markClaimRecordViewStarted(recordId: string): void {
  const rid = (recordId || "").trim();
  if (!rid) return;
  const st = readLawdogSessionState();
  writeLawdogSessionState({
    ...st,
    claim_view_record_id: rid,
    claim_view_started_ms: Date.now(),
  });
}

/**
 * Milliseconds since {@link markClaimRecordViewStarted} for this `recordId`, then clears markers.
 * Returns `null` if no matching impression (e.g. new record or already consumed).
 */
export function takeTimeToClaimMsForRecord(recordId: string): number | null {
  const rid = (recordId || "").trim();
  if (!rid) return null;
  const st = readLawdogSessionState();
  if (st.claim_view_record_id !== rid || st.claim_view_started_ms == null) return null;
  const ms = Date.now() - st.claim_view_started_ms;
  writeLawdogSessionState({
    ...st,
    claim_view_record_id: null,
    claim_view_started_ms: null,
  });
  return ms >= 0 ? ms : null;
}

export function markSignupCompletedViaClaim(): void {
  const st = readLawdogSessionState();
  writeLawdogSessionState({ ...st, signup_completed_via_claim: true });
}

export function markClaimKeepGoingChosen(): void {
  const st = readLawdogSessionState();
  writeLawdogSessionState({ ...st, claim_keep_going_chosen: true });
}

/** Increment on each `/app` dashboard mount; used for return-save banner (visit ≥ 2). */
export function incrementLawdogDashboardVisitCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const prev = parseInt(window.localStorage.getItem(LAWDOG_DASHBOARD_VISIT_COUNT_KEY) || "0", 10) || 0;
    const n = prev + 1;
    window.localStorage.setItem(LAWDOG_DASHBOARD_VISIT_COUNT_KEY, String(n));
    return n;
  } catch {
    return 0;
  }
}

/** User dismissed “save your record” reminder (persists across sessions). */
const RETURN_BANNER_DISMISS_STORAGE_KEY = "lawdog_return_save_banner_dismissed";

export function isReturnSaveBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RETURN_BANNER_DISMISS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** @deprecated Use {@link dismissReturnSaveBanner}. */
export function dismissReturnSaveBannerThisTab(): void {
  dismissReturnSaveBanner();
}

export function dismissReturnSaveBanner(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RETURN_BANNER_DISMISS_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** After incrementing dashboard visit count with {@link incrementLawdogDashboardVisitCount}. */
export function shouldShowReturnSaveBanner(dashboardVisitNumber: number): boolean {
  if (typeof window !== "undefined" && isReturnSaveBannerDismissed()) return false;
  if (dashboardVisitNumber < 2) return false;
  const st = readLawdogSessionState();
  if (st.agreements_created_session < 1) return false;
  if (st.signup_completed_via_claim) return false;
  return true;
}
