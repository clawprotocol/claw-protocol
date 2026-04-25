/**
 * Operator-maintained Doginal / affiliate profile shape (bundled registry).
 * Do not put secrets in `doginal_notes` — the bundle is public.
 *
 * Operator actions (edit `doginalAffiliateRegistry.json` and redeploy):
 * - Downgrade Doginal → regular: set `affiliate_mode` to `"regular"` OR `doginal_claim_status` to `"removed"`.
 * - Mark claimed / verified: set `doginal_claim_status` accordingly; set `doginal_verification_method`.
 */

import type { AffiliateLandingColorKey } from "./affiliateLandingPaletteKeys";

export type AffiliateRegistryMode = "regular" | "doginal";

/** Claim / moderation state for Doginal-linked pages only. */
export type DoginalClaimStatus = "none" | "claimed" | "verified" | "removed";

export type DoginalVerificationMethod = "none" | "manual_review" | "metadata_lookup";

export type DoginalAffiliateProfileRecord = {
  username_slug: string;
  /** Default `doginal` for rows under `profiles`; set `regular` to force affiliate-style UX on `/doginal/…`. */
  affiliate_mode?: AffiliateRegistryMode;
  doginal_claim_status?: DoginalClaimStatus;
  doginal_number?: string | null;
  doginal_inscription_id?: string | null;
  doginal_marketplace_url?: string | null;
  /** Pastel key; must match {@link AffiliateLandingColorKey} when set. */
  doginal_color?: AffiliateLandingColorKey | string | null;
  doginal_verification_method?: DoginalVerificationMethod;
  /** Internal operator notes only — still shipped in bundle; no secrets. */
  doginal_notes?: string | null;
  /** Operator override when metadata fetch is not wired (optional). */
  doginal_image_url?: string | null;
};

export type DoginalAffiliateRegistryFile = {
  profiles: Record<string, DoginalAffiliateProfileRecord>;
};

/** Safe subset for UI + analytics (no notes). */
export type DoginalAffiliateProfilePublic = Omit<DoginalAffiliateProfileRecord, "doginal_notes">;
