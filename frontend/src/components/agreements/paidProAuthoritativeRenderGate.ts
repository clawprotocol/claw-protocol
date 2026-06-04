/**
 * Paid Pro first-review render gate — after SoT acceptance, visible review must show the accepted
 * corpus only (display-only strip), not starter preview, integrity repair, or signature rebuilds.
 */

import { hasAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN,
  readPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import {
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { consumedAuthoritySignerMetadataComplete } from "./paidProSignerMetadataCommitPolicy";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { resolvePaidProFrozenDisplayPlain } from "./paidProPostFreezeCorpusInvariant";
import { isPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";

/** True when review should show frozen SoT only (no signer hydration / sanitizer recompute). */
export function shouldUsePaidProSourceOfTruthDisplayOnly(): boolean {
  if (!hasPaidProSourceOfTruth()) return false;
  if (getPaidProSourceOfTruthText().trim().length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  if (hasAuthoritativeSigningSnapshot()) return false;
  if (readPaidProPinnedSignerAppliedCorpus().trim().length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return false;
  }
  const consumed = readConsumedPaidProSignerMetadataAuthority()?.parties ?? [];
  if (
    consumedAuthoritySignerMetadataComplete(consumed) &&
    !isPaidProReviewSignerMetadataSessionActive()
  ) {
    return false;
  }
  return true;
}

/** Non-mutating display plain for first authoritative Pro review — byte-identical to frozen SoT. */
export function resolvePaidProAuthoritativeDisplayPlain(): string {
  return resolvePaidProFrozenDisplayPlain();
}

export function paidProAuthoritativeRenderGateMeta(): { len: number; hash: string } | null {
  if (!shouldUsePaidProSourceOfTruthDisplayOnly()) return null;
  const text = getPaidProSourceOfTruthText().trim();
  return { len: text.length, hash: hashPaidProCorpus(text) };
}

/** Block integrity/compiler/signature repair and starter preview replacement after acceptance. */
export function shouldBlockPaidProStructuralMutationAfterAcceptance(_surface?: string | null): boolean {
  return shouldUsePaidProSourceOfTruthDisplayOnly();
}

export function paidProSourceOfTruthAcceptedAndValid(): boolean {
  const record = getPaidProSourceOfTruth();
  return Boolean(record && record.text.trim().length >= PAID_PRO_AUTHORITY_MIN_LEN);
}
