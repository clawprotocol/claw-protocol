/**
 * Durable paid-create context for Dashboard / Founder → /app/create before async billing fetch settles.
 * Scoped to org + /app/create read. Public homepage entry must clear this marker.
 */

import { getCachedAccessToken, setCachedAccessToken } from "../auth/authAccessTokenCache";
import {
  markAuthenticatedWorkspaceSession,
  readSignedInAuthenticatedWorkspaceSession,
} from "./completedAgreementViewContext";
import { getOrgId, setOrgId } from "./orgContext";
import { tierAllowsAdvancedFullDraftReveal } from "../components/agreements/agreementAdvancedDraftAccess";
import { subscriptionTierForAccess } from "../access/subscriptionEntitlementCache";
import { readCachedWorkspaceProEntitlement } from "../agreement/agreementProFunnelGate";
import {
  clearHomeAnonymousCreateOrigin,
  isHomeAnonymousStarterAuthorityActive,
} from "./homeAnonymousCreateOrigin";
import { mustBlockPaidEntitlementForLegacyFallbackOrg } from "./fallbackOrgPaidEntitlementGuard";

const KEY = "claw_paid_dashboard_create_context_v1";

/**
 * TEST545 — set once the direct-entry bootstrap has genuinely reached the marker-write step (i.e. it
 * passed all guards). Used to distinguish a real marker-write failure from the normal, transient
 * pre-bootstrap render window (render-phase probes run before the auth-settled effect writes the
 * marker). Only after an attempt should a still-missing marker be treated as fatal.
 */
const BOOTSTRAP_ATTEMPT_KEY = "claw_direct_create_bootstrap_attempted_v1";

