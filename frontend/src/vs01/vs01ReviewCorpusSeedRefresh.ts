/**
 * Prepare reuse must not lock a stale starter/template packet onto placement.
 *
 * #141 `reuse_seeded_vs01_document` kept doc_e959491f (and its stored seed)
 * when Prepare remounted. That seed was minted from a links-ready jump and
 * stored "Draft Agreement (non-binding template)" instead of the paid-Pro
 * Review corpus. Placement then painted the template.
 *
 * Same persist / same vs01 document id: replace stored seed content from
 * the Review SoT. Do not remint the agreement. Matching Review seeds reuse.
 */

import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { clearVs01DraftState } from "./vs01DraftStatePersist";
import {
  buildVs01CanonicalPacketSeed,
  clearVs01CanonicalPacketPortable,
  loadVs01CanonicalPacketPortable,
  loadVs01CanonicalPacketSeed,
  storeVs01CanonicalPacketSeed,
} from "./vs01CanonicalPacketSeed";
import {
  pickCurrentReviewSotForSigningSeed,
} from "./vs01CurrentReviewSotForSeed";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

export const FIRST_FAILING_STALE_TEMPLATE_SEED_PREDICATE =
  "reuse_seeded_vs01_document_keeps_stale_template_body" as const;

export const REFRESH_STALE_SEEDED_DOCUMENT_REASON =
  "refresh_stale_template_seed_from_review_sot" as const;

export const REUSE_MATCHING_SEEDED_DOCUMENT_REASON = "reuse_seeded_vs01_document" as const;

const NON_BINDING_TEMPLATE_BANNER_RE =
  /Draft Agreement\s*\(\s*non[- ]binding template\s*\)/i;

export function isNonBindingDraftTemplateCorpus(text: string | null | undefined): boolean {
  return NON_BINDING_TEMPLATE_BANNER_RE.test((text ?? "").trim());
}

export function seededPacketMatchesReviewCorpus(
  storedPlain: string | null | undefined,
  reviewPlain: string | null | undefined,
): boolean {
  const stored = (storedPlain ?? "").trim();
  const review = (reviewPlain ?? "").trim();
  if (!stored || !review) return false;
  if (review.length < VS01_SIGNING_CORPUS_MIN_LEN) return false;
  if (isNonBindingDraftTemplateCorpus(stored) && !isNonBindingDraftTemplateCorpus(review)) {
    return false;
  }
  return fingerprintAgreementBody(stored) === fingerprintAgreementBody(review);
}

export function pickAuthoritativePrepareHandoffCorpus(
  candidates: readonly (string | null | undefined)[],
): string {
  return pickCurrentReviewSotForSigningSeed(candidates);
}

export type SeededDocumentReuseDecision = {
  documentId: string;
  reason: typeof REUSE_MATCHING_SEEDED_DOCUMENT_REASON | typeof REFRESH_STALE_SEEDED_DOCUMENT_REASON;
  refreshed: boolean;
  storedWasTemplate: boolean;
};

function storedSeededCorpusPlain(documentId: string, existingBridgeCorpus?: string | null): string {
  const fromSeed = (loadVs01CanonicalPacketSeed(documentId)?.corpusPlain ?? "").trim();
  if (fromSeed) return fromSeed;
  const fromPortable = (loadVs01CanonicalPacketPortable(documentId)?.seed.corpusPlain ?? "").trim();
  if (fromPortable) return fromPortable;
  return (existingBridgeCorpus ?? "").trim();
}

/**
 * Keep the seeded vs01 document id. Replace stored packet content when it is a
 * non-binding template or otherwise diverges from the Review SoT.
 */
export function resolveSeededDocumentReuseFromReviewCorpus(args: {
  agreementId: string;
  existingDocumentId: string;
  reviewCorpus: string;
  existingBridgeCorpus?: string | null;
}): SeededDocumentReuseDecision {
  const documentId = args.existingDocumentId.trim();
  const agreementId = args.agreementId.trim();
  const reviewCorpus = args.reviewCorpus.trim();
  const stored = storedSeededCorpusPlain(documentId, args.existingBridgeCorpus);
  const storedWasTemplate = isNonBindingDraftTemplateCorpus(stored);
  const matches = seededPacketMatchesReviewCorpus(stored, reviewCorpus);

  if (matches && reviewCorpus.length >= VS01_SIGNING_CORPUS_MIN_LEN) {
    return {
      documentId,
      reason: REUSE_MATCHING_SEEDED_DOCUMENT_REASON,
      refreshed: false,
      storedWasTemplate: false,
    };
  }

  if (reviewCorpus.length >= VS01_SIGNING_CORPUS_MIN_LEN) {
    const seed = buildVs01CanonicalPacketSeed({
      documentId,
      agreementId,
      corpusPlain: reviewCorpus,
    });
    if (seed) storeVs01CanonicalPacketSeed(seed);
    clearVs01CanonicalPacketPortable(documentId);
    if (storedWasTemplate || (stored && !matches)) {
      clearVs01DraftState(documentId, REFRESH_STALE_SEEDED_DOCUMENT_REASON);
    }
    return {
      documentId,
      reason: REFRESH_STALE_SEEDED_DOCUMENT_REASON,
      refreshed: true,
      storedWasTemplate,
    };
  }

  return {
    documentId,
    reason: REUSE_MATCHING_SEEDED_DOCUMENT_REASON,
    refreshed: false,
    storedWasTemplate,
  };
}
