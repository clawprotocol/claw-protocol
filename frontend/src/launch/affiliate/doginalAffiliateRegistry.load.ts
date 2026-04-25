import type { DoginalAffiliateProfilePublic, DoginalAffiliateRegistryFile } from "./affiliateProfileTypes";
import registryJson from "./doginalAffiliateRegistry.json";

const registry = registryJson as DoginalAffiliateRegistryFile;

/**
 * Registry row for a handle, with `doginal_notes` stripped (still do not store secrets — bundle is public).
 */
export function getDoginalAffiliateProfilePublic(usernameSlug: string): DoginalAffiliateProfilePublic | undefined {
  const row = registry.profiles[usernameSlug];
  if (!row) return undefined;
  return {
    username_slug: (row.username_slug || usernameSlug).trim().toLowerCase(),
    affiliate_mode: row.affiliate_mode,
    doginal_claim_status: row.doginal_claim_status,
    doginal_number: row.doginal_number ?? null,
    doginal_inscription_id: row.doginal_inscription_id ?? null,
    doginal_marketplace_url: row.doginal_marketplace_url ?? null,
    doginal_color: row.doginal_color ?? null,
    doginal_verification_method: row.doginal_verification_method,
    doginal_image_url: row.doginal_image_url ?? null,
  };
}