export function markDirectAuthenticatedCreateBootstrapAttempted(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(BOOTSTRAP_ATTEMPT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasDirectAuthenticatedCreateBootstrapAttempted(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(BOOTSTRAP_ATTEMPT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Operator Founder HQ paths — same authenticated workspace family as /app. */
export const FOUNDER_ADMIN_CONSOLE_PATHS = [
  "/founder",
  "/admin",
  "/app/founder",
  "/app/admin",
] as const;

/** Canonical route marker for logged-in Dashboard → Create (all workspace create entries normalize here). */
export const DASHBOARD_PAID_CREATE_ROUTE_SOURCE = "dashboard_paid_create" as const;

export type PaidDashboardCreateContextSource =
  | typeof DASHBOARD_PAID_CREATE_ROUTE_SOURCE
  | "dashboard_new_agreement"
  | "dashboard_drafting_redirect"
  | "workspace_nav_create"
  | "founder_top_nav_create"
  | "app_shell_top_nav_create"
  | "dashboard_duplicate"
  | "app_shell_new_agreement"
  | "reengagement_banner"
  | "send_edit_return";

/** Workspace create entries that must normalize to {@link DASHBOARD_PAID_CREATE_ROUTE_SOURCE}. */
const DASHBOARD_PAID_CREATE_LEGACY_SOURCES = new Set<string>([
  "dashboard_new_agreement",
  "dashboard_drafting_redirect",
  "workspace_nav_create",
  "founder_top_nav_create",
  "app_shell_top_nav_create",
  "dashboard_duplicate",
  "app_shell_new_agreement",
  "reengagement_banner",
  "paid_dashboard_create_option",
  "dashboard_nav",
]);

/** Resume/edit flows — not a fresh dashboard create route. */
const DASHBOARD_PAID_CREATE_RESUME_SOURCES = new Set<string>(["send_edit_return"]);

export function normalizeDashboardPaidCreateSource(
  source: PaidDashboardCreateContextSource | string,
): string {
  const s = (source || "").trim();
  if (!s || s === DASHBOARD_PAID_CREATE_ROUTE_SOURCE) return DASHBOARD_PAID_CREATE_ROUTE_SOURCE;
  if (DASHBOARD_PAID_CREATE_RESUME_SOURCES.has(s)) return s;
  if (DASHBOARD_PAID_CREATE_LEGACY_SOURCES.has(s)) return DASHBOARD_PAID_CREATE_ROUTE_SOURCE;
  if (s.endsWith("_create") || s.includes("dashboard")) return DASHBOARD_PAID_CREATE_ROUTE_SOURCE;
  return s;
}

export function isDashboardPaidCreateRouteActive(): boolean {
  const ctx = readPaidDashboardCreateContext();
  if (!ctx) return false;
  const normalized = normalizeDashboardPaidCreateSource(ctx.source);
  if (DASHBOARD_PAID_CREATE_RESUME_SOURCES.has(normalized)) return false;
  return normalized === DASHBOARD_PAID_CREATE_ROUTE_SOURCE;
}

export function markDashboardPaidCreateRoute(): boolean {
  return markPaidDashboardCreateContext(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
}

export type PaidDashboardCreateContextMarker = {
  v: 1;
  orgId: string;
  source: PaidDashboardCreateContextSource | string;
  markedAt: number;
};

export function isAppCreatePath(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const p = window.location.pathname.replace(/\/$/, "") || "/";
    return p === "/app/create";
  } catch {
    return false;
  }
}

function normalizePath(pathname: string): string {
  return (pathname || "").replace(/\/$/, "") || "/";
}

export function isFounderAdminConsolePath(pathname: string): boolean {
  const p = normalizePath(pathname);
  return (FOUNDER_ADMIN_CONSOLE_PATHS as readonly string[]).includes(p);
}

/** Authenticated in-app workspace (not public marketing homepage). */
export function isAuthenticatedWorkspacePath(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (p === "/" || p === "/home") return false;
  if (isFounderAdminConsolePath(p)) return true;
  return p.startsWith("/app") || p === "/dashboard";
}

/** @deprecated Use isAuthenticatedWorkspacePath */
export function isWorkspaceNavOrigin(pathname: string): boolean {
  return isAuthenticatedWorkspacePath(pathname);
}

export function isPublicMarketingPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  return p === "/" || p === "/home";
}

export type PaidDashboardCreateOrgIdClass = "user" | "anon" | "local" | "other" | "empty";

export function classifyPaidDashboardCreateOrgId(orgId?: string | null): PaidDashboardCreateOrgIdClass {
  const oid = (orgId ?? "").trim();
  if (!oid) return "empty";
  if (oid.startsWith("user-")) return "user";
  if (oid.startsWith("anon-")) return "anon";
  if (oid === "local-org") return "local";
  return "other";
}

/** Homepage hero handoff — must never resurrect paid-dashboard create context. */
export function isHeroFromHomeCreateEntry(): boolean {
  return isHomeAnonymousStarterAuthorityActive();
}

function hasAuthoritativePaidEntitlementForMarker(): boolean {
  if (mustBlockPaidEntitlementForLegacyFallbackOrg()) return false;
  const tier = subscriptionTierForAccess();
  if (tier && tierAllowsAdvancedFullDraftReveal(tier)) return true;
  return readCachedWorkspaceProEntitlement();
}

export type PaidDashboardCreateContextWriteDecision = {
  allowed: boolean;
  reason: string;
  orgIdClass: PaidDashboardCreateOrgIdClass;
  hasAuthenticatedUser: boolean;
  hasSupabaseToken: boolean;
  hasAuthoritativePaidEntitlement: boolean;
  heroFromHome: boolean;
};

export function evaluatePaidDashboardCreateContextWrite(
  source: PaidDashboardCreateContextSource | string,
): PaidDashboardCreateContextWriteDecision {
  const orgId = getOrgId().trim();
  const orgIdClass = classifyPaidDashboardCreateOrgId(orgId);
  const hasSupabaseToken = Boolean(getCachedAccessToken().trim());
  const hasAuthenticatedUser = readSignedInAuthenticatedWorkspaceSession();
  const heroFromHome = isHeroFromHomeCreateEntry();
  const hasAuthoritativePaidEntitlement = hasAuthoritativePaidEntitlementForMarker();
  const base = {
    orgIdClass,
    hasAuthenticatedUser,
    hasSupabaseToken,
    hasAuthoritativePaidEntitlement,
    heroFromHome,
  };
  if (heroFromHome) {
    return { ...base, allowed: false, reason: "hero_from_home_starter" };
  }
  if (mustBlockPaidEntitlementForLegacyFallbackOrg(orgId)) {
    return { ...base, allowed: false, reason: "fallback_org_never_paid" };
  }
  if (!hasAuthenticatedUser) {
    return { ...base, allowed: false, reason: "unsigned_workspace" };
  }
  if (orgIdClass === "local" || orgIdClass === "anon" || orgIdClass === "empty") {
    return { ...base, allowed: false, reason: `anonymous_org:${orgIdClass}` };
  }
  if (!orgId.startsWith("user-") && !hasSupabaseToken) {
    return { ...base, allowed: false, reason: "missing_user_org_and_token" };
  }
  void source;
  return { ...base, allowed: true, reason: "signed_in_workspace" };
}

function isStoredPaidDashboardCreateContextEligible(
  stored: PaidDashboardCreateContextMarker,
): boolean {
  return evaluatePaidDashboardCreateContextWrite(stored.source).allowed;
}

export function logPaidDashboardCreateContextWrite(args: {
  action: "set" | "restore" | "clear" | "reject";
  requestedSource?: string | null;
  acceptedSource?: string | null;
  originPath?: string | null;
  destinationPath?: string | null;
  target?: string | null;
  reason?: string | null;
  decision?: PaidDashboardCreateContextWriteDecision;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const decision =
    args.decision ??
    (args.requestedSource
      ? evaluatePaidDashboardCreateContextWrite(args.requestedSource)
      : undefined);
  // eslint-disable-next-line no-console
  console.info("[paid-dashboard-create-context-write]", {
    action: args.action,
    requestedSource: args.requestedSource ?? null,
    acceptedSource: args.acceptedSource ?? null,
    originPath: args.originPath ?? null,
    destinationPath:
      args.destinationPath ??
      (typeof window !== "undefined" ? window.location.pathname : null),
    orgIdClass: decision?.orgIdClass ?? classifyPaidDashboardCreateOrgId(getOrgId()),
    hasAuthenticatedUser: decision?.hasAuthenticatedUser ?? readSignedInAuthenticatedWorkspaceSession(),
    hasSupabaseToken: decision?.hasSupabaseToken ?? Boolean(getCachedAccessToken().trim()),
    hasAuthoritativePaidEntitlement:
      decision?.hasAuthoritativePaidEntitlement ?? hasAuthoritativePaidEntitlementForMarker(),
    heroFromHome: decision?.heroFromHome ?? isHeroFromHomeCreateEntry(),
    target: args.target ?? null,
    reason: args.reason ?? decision?.reason ?? null,
  });
}

function readStoredPaidDashboardCreateMarker(): PaidDashboardCreateContextMarker | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PaidDashboardCreateContextMarker>;
    if (
      parsed?.v !== 1 ||
      typeof parsed.orgId !== "string" ||
      !parsed.orgId.trim() ||
      typeof parsed.source !== "string" ||
      !parsed.source.trim()
    ) {
      return null;
    }
    return parsed as PaidDashboardCreateContextMarker;
  } catch {
    return null;
  }
}

export function logPaidDashboardCreateContext(args: {
  active: boolean;
  source: string | null;
  orgId?: string | null;
  path?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-dashboard-create-context]", {
    ...args,
    orgId: args.orgId ?? getOrgId().trim(),
    path: args.path ?? (typeof window !== "undefined" ? window.location.pathname : null),
  });
}

