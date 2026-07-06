/**
 * Durable paid-create context for Dashboard / Founder → /app/create before async billing fetch settles.
 * Scoped to org + /app/create read. Public homepage entry must clear this marker.
 */

import { readAuthenticatedWorkspaceSession } from "./completedAgreementViewContext";
import { getOrgId } from "./orgContext";

const KEY = "claw_paid_dashboard_create_context_v1";

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
): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const oid = getOrgId().trim();
  if (!oid) return false;
  const storedSource = normalizeDashboardPaidCreateSource(source);
  try {
    const marker: PaidDashboardCreateContextMarker = {
      v: 1,
      orgId: oid,
      source: storedSource,
      markedAt: Date.now(),
    };
    sessionStorage.setItem(KEY, JSON.stringify(marker));
    logPaidDashboardCreateContext({
      active: true,
      source: storedSource,
      orgId: oid,
      path: typeof window !== "undefined" ? window.location.pathname : null,
    });
    return true;
  } catch {
    return false;
  }
}

export function clearPaidDashboardCreateContext(reason?: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
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
  return stored;
}

export function hasPaidDashboardCreateContextActive(): boolean {
  return readPaidDashboardCreateContext() !== null;
}

/** Log marker state on /app/create mount — before starter gate can run. */
export function logPaidDashboardCreateContextOnMount(): void {
  if (!isAppCreatePath()) return;
  const oid = getOrgId().trim();
  const stored = readStoredPaidDashboardCreateMarker();
  const active = Boolean(stored && stored.orgId === oid);
  logPaidDashboardCreateContext({
    active,
    source: active ? stored!.source : null,
    orgId: oid,
    path: typeof window !== "undefined" ? window.location.pathname : null,
  });
}

/** Authenticated /app/create without marker — fail-closed paid bypass for app users. */
export function shouldFailClosedBypassForAuthenticatedWorkspaceCreate(): boolean {
  if (!isAppCreatePath()) return false;
  if (hasPaidDashboardCreateContextActive()) return false;
  if (!readAuthenticatedWorkspaceSession()) return false;
  logFatalMissingPaidDashboardCreateMarker({
    workspaceSession: true,
    originHint: readStoredPaidDashboardCreateMarker()?.source ?? null,
  });
  return true;
}

/** Vitest: seed marker without navigation. */
export function markPaidDashboardCreateContextForTests(
  source: PaidDashboardCreateContextSource | string = DASHBOARD_PAID_CREATE_ROUTE_SOURCE,
  orgId?: string,
): void {
  if (typeof sessionStorage === "undefined") return;
  const oid = (orgId ?? getOrgId()).trim() || "test-org";
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
