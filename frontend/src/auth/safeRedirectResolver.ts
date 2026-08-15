/**
 * Allowlisted internal destinations for post-auth redirect (no open redirects).
 */

import type { AuthContinuationContextV1 } from "./authContinuationContext";

const ALLOWED_PREFIXES = [
  "/app/create",
  "/app/checkout/",
  "/app/send",
  "/app/done",
  "/app/settings",
  "/app/billing",
  "/app",
  "/review",
  "/sign",
] as const;

export function isAllowlistedInternalPath(path: string): boolean {
  const p = (path || "").trim();
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//")) return false;
  if (p.includes("://")) return false;
  return ALLOWED_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix));
}

export function resolveSafeRedirectPath(
  candidate: string | null | undefined,
  fallback = "/app",
): string {
  const c = (candidate || "").trim();
  if (c && isAllowlistedInternalPath(c)) return c;
  return fallback;
}

export const CHECKOUT_SIGN_IN_HEADING = "Sign in to continue to secure checkout";
export const CHECKOUT_SIGN_IN_BODY =
  "Your draft is saved. After signing in, you'll return here to choose your plan and complete payment.";
export const CHECKOUT_SIGN_IN_CTA = "Sign in and continue";

export function isSecureCheckoutPath(path: string): boolean {
  const p = (path || "").trim();
  return p === "/app/checkout" || p.startsWith("/app/checkout/");
}

export function buildSignInContinuationPath(pathname: string, search = ""): string {
  const dest = `${(pathname || "").trim()}${(search || "").trim()}`;
  const safe = resolveSafeRedirectPath(dest, "/app");
  return `/app/sign-in?next=${encodeURIComponent(safe)}`;
}

export function resolveSignInContinuationDestination(search: string, fallback = "/app"): string {
  try {
    const q = new URLSearchParams(search || "");
    const next = (q.get("next") || "").trim();
    if (!next) return fallback;
    return resolveSafeRedirectPath(next, fallback);
  } catch {
    return fallback;
  }
}

export function resolvePostAuthDestination(ctx: AuthContinuationContextV1 | null): string {
  if (!ctx) return "/app";
  const dest = resolveSafeRedirectPath(ctx.destinationPath, "/app");
  if (ctx.agreementId && dest.startsWith("/app/create") && !dest.includes("agreementId=")) {
    const sep = dest.includes("?") ? "&" : "?";
    return `${dest}${sep}agreementId=${encodeURIComponent(ctx.agreementId)}`;
  }
  return dest;
}
