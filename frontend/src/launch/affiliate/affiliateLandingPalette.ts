import { LAWDOG_AFFILIATE_PASTELS } from "../../design/tokens";
import type { AffiliateLandingColorKey } from "./affiliateLandingPaletteKeys";

export type { AffiliateLandingColorKey };

/** Fixed pastel palette — hex from {@link LAWDOG_AFFILIATE_PASTELS} in design tokens. */
export const AFFILIATE_LANDING_COLORS: Record<AffiliateLandingColorKey, string> = LAWDOG_AFFILIATE_PASTELS;

const ALLOWED = new Set<string>(Object.keys(AFFILIATE_LANDING_COLORS));

/**
 * Parse `?color=` from a search string. Invalid or missing → `"aqua"`.
 */
export function parseAffiliateLandingColorParam(search: string): AffiliateLandingColorKey {
  const q = search.startsWith("?") ? search.slice(1) : search.replace(/^\?/, "");
  const raw = new URLSearchParams(q).get("color");
  if (raw == null) return "aqua";
  const k = raw.trim().toLowerCase();
  if (ALLOWED.has(k)) return k as AffiliateLandingColorKey;
  return "aqua";
}

/**
 * Query wins when valid. Invalid `?color=` falls through to registry, then `"aqua"`.
 */
export function resolveAffiliateLandingColorKey(
  search: string,
  registryPastelKey: string | null | undefined
): AffiliateLandingColorKey {
  const q = search.startsWith("?") ? search.slice(1) : search.replace(/^\?/, "");
  const raw = new URLSearchParams(q).get("color");
  if (raw != null && raw.trim()) {
    const k = raw.trim().toLowerCase();
    if (ALLOWED.has(k)) return k as AffiliateLandingColorKey;
  }
  if (registryPastelKey != null && typeof registryPastelKey === "string") {
    const rk = registryPastelKey.trim().toLowerCase();
    if (ALLOWED.has(rk)) return rk as AffiliateLandingColorKey;
  }
  return "aqua";
}
