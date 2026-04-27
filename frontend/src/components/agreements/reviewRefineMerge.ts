import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { mergeParsedPreferRicher } from "./fullDraftUpgradeEnrich";

/**
 * After a persisted /refine response, merge the API draft with the in-memory draft so
 * Pro-only fields and any structured edge cases survive when the response omits them.
 */
export function mergeProPreservingRefineParsed(prior: ParsedDraftShape, coerced: ParsedDraftShape): ParsedDraftShape {
  const merged = mergeParsedPreferRicher(prior, coerced);
  return {
    ...merged,
    premium_full_document_text: coerced.premium_full_document_text ?? prior.premium_full_document_text,
    premium_server_full_document_text: coerced.premium_server_full_document_text ?? prior.premium_server_full_document_text,
    premium_server_repair_document_text: coerced.premium_server_repair_document_text ?? prior.premium_server_repair_document_text,
    premium_full_draft_key_terms: coerced.premium_full_draft_key_terms ?? prior.premium_full_draft_key_terms,
    premium_full_draft_missing_info: coerced.premium_full_draft_missing_info ?? prior.premium_full_draft_missing_info,
    material_asks: coerced.material_asks ?? prior.material_asks,
  };
}
