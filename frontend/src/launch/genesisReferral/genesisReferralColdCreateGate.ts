/**
 * Cold-visitor gate for Genesis referral links (`/app/create?ref=CODE`).
 * Unauthenticated visitors should not hit workspace entitlement probes — send them
 * to sign-in while preserving the referral code for post-auth return + attribution.
 */

import {
  buildGenesisReferralLink,
  captureGenesisReferralFromSearch,
  normalizeGenesisReferralCode,
} from "./genesisReferralCapture";
import { resolveSignInContinuationDestination } from "../../auth/safeRedirectResolver";

export function referralCodeFromCreateSearch(search: string): string | null {
  try {
    const q = new URLSearchParams(search || "");
    return normalizeGenesisReferralCode(q.get("ref"));
  } catch {
    return null;
  }
}

export function buildGenesisReferralCreateDestination(code: string): string {
  const normalized = normalizeGenesisReferralCode(code);
  if (!normalized) return "/app/create";
  // Path-only (no origin) for auth continuation / next= allowlist.
  return `/app/create?ref=${encodeURIComponent(normalized)}`;
}

export function buildColdReferralSignInPath(code: string): string {
  const dest = buildGenesisReferralCreateDestination(code);
  return `/app/sign-in?next=${encodeURIComponent(dest)}`;
}

/**
 * When a cold (signed-out) visitor opens `/app/create?ref=CODE`, redirect to sign-in.
 * Pure decision — caller should `captureGenesisReferralFromSearch` before navigating.
 */
export function resolveColdReferralCreateRedirect(args: {
  authLoading: boolean;
  isAuthenticated: boolean;
  search: string;
}): { redirectTo: string; referralCode: string } | null {
  if (args.authLoading || args.isAuthenticated) return null;
  const fromUrl = referralCodeFromCreateSearch(args.search);
  if (!fromUrl) return null;
  return {
    referralCode: fromUrl,
    redirectTo: buildColdReferralSignInPath(fromUrl),
  };
}

/** Persist referral from create search, then return the sign-in redirect if cold. */
export function prepareColdReferralCreateRedirect(args: {
  authLoading: boolean;
  isAuthenticated: boolean;
  search: string;
  pathname?: string;
}): { redirectTo: string; referralCode: string } | null {
  const gate = resolveColdReferralCreateRedirect(args);
  if (!gate) return null;
  captureGenesisReferralFromSearch(args.search, args.pathname ?? "/app/create");
  return gate;
}

/** Resolve `?next=` on the sign-in page to an allowlisted internal path. */
export function resolveSignInNextDestination(
  search: string,
  fallback = "/app",
): string {
  return resolveSignInContinuationDestination(search, fallback);
}

/** Absolute referral link helper retained for ops/docs; cold gate uses path-only dest. */
export function absoluteGenesisReferralCreateLink(code: string, origin?: string): string {
  return buildGenesisReferralLink(code, origin);
}
