import type { AffiliateLandingMode } from "./affiliateLandingTypes";

export type AffiliateLandingMatch = {
  mode: AffiliateLandingMode;
  /** Normalized handle for URLs and analytics (`a-z`, `0-9`, `_`, `-`). */
  usernameSlug: string;
};

/** Strip query/hash and trailing slash for path matching. */
export function normalizeMarketingPath(pathname: string): string {
  return (pathname || "/").split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
}

/**
 * Sanitize path segment into a safe affiliate handle.
 * Returns `null` if nothing usable remains (invalid landing → caller should 404 to home).
 */
export function sanitizeAffiliateUsernameSlug(segment: string): string | null {
  let raw: string;
  try {
    raw = decodeURIComponent(segment);
  } catch {
    return null;
  }
  const s = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  if (!s) return null;
  return s.length > 56 ? s.slice(0, 56) : s;
}

/**
 * MVP affiliate / Doginal landing routes (URL-only; no editor).
 * - `/@{username}` — generic affiliate identity surface
 * - `/doginal/{username}` — Doginal Dogs–styled surface (same component, `mode: doginal`)
 */
export function parseAffiliateLandingPath(pathname: string): AffiliateLandingMatch | null {
  const p = normalizeMarketingPath(pathname);

  const dogM = /^\/doginal\/([^/]+)$/.exec(p);
  if (dogM) {
    const usernameSlug = sanitizeAffiliateUsernameSlug(dogM[1]);
    if (!usernameSlug) return null;
    return { mode: "doginal", usernameSlug };
  }

  const atM = /^\/@([^/]+)$/.exec(p);
  if (atM) {
    const usernameSlug = sanitizeAffiliateUsernameSlug(atM[1]);
    if (!usernameSlug) return null;
    return { mode: "affiliate", usernameSlug };
  }

  return null;
}
