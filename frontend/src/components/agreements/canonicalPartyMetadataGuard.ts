/**
 * Guards ensuring agreement body / AI prose cannot mutate canonical party metadata.
 */

export const CANONICAL_DISPLAY_ONLY_INFERENCE_SOURCES = [
  "ai_generated_corpus",
  "generated_corpus_inference",
  "notice_stanza_inference",
  "execution_block_inference",
  "agreement_body_parse",
] as const;

export type CanonicalDisplayOnlyInferenceSource =
  (typeof CANONICAL_DISPLAY_ONLY_INFERENCE_SOURCES)[number];

export type CanonicalMutableMutationSource =
  | "structured_intake"
  | "user_edited_ui"
  | "freeze_snapshot"
  | "signer_setup_form"
  | "signing_audit_event"
  | "session_restoration";

let corpusCanonicalMutationGuardEnabled = false;

export function enableCorpusCanonicalMutationGuardForTests(enabled = true): void {
  corpusCanonicalMutationGuardEnabled = enabled;
}

export function isCorpusCanonicalMutationGuardEnabled(): boolean {
  return corpusCanonicalMutationGuardEnabled;
}

export function isDisplayOnlyCanonicalInferenceSource(
  source: string | null | undefined,
): source is CanonicalDisplayOnlyInferenceSource {
  const s = String(source ?? "").trim().toLowerCase();
  return (CANONICAL_DISPLAY_ONLY_INFERENCE_SOURCES as readonly string[]).includes(s);
}

/** Throws in test guard mode when agreement-body inference attempts canonical mutation. */
export function assertCanonicalMetadataNotFromAgreementBody(source: string): void {
  if (!corpusCanonicalMutationGuardEnabled) return;
  if (!isDisplayOnlyCanonicalInferenceSource(source)) return;
  throw new Error(
    `[canonical-party-metadata-guard] agreement body inference source "${source}" cannot mutate canonical metadata`,
  );
}

export function rejectCorpusSourceForCanonicalMutation<T>(
  source: string,
  value: T,
): T | null {
  assertCanonicalMetadataNotFromAgreementBody(source);
  if (isDisplayOnlyCanonicalInferenceSource(source)) return null;
  return value;
}
