import type { AffiliateLandingMode } from "./affiliateLandingTypes";
import { AFFILIATE_LANDING_COLORS, resolveAffiliateLandingColorKey } from "./affiliateLandingPalette";
import type { AffiliateLandingColorKey } from "./affiliateLandingPaletteKeys";
import type { DoginalAffiliateProfilePublic, DoginalClaimStatus } from "./affiliateProfileTypes";
import { getDoginalAffiliateProfilePublic } from "./doginalAffiliateRegistry.load";

const MAX_TRAFFIC_LABEL = 64;

export type DoginalUxTier = "none" | "claimed" | "verified";

/** Analytics-safe Doginal band for this paint. */
export type AffiliateDoginalAnalyticsStatus = "n/a" | "none" | "claimed" | "verified" | "removed_fallback";

export type ResolvedAffiliateLandingView = {
  /** What we actually render: doginal chrome vs regular affiliate chrome. */
  effectiveTheme: AffiliateLandingMode;
  /** Claim / verified messaging when `effectiveTheme === "doginal"`. */
  doginalUxTier: DoginalUxTier;
  wasDoginalPathDowngraded: boolean;
  colorKey: AffiliateLandingColorKey;
  accentHex: string;
  trafficSourceForCta: string;
  usernameSlug: string;
  pathMode: AffiliateLandingMode;
  analyticsDoginalStatus: AffiliateDoginalAnalyticsStatus;
  /** Prefer registry image URL, else null (caller uses default PFP resolver). */
  pfpImageOverrideUrl: string | null;
};

function trafficSourceKey(prefix: "doginal" | "affiliate", usernameSlug: string): string {
  const maxSlug = Math.max(1, MAX_TRAFFIC_LABEL - prefix.length - 1);
  const slug = usernameSlug.slice(0, maxSlug);
  return `${prefix}_${slug}`;
}

function normalizeClaimStatus(raw: DoginalClaimStatus | undefined): DoginalClaimStatus {
  return raw ?? "none";
}

/**
 * Pure resolver for tests and tooling — pass `profile` from registry (or `null`).
 */
export function resolveAffiliateLandingViewWithProfile(params: {
  pathMode: AffiliateLandingMode;
  usernameSlug: string;
  search: string;
  profile: DoginalAffiliateProfilePublic | null;
}): ResolvedAffiliateLandingView {
  const { pathMode, usernameSlug, search, profile } = params;

  const colorKey = resolveAffiliateLandingColorKey(search, profile?.doginal_color ?? null);
  const accentHex = AFFILIATE_LANDING_COLORS[colorKey];

  if (pathMode === "affiliate") {
    return {
      effectiveTheme: "affiliate",
      doginalUxTier: "none",
      wasDoginalPathDowngraded: false,
      colorKey,
      accentHex,
      trafficSourceForCta: trafficSourceKey("affiliate", usernameSlug),
      usernameSlug,
      pathMode,
      analyticsDoginalStatus: "n/a",
      pfpImageOverrideUrl: profile?.doginal_image_url?.trim() || null,
    };
  }

  const claim = normalizeClaimStatus(profile?.doginal_claim_status);
  const affiliateMode = profile?.affiliate_mode ?? "doginal";
  const downgrade = claim === "removed" || affiliateMode === "regular";

  if (downgrade) {
    return {
      effectiveTheme: "affiliate",
      doginalUxTier: "none",
      wasDoginalPathDowngraded: true,
      colorKey,
      accentHex,
      trafficSourceForCta: trafficSourceKey("affiliate", usernameSlug),
      usernameSlug,
      pathMode,
      analyticsDoginalStatus: "removed_fallback",
      pfpImageOverrideUrl: profile?.doginal_image_url?.trim() || null,
    };
  }

  let doginalUxTier: DoginalUxTier = "none";
  if (claim === "verified") doginalUxTier = "verified";
  else if (claim === "claimed") doginalUxTier = "claimed";

  return {
    effectiveTheme: "doginal",
    doginalUxTier,
    wasDoginalPathDowngraded: false,
    colorKey,
    accentHex,
    trafficSourceForCta: trafficSourceKey("doginal", usernameSlug),
    usernameSlug,
    pathMode,
    analyticsDoginalStatus:
      doginalUxTier === "verified" ? "verified" : doginalUxTier === "claimed" ? "claimed" : "none",
    pfpImageOverrideUrl: profile?.doginal_image_url?.trim() || null,
  };
}

/**
 * Combines URL path, query `?color=`, and bundled operator registry into a single render model.
 * Never throws — invalid registry rows fall back to safe defaults.
 */
export function resolveAffiliateLandingView(params: {
  pathMode: AffiliateLandingMode;
  usernameSlug: string;
  search: string;
}): ResolvedAffiliateLandingView {
  const profile = getDoginalAffiliateProfilePublic(params.usernameSlug) ?? null;
  return resolveAffiliateLandingViewWithProfile({ ...params, profile });
}
