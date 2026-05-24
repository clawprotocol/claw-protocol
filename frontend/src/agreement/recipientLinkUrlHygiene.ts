const RECIPIENT_TOKEN_QUERY_KEYS = ["t", "token"];

export function sanitizedRecipientLinkSearch(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  for (const key of RECIPIENT_TOKEN_QUERY_KEYS) params.delete(key);
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function stripRecipientAccessTokenQueryFromLocation(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!RECIPIENT_TOKEN_QUERY_KEYS.some((key) => url.searchParams.has(key))) return;
    const safeSearch = sanitizedRecipientLinkSearch(url.search);
    window.history.replaceState(window.history.state, "", `${url.pathname}${safeSearch}${url.hash}`);
  } catch {
    /* ignore */
  }
}
