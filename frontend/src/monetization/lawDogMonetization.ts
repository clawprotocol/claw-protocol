import type { AccessTier } from "../access/types";
import type { UsageTotals } from "../access/types";
import type { LawDogMonetizationPlan, LawDogUserMonetizationState } from "./types";

/**
 * When true, second-agreement creation and simple-flow send paywall are relaxed so localhost
 * UX testing is not blocked by stale localStorage usage. Never true in production builds or vitest.
 */
export function isLocalhostDevMonetizationRelax(): boolean {
  if (import.meta.env.MODE === "test") return false;
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

const LS_AUTH = "lawdog_mock_is_authenticated";
const LS_PLAN_OVERRIDE = "lawdog_mock_monetization_plan";

/**
 * Mock auth: default `true` so free-tier + second-agreement paywall is testable in dev.
 * Set `localStorage.lawdog_mock_is_authenticated = "false"` for anonymous (no block).
 */
export function readMockIsAuthenticated(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(LS_AUTH);
    if (v === "0" || v === "false") return false;
    if (v === "1" || v === "true") return true;
    return true;
  } catch {
    return true;
  }
}

/** Optional override: `"free"` | `"pro"` | `"power"` in localStorage for QA. */
export function readMockMonetizationPlanOverride(): LawDogMonetizationPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const v = (window.localStorage.getItem(LS_PLAN_OVERRIDE) || "").trim().toLowerCase();
    if (v === "free" || v === "pro" || v === "power") return v;
    return null;
  } catch {
    return null;
  }
}

/**
 * Map access tier → monetization plan.
 * - `standard` → Pro (unlimited agreements vs free).
 * - `premium` / `admin` → Power (advanced features on top of Pro).
 */
export function monetizationPlanFromAccessTier(tier: AccessTier): LawDogMonetizationPlan {
  const o = readMockMonetizationPlanOverride();
  if (o) return o;
  if (tier === "free") return "free";
  if (tier === "standard") return "pro";
  return "power";
}

export function readLawDogUserMonetizationState(
  tier: AccessTier,
  usage: UsageTotals
): LawDogUserMonetizationState {
  return {
    isAuthenticated: readMockIsAuthenticated(),
    plan: monetizationPlanFromAccessTier(tier),
    agreements_created: usage.agreements_created,
  };
}

/**
 * Free authenticated users may create exactly one agreement; Pro and Power are unlimited.
 */
export function shouldBlockSecondAgreementCreation(state: LawDogUserMonetizationState): boolean {
  if (isLocalhostDevMonetizationRelax()) return false;
  return state.isAuthenticated && state.plan === "free" && state.agreements_created >= 1;
}

// --- Power-tier feature gates (future: team, API, integrations hook in here) ---

/** Template-grade reuse: Agreement Memory navigation, “find similar”, fork from prior, etc. */
export function canReuseTemplates(user: LawDogUserMonetizationState): boolean {
  return user.plan === "power";
}

/** Advanced Work Product studio (structured memos/briefs from workspace). */
export function canUseAdvancedWorkProduct(user: LawDogUserMonetizationState): boolean {
  return user.plan === "power";
}

/** Full negotiation timeline / deep version history visualization in workspace. */
export function canAccessFullTimeline(user: LawDogUserMonetizationState): boolean {
  return user.plan === "power";
}

/**
 * Surfaces intentionally not gated here: second-agreement Pro modal, ClaimRecord, e-sign quick send,
 * send/sign for an existing agreement.
 */
