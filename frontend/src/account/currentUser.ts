/**
 * Current-user adapter for dashboard / workspace surfaces.
 *
 * Org headers, localStorage, and workspace slugs are NEVER proof of authentication.
 * Authenticated state requires a validated Supabase session (or explicit e2e/dev test bridge),
 * OR a demo session user created after simulated POS checkout.
 */

import { getOrgId } from "../launch/orgContext";
import { readE2eAuthSessionForDev } from "../auth/e2eAuthSessionBridge";
import { isPublicProductionHostname } from "../launch/devPaymentBypass";
import { readDemoSessionUser } from "../launch/guestCheckoutAuthority";
import { matchAppRoute, routeRequiresAuthenticatedSession } from "../launch/routes";

export type CurrentUserSource = "supabase_session" | "e2e_test_bridge" | "demo_checkout" | "anonymous";

export type AuthLifecycleStatus = "loading" | "authenticated" | "signed_out" | "refresh_failed";

export type ResolvedAuthLifecycle = {
  status: AuthLifecycleStatus;
  accessToken?: string | null;
  userId?: string | null;
  email?: string | null;
  displayName?: string | null;
};

let resolvedAuthLifecycle: ResolvedAuthLifecycle | null = null;

export function bindResolvedAuthLifecycle(next: ResolvedAuthLifecycle | null): void {
  resolvedAuthLifecycle = next;
}

export function readResolvedAuthLifecycle(): ResolvedAuthLifecycle | null {
  return resolvedAuthLifecycle;
}

export function isJwtAccessToken(token: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token.trim());
}

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

/**
 * Explicit local/e2e test bridge — impossible on public production hostnames.
 * Requires DEV or MODE=test, plus e2e session seed (Playwright) or VITE_CLAW_E2E_AUTH_BRIDGE=1.
 */
export function isExplicitLocalAuthTestBridgeEnabled(): boolean {
  if (typeof window !== "undefined") {
    try {
      if (isPublicProductionHostname(window.location.hostname)) return false;
    } catch {
      /* ignore */
    }
  }
  const isDevOrTest =
    typeof import.meta !== "undefined" &&
    Boolean(import.meta.env?.DEV || import.meta.env?.MODE === "test");
  if (!isDevOrTest) return false;
  if (readE2eAuthSessionForDev()) return true;
  return String(import.meta.env?.VITE_CLAW_E2E_AUTH_BRIDGE || "") === "1";
}

/** Resolve the active workspace user — never blocks reviewer/signing token routes. */
export function resolveCurrentUser(args?: {
  supabaseUserId?: string | null;
  supabaseEmail?: string | null;
  supabaseDisplayName?: string | null;
  lifecycle?: ResolvedAuthLifecycle | null;
}): CurrentUser {
  const displayName = readStoredDisplayName();
  const lifecycle = args?.lifecycle === undefined ? resolvedAuthLifecycle : args.lifecycle;
  if (lifecycle?.status === "signed_out" || lifecycle?.status === "refresh_failed") {
    void getOrgId();
    return {
      id: "anonymous",
      displayName: displayName || "Guest",
      email: null,
      isAuthenticated: false,
      source: "anonymous",
    };
  }
  if (lifecycle?.status === "authenticated") {
    const token = String(lifecycle.accessToken || "").trim();
    const id = String(lifecycle.userId || "").trim();
    if (id && isJwtAccessToken(token)) {
      return {
        id,
        displayName: (lifecycle.displayName || "").trim() || displayName || lifecycle.email || "Signed-in user",
        email: (lifecycle.email || "").trim() || null,
        isAuthenticated: true,
        source: "supabase_session",
      };
    }
    void getOrgId();
    return {
      id: "anonymous",
      displayName: displayName || "Guest",
      email: null,
      isAuthenticated: false,
      source: "anonymous",
    };
  }
  if (lifecycle?.status === "loading") {
    void getOrgId();
    return {
      id: "anonymous",
      displayName: displayName || "Guest",
      email: null,
      isAuthenticated: false,
      source: "anonymous",
    };
  }

  const supabaseUserId = (args?.supabaseUserId || "").trim();
  if (supabaseUserId) {
    return {
      id: supabaseUserId,
      displayName:
        (args?.supabaseDisplayName || "").trim() ||
        displayName ||
        (args?.supabaseEmail || "").trim() ||
        "Signed-in user",
      email: (args?.supabaseEmail || "").trim() || null,
      isAuthenticated: true,
      source: "supabase_session",
    };
  }

  if (isExplicitLocalAuthTestBridgeEnabled()) {
    const e2e = readE2eAuthSessionForDev();
    if (e2e?.user?.id) {
      return {
        id: String(e2e.user.id),
        displayName:
          displayName ||
          String((e2e.user as { user_metadata?: { full_name?: string } }).user_metadata?.full_name || "") ||
          String(e2e.user.email || "E2E User"),
        email: e2e.user.email ?? null,
        isAuthenticated: true,
        source: "e2e_test_bridge",
      };
    }
  }

  // Demo session user: created after simulated POS checkout, acts as authenticated for the session.
  const demoUser = readDemoSessionUser();
  if (demoUser) {
    return {
      id: demoUser.id,
      displayName: displayName || demoUser.displayName,
      email: demoUser.email,
      isAuthenticated: true,
      source: "demo_checkout",
    };
  }

  // Stored identity or arbitrary token text is never authentication.
  // Org header / local-org is workspace context only.
  void getOrgId();
  return {
    id: "anonymous",
    displayName: displayName || "Guest",
    email: null,
    isAuthenticated: false,
    source: "anonymous",
  };
}

function currentLocationSearch(pathname: string, explicitSearch?: string): string | undefined {
  if (explicitSearch !== undefined) return explicitSearch;
  if (pathname.includes("?")) return undefined;
  if (typeof window !== "undefined") return window.location.search || "";
  return "";
}

/** Dashboard/account routes that require a validated session. */
export function isAuthenticatedDashboardSurface(pathname: string, search?: string): boolean {
  const route = matchAppRoute(pathname, currentLocationSearch(pathname, search));
  return route ? routeRequiresAuthenticatedSession(route.access) : false;
}

/** @deprecated Use isAuthenticatedDashboardSurface — kept for older call sites. */
export function isDashboardAccountSurface(pathname: string, search?: string): boolean {
  return isAuthenticatedDashboardSurface(pathname, search);
}

/** Reviewer and signer links stay public — no login redirect. */
export function isPublicTokenAgreementSurface(pathname: string, search?: string): boolean {
  const rawPath = (pathname || "").split("?")[0];
  const p = rawPath.replace(/\/$/, "") || "/";
  if (/^\/agreements\/[^/]+\/(review|sign)$/i.test(p)) return true;
  if (/^\/verify\//i.test(p)) return true;
  if (/^\/app\/verify\/[^/]+$/i.test(p)) return true;
  const route = matchAppRoute(pathname, currentLocationSearch(pathname, search));
  return route?.access === "recipient_token";
}
