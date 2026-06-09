/**
 * Lightweight current-user adapter for dashboard / workspace surfaces.
 * Dev/local mode uses org id + optional display name — no login wall for localhost QA.
 */

import { getOrgId } from "../launch/orgContext";

export type CurrentUserSource = "local_dev" | "org_context" | "anonymous";

export type CurrentUser = {
  id: string;
  displayName: string;
  email: string | null;
  isAuthenticated: boolean;
  source: CurrentUserSource;
};

const DISPLAY_NAME_KEYS = ["claw_user_display_name", "claw_creator_display_name"] as const;

export function readStoredDisplayName(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    for (const key of DISPLAY_NAME_KEYS) {
      const v = localStorage.getItem(key)?.trim();
      if (v) return v;
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function writeCurrentUserDisplayName(name: string): void {
  if (typeof localStorage === "undefined") return;
  const t = name.trim();
  try {
    if (t) localStorage.setItem("claw_user_display_name", t);
    else localStorage.removeItem("claw_user_display_name");
  } catch {
    /* ignore */
  }
}

/** Resolve the active workspace user — never blocks reviewer/signing token routes. */
export function resolveCurrentUser(): CurrentUser {
  const orgId = getOrgId().trim() || "local-org";
  const displayName = readStoredDisplayName();
  const isDev =
    typeof import.meta !== "undefined" &&
    Boolean(import.meta.env?.DEV || import.meta.env?.MODE === "test");
  if (isDev || orgId) {
    return {
      id: orgId,
      displayName: displayName || "Local User",
      email: null,
      isAuthenticated: true,
      source: isDev ? "local_dev" : "org_context",
    };
  }
  return {
    id: "anonymous",
    displayName: "Guest",
    email: null,
    isAuthenticated: false,
    source: "anonymous",
  };
}

/** Dashboard/account routes may assume a user context; public token routes must not call this. */
export function isDashboardAccountSurface(pathname: string): boolean {
  const p = (pathname || "").replace(/\/$/, "") || "/";
  if (p === "/app" || p === "/dashboard") return true;
  if (p === "/app/create" || p === "/app/quick") return true;
  if (p === "/app/affiliate" || p === "/app/settings" || p === "/app/signatures") return true;
  if (p.startsWith("/app/agreements")) return true;
  if (p.startsWith("/app/send/") || p.startsWith("/app/done/") || p.startsWith("/app/ready/")) {
    return true;
  }
  return false;
}

/** Reviewer and signer links stay public — no login redirect. */
export function isPublicTokenAgreementSurface(pathname: string): boolean {
  const p = (pathname || "").replace(/\/$/, "") || "/";
  if (/^\/agreements\/[^/]+\/review$/i.test(p)) return true;
  if (/^\/app\/esign\/[^/]+$/i.test(p) && p !== "/app/esign/new") return true;
  if (/^\/app\/agreements\/[^/]+$/i.test(p) && /\?.*(?:^|&)(?:t|token)=/i.test(window.location.search)) {
    return true;
  }
  return false;
}
