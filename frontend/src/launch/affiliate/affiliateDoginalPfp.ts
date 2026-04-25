/**
 * MVP: remote pixel PFP by handle. Set `VITE_DOGINAL_PFP_URL_TEMPLATE` with `{username}` when the
 * Doginal Dogs CDN path is finalized (e.g. `https://cdn.example/pfp/{username}.png`).
 */
export function resolveDoginalPfpUrl(sanitizedUsername: string): string {
  const tpl = String(import.meta.env.VITE_DOGINAL_PFP_URL_TEMPLATE ?? "").trim();
  if (tpl.includes("{username}")) {
    return tpl.replace(/\{username\}/g, encodeURIComponent(sanitizedUsername));
  }
  return `https://doginal.dog/pfp/${encodeURIComponent(sanitizedUsername)}.png`;
}
