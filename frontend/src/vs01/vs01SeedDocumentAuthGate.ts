/**
 * Cold-open `/app/esign/:doc?agreement_bridge=1` must not fetch document content
 * until AuthProvider has finished hydrating the in-memory access-token cache.
 * Otherwise clawAgreementHeaders omits Authorization and the wizard shows
 * "Could not load this document" even when GET /v1/documents/{id}/content is 200.
 */
export function shouldDeferVs01SeedDocumentLoad(args: {
  authEnabled: boolean;
  authLoading: boolean;
}): boolean {
  return Boolean(args.authEnabled && args.authLoading);
}
