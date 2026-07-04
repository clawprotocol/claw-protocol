/**
 * Durable paid-create context for Dashboard → /app/create before async billing fetch settles.
 * Scoped to org + /app/create only. Public homepage entry must clear this marker.
 */

import { readAuthenticatedWorkspaceSession } from "./completedAgreementViewContext";
import { getOrgId } from "./orgContext";

const KEY = "claw_paid_dashboard_create_context_v1";

export type PaidDashboardCreateContextSource =
  | "dashboard_new_agreement"
  | "dashboard_drafting_redirect"
  | "workspace_nav_create"
  | "dashboard_duplicate"
  | "app_shell_new_agreement"
  | "reengagement_banner"
  | "send_edit_return";

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

/** Paths that imply in-app workspace navigation (not public marketing homepage). */
export function isWorkspaceNavOrigin(pathname: string): boolean {
  const p = (pathname || "").replace(/\/$/, "") || "/";
  if (p === "/" || p === "/home") return false;
  return p.startsWith("/app") || p === "/dashboard";
}

export function logPaidDashboardCreateContext(args: {
  active: boolean;
  source: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-dashboard-create-context]", args);
}

export function markPaidDashboardCreateContext(
  source: PaidDashboardCreateContextSource | string,
): void {
  if (typeof sessionStorage === "undefined") return;
  const oid = getOrgId().trim();
  if (!oid) return;
  if (!readAuthenticatedWorkspaceSession() && !isWorkspaceNavOrigin(window.location.pathname)) {
    return;
  }
  try {
    const marker: PaidDashboardCreateContextMarker = {
      v: 1,
      orgId: oid,
      source,
      markedAt: Date.now(),
    };
    sessionStorage.setItem(KEY, JSON.stringify(marker));
    logPaidDashboardCreateContext({ active: true, source });
  } catch {
    /* quota / private mode */
  }
}

export function clearPaidDashboardCreateContext(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
    logPaidDashboardCreateContext({ active: false, source: null });
  } catch {
    /* ignore */
  }
}

export function readPaidDashboardCreateContext(): PaidDashboardCreateContextMarker | null {
  if (typeof sessionStorage === "undefined") return null;
  if (!isAppCreatePath()) return null;
  const oid = getOrgId().trim();
  if (!oid) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PaidDashboardCreateContextMarker>;
    if (
      parsed?.v !== 1 ||
      parsed.orgId !== oid ||
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

export function hasPaidDashboardCreateContextActive(): boolean {
  return readPaidDashboardCreateContext() !== null;
}

/** Vitest: seed marker without navigation. */
export function markPaidDashboardCreateContextForTests(
  source: PaidDashboardCreateContextSource | string = "dashboard_new_agreement",
  orgId?: string,
): void {
  if (typeof sessionStorage === "undefined") return;
  const oid = (orgId ?? getOrgId()).trim() || "test-org";
  const marker: PaidDashboardCreateContextMarker = {
    v: 1,
    orgId: oid,
    source,
    markedAt: Date.now(),
  };
  sessionStorage.setItem(KEY, JSON.stringify(marker));
}

export function clearPaidDashboardCreateContextForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(KEY);
}
