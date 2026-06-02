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

export function shouldSuppressPremiumPipelineRetryAfterAuthoritativeAccept(err: unknown): boolean {
  if (!authoritativeServerCorpusAccepted) return false;
  const em = err instanceof Error ? err.message : String(err ?? "");
  return (
    em.includes("premium_parse_timeout") ||
    em.includes("premium_completion_attempt_timeout_") ||
    em.includes("AbortError")
  );
}