export function logPaidDashboardCreateNavigation(args: {
  sourceId: string;
  originPathname: string;
  destination: string;
  marked: boolean;
  cleared: boolean;
  markSource?: string | null;
  clearReason?: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-dashboard-create-navigation]", args);
}

export function logFatalMissingPaidDashboardCreateMarker(args: {
  originHint?: string | null;
  workspaceSession: boolean;
}): void {
  const msg =
    "[fatal-paid-dashboard-create-marker-missing] authenticated workspace create without paid-dashboard marker";
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.error(msg, args);
  } else if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.warn(msg, args);
  }
}

export function markPaidDashboardCreateContext(
  source: PaidDashboardCreateContextSource | string,
  opts?: { originPath?: string | null; destinationPath?: string | null; target?: string | null },
): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const decision = evaluatePaidDashboardCreateContextWrite(source);
  const storedSource = normalizeDashboardPaidCreateSource(source);
  if (!decision.allowed) {
    logPaidDashboardCreateContextWrite({
      action: "reject",
      requestedSource: source,
      acceptedSource: null,
      originPath: opts?.originPath ?? null,
      destinationPath: opts?.destinationPath ?? null,
      target: opts?.target ?? null,
      reason: decision.reason,
      decision,
    });
    return false;
  }
  const oid = getOrgId().trim();
  if (!oid) return false;
  try {
    const marker: PaidDashboardCreateContextMarker = {
      v: 1,
      orgId: oid,
      source: storedSource,
      markedAt: Date.now(),
    };
    sessionStorage.setItem(KEY, JSON.stringify(marker));
    logPaidDashboardCreateContextWrite({
      action: "set",
      requestedSource: source,
      acceptedSource: storedSource,
      originPath: opts?.originPath ?? null,
      destinationPath: opts?.destinationPath ?? null,
      target: opts?.target ?? null,
      reason: decision.reason,
      decision,
    });
    logPaidDashboardCreateContext({
      active: true,
      source: storedSource,
      orgId: oid,
      path: typeof window !== "undefined" ? window.location.pathname : null,
    });
    clearHomeAnonymousCreateOrigin("dashboard_paid_create_marked");
    return true;
  } catch {
    return false;
  }
}

