/**
 * Current-user adapter for dashboard / workspace surfaces.
 *
 * Org headers and workspace slugs are NEVER proof of authentication.
 * Authenticated state requires a validated Supabase session (or explicit e2e/dev test bridge),
 * OR the checkout-created demo session user (receipt persist already trusts).
 */

import { getOrgId } from "../launch/orgContext";
import { readE2eAuthSessionForDev } from "../auth/e2eAuthSessionBridge";
import { isPublicProductionHostname } from "../launch/devPaymentBypass";
import { readDemoSessionUser } from "../launch/guestCheckoutAuthority";

export type CurrentUserSource = "supabase_session" | "e2e_test_bridge" | "demo_checkout" | "anonymous";

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
}): CurrentUser {
  const displayName = readStoredDisplayName();
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

  // Org header / local-org is workspace context only — never authentication.
  void getOrgId();
  return {
    id: "anonymous",
    displayName: displayName || "Guest",
    email: null,
    isAuthenticated: false,
    source: "anonymous",
  };
}

/** Dashboard/account routes that require a validated session. */
export function isAuthenticatedDashboardSurface(pathname: string): boolean {
  const p = (pathname || "").replace(/\/$/, "") || "/";
  if (p === "/app" || p === "/dashboard") return true;
  if (p === "/app/create") return true;
  if (p === "/app/billing" || p === "/app/settings" || p === "/app/signatures") return true;
  if (p === "/app/affiliate" || p === "/app/opportunity" || p === "/app/agreement-memory") return true;
  if (p === "/app/integrations" || p === "/app/work-product") return true;
  if (p === "/app/genesis-referral") return true;
  if (p.startsWith("/app/ops/")) return true;
  if (p === "/app/admin" || p === "/app/founder" || p === "/founder" || p === "/admin") return true;
  if (p === "/app/agreements" || p.startsWith("/app/agreements/")) return true;
  if (p.startsWith("/app/done/") || p.startsWith("/app/ready/") || p.startsWith("/app/send/")) return true;
  if (p.startsWith("/app/checkout/") || p.startsWith("/app/review-changes/")) return true;
  if (p.startsWith("/app/agreements/") && p.includes("/signing-status")) return true;
  return false;
}

/** @deprecated Use isAuthenticatedDashboardSurface — kept for older call sites. */
export function isDashboardAccountSurface(pathname: string): boolean {
  return isAuthenticatedDashboardSurface(pathname);
}

/** Reviewer and signer links stay public — no login redirect. */
export function isPublicTokenAgreementSurface(pathname: string): boolean {
  const p = (pathname || "").replace(/\/$/, "") || "/";
  if (/^\/agreements\/[^/]+\/review$/i.test(p)) return true;
  if (/^\/verify\//i.test(p)) return true;
  if (/^\/app\/esign\/[^/]+$/i.test(p) && p !== "/app/esign/new") return true;
  if (typeof window !== "undefined") {
    if (/^\/app\/agreements\/[^/]+$/i.test(p) && /\?.*(?:^|&)(?:t|token)=/i.test(window.location.search)) {
      return true;
    }
  }
  return false;
}
