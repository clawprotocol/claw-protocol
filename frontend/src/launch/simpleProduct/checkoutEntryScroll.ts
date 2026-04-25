/**
 * Checkout entry: SPA navigations use `history.pushState` without resetting scroll,
 * so leaving a long create/review surface keeps `window.scrollY` — users land mid-page.
 * Call this whenever the app navigates to `/app/checkout/...` or when checkout mounts.
 */

export function isSimpleCheckoutPath(pathOnly: string): boolean {
  return /^\/app\/checkout\//.test(pathOnly);
}

/** Synchronous scroll reset for window + common document roots (no layout thrash). */
export function resetCheckoutEntryScroll(): void {
  if (typeof window === "undefined") return;
  window.scrollTo(0, 0);
  if (typeof document === "undefined") return;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
