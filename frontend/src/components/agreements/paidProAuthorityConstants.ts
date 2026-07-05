/**
 * Dependency-free paid Pro authority length floors.
 * Keeps send handoff, runtime authority, VS01, and SOT modules from circular imports.
 */

/** Minimum length to treat plain text as authoritative Pro/full-draft handoff (not starter stub). */
export const SEND_HANDOFF_AUTHORITATIVE_MIN_LEN = 500;

/** Same floor as send handoff — minimum material Pro corpus for runtime authority. */
export const PAID_PRO_RUNTIME_AUTHORITY_MIN_LEN = SEND_HANDOFF_AUTHORITATIVE_MIN_LEN;

/** Alias used across agreement authority and create-flow shell modules. */
export const PAID_PRO_AUTHORITY_MIN_LEN = SEND_HANDOFF_AUTHORITATIVE_MIN_LEN;

export type PremiumPipelineCorpusDraftLike = {
  premium_full_document_text?: string | null;
  premium_server_full_document_text?: string | null;
  server_full_document_text?: string | null;
};

/** Max length among premium / server pipeline body fields. */
export function materialPremiumPipelineCorpusMaxLen(
  draft: PremiumPipelineCorpusDraftLike | null | undefined,
): number {
  if (!draft) return 0;
  const xs = [
    String(draft.premium_full_document_text ?? "").trim(),
    String(draft.premium_server_full_document_text ?? "").trim(),
    String(draft.server_full_document_text ?? "").trim(),
  ];
  return xs.reduce((m, t) => (t.length > m ? t.length : m), 0);
}

export function hasMaterialPremiumPipelineCorpus(
  draft: PremiumPipelineCorpusDraftLike | null | undefined,
): boolean {
  return materialPremiumPipelineCorpusMaxLen(draft) >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN;
}
