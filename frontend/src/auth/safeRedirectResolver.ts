/**
 * Allowlisted internal destinations for post-auth redirect (no open redirects).
 */

import { CREATE_FLOW_CHECKOUT_AGREEMENT_ID } from "../components/agreements/agreementAdvancedDraftAccess";
import type { AuthContinuationContextV1 } from "./authContinuationContext";
import { pinCheckoutPathToPreAuthAgreement, rememberPreAuthCheckoutAgreementId } from "./preAuthCheckoutAgreement";

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
  const noQuery = p.split("?")[0] || "";
  return noQuery === "/app/checkout" || noQuery.startsWith("/app/checkout/");
}

/** Real checkout agreement id — never the create-flow sentinel. */
export function extractAgreementIdFromCheckoutPath(path: string): string | null {
  const raw = (path || "").trim();
  const noQuery = raw.split("?")[0] || "";
  const prefix = "/app/checkout/";
  if (!noQuery.startsWith(prefix)) return null;
  let id = noQuery.slice(prefix.length).split("/")[0] || "";
  try {
    id = decodeURIComponent(id).trim();
  } catch {
    id = id.trim();
  }
  if (!id || id === CREATE_FLOW_CHECKOUT_AGREEMENT_ID) return null;
  return id;
}

export type SignInContinuationOpts = {
  returningSignIn: boolean;
  destinationPath: string;
  agreementId?: string;
};

/**
 * Homepage / dashboard sign-in stays returning.
 * Checkout continuation is a claim: keep the pre-auth agreement through Google.
 */
export function resolveSignInContinuationOpts(destinationPath: string): SignInContinuationOpts {
  const dest = (destinationPath || "/app").trim() || "/app";
  const checkout = isSecureCheckoutPath(dest);
  const fromPath = extractAgreementIdFromCheckoutPath(dest) ?? undefined;
  const agreementId = rememberPreAuthCheckoutAgreementId(fromPath) ?? fromPath;
  const pinned = agreementId ? pinCheckoutPathToPreAuthAgreement(dest, agreementId) : dest;
  return {
    returningSignIn: !checkout,
    destinationPath: pinned,
    ...(agreementId ? { agreementId } : {}),
  };
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
  const aid = (ctx.agreementId || "").trim();
  if (aid && dest.startsWith("/app/create") && !dest.includes("agreementId=")) {
    const sep = dest.includes("?") ? "&" : "?";
    return `${dest}${sep}agreementId=${encodeURIComponent(aid)}`;
  }
  if (aid && aid !== CREATE_FLOW_CHECKOUT_AGREEMENT_ID && dest.startsWith("/app/checkout/")) {
    rememberPreAuthCheckoutAgreementId(aid);
    return pinCheckoutPathToPreAuthAgreement(dest, aid);
  }
  return dest;
}
