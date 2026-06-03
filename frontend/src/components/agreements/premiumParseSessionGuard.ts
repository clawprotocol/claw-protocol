/**
 * Session guard: once authoritative server_full_document_text is accepted for this checkout
 * pass, do not treat a late premium_parse_timeout as grounds for a full pipeline retry.
 */

let authoritativeServerCorpusAccepted = false;

export function markPremiumAuthoritativeServerCorpusAccepted(): void {
  authoritativeServerCorpusAccepted = true;
}

export function clearPremiumParseSessionGuard(): void {
  authoritativeServerCorpusAccepted = false;
}

export function premiumAuthoritativeServerCorpusAccepted(): boolean {
  return authoritativeServerCorpusAccepted;
}

export function isPremiumParseTimeoutError(err: unknown): boolean {
  if (err == null) return false;
  if (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") {
    const reason = String((err as DOMException & { cause?: unknown }).cause ?? "");
    if (reason.includes("premium_parse_timeout")) return true;
  }
  const em = err instanceof Error ? err.message : String(err);
  if (em.includes("premium_parse_timeout")) return true;
  if (/AbortError/i.test(em) && /premium_parse_timeout/i.test(em)) return true;
  return false;
}

/** Parse timeout on attempt 0 — defer retry copy; stay on extended-wait path. */
export function isPremiumParseTimeoutDeferredCheckoutRetry(err: unknown): boolean {
  return isPremiumParseTimeoutError(err);
}

export function shouldSuppressPremiumPipelineRetryAfterAuthoritativeAccept(err: unknown): boolean {
  if (!authoritativeServerCorpusAccepted) return false;
  const em = err instanceof Error ? err.message : String(err ?? "");
  return (
    isPremiumParseTimeoutError(err) ||
    em.includes("premium_completion_attempt_timeout_") ||
    em.includes("AbortError")
  );
}