export function clearPaidDashboardCreateContext(reason?: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
    logPaidDashboardCreateContextWrite({
      action: "clear",
      requestedSource: reason ? `cleared:${reason}` : null,
      acceptedSource: null,
      reason: reason ?? "cleared",
    });
    logPaidDashboardCreateContext({
      active: false,
      source: reason ? `cleared:${reason}` : null,
    });
  } catch {
    /* ignore */
  }
}

export function readPaidDashboardCreateContext(): PaidDashboardCreateContextMarker | null {
  if (!isAppCreatePath()) return null;
  const oid = getOrgId().trim();
  if (!oid) return null;
  const stored = readStoredPaidDashboardCreateMarker();
  if (!stored || stored.orgId !== oid) return null;
  if (!isStoredPaidDashboardCreateContextEligible(stored)) {
    logPaidDashboardCreateContextWrite({
      action: "reject",
      requestedSource: stored.source,
      acceptedSource: null,
      reason: isHeroFromHomeCreateEntry()
        ? "hero_from_home_stale_marker"
        : evaluatePaidDashboardCreateContextWrite(stored.source).reason,
    });
    clearPaidDashboardCreateContext(
      isHeroFromHomeCreateEntry() ? "hero_from_home_stale_marker" : "rejected_stale_marker",
    );
    return null;
  }
  return stored;
}

export function hasPaidDashboardCreateContextActive(): boolean {
  return readPaidDashboardCreateContext() !== null;
}

/** Log marker state on /app/create mount — before starter gate can run. */
export function logPaidDashboardCreateContextOnMount(): void {
  if (!isAppCreatePath()) return;
  const ctx = readPaidDashboardCreateContext();
  logPaidDashboardCreateContext({
    active: Boolean(ctx),
    source: ctx?.source ?? null,
    orgId: getOrgId().trim(),
    path: typeof window !== "undefined" ? window.location.pathname : null,
  });
}

/** Authenticated /app/create without marker — fail-closed paid bypass for app users. */
export function shouldFailClosedBypassForAuthenticatedWorkspaceCreate(): boolean {
  if (!isAppCreatePath()) return false;
  if (hasPaidDashboardCreateContextActive()) return false;
  if (!readSignedInAuthenticatedWorkspaceSession()) return false;
  // TEST545 — the fail-closed bypass value (treat as paid) is unchanged, but the fatal telemetry must
  // NOT fire during the normal, transient pre-bootstrap window. This probe runs in the render phase on
  // every render; the direct-entry marker is written by an effect only after auth settles (session
  // marked + org bound). So render-phase probes legitimately precede the write and would otherwise log
  // `originHint:null` on every pre-settle render (proven by the TEST545 runtime trace: rawKeyPresent
  // false → write → active true, no erasure). Only escalate to fatal once the bootstrap has actually
  // attempted the marker write and it is STILL missing (a real failure).
  if (hasDirectAuthenticatedCreateBootstrapAttempted()) {
    logFatalMissingPaidDashboardCreateMarker({
      workspaceSession: true,
      originHint: readStoredPaidDashboardCreateMarker()?.source ?? null,
    });
  }
  return true;
}

/** Vitest: seed marker without navigation (uses signed-in user org by default). */
export function markPaidDashboardCreateContextForTests(
  source: PaidDashboardCreateContextSource | string = DASHBOARD_PAID_CREATE_ROUTE_SOURCE,
  orgId?: string,
): void {
  if (typeof sessionStorage === "undefined") return;
  const explicitOrg = orgId?.trim();
  let oid = explicitOrg || getOrgId().trim() || "user-test-org";
  if (!explicitOrg && classifyPaidDashboardCreateOrgId(oid) !== "user") {
    oid = "user-test-org";
  }
  if (classifyPaidDashboardCreateOrgId(oid) === "user") {
    setOrgId(oid);
    markAuthenticatedWorkspaceSession();
    setCachedAccessToken("test-dashboard-token");
  }
  const marker: PaidDashboardCreateContextMarker = {
    v: 1,
    orgId: oid,
    source: normalizeDashboardPaidCreateSource(source),
    markedAt: Date.now(),
  };
  sessionStorage.setItem(KEY, JSON.stringify(marker));
}

export function clearPaidDashboardCreateContextForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(KEY);
}
