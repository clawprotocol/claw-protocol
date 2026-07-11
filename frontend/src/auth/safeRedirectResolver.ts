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

export function resolvePostAuthDestination(ctx: AuthContinuationContextV1 | null): string {
  if (!ctx) return "/app";
  const dest = resolveSafeRedirectPath(ctx.destinationPath, "/app");
  if (ctx.agreementId && dest.startsWith("/app/create") && !dest.includes("agreementId=")) {
    const sep = dest.includes("?") ? "&" : "?";
    return `${dest}${sep}agreementId=${encodeURIComponent(ctx.agreementId)}`;
  }
  return dest;
}
