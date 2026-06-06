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
import { resolvePaidProFrozenDisplayPlain } from "./paidProPostFreezeCorpusInvariant";
import type { ResolvePaidProReviewRenderPartiesArgs } from "./paidProReviewRenderParties";

export type ResolvePaidProAuthoritativeDisplayPlainArgs = ResolvePaidProReviewRenderPartiesArgs;

/** True when review should show frozen SoT only (no signer hydration / sanitizer recompute). */
export function shouldUsePaidProSourceOfTruthDisplayOnly(): boolean {
  if (!hasPaidProSourceOfTruth()) return false;
  if (getPaidProSourceOfTruthText().trim().length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  if (hasAuthoritativeSigningSnapshot()) return false;
  if (readPaidProPinnedSignerAppliedCorpus().trim().length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return false;
  }
  return true;
}

/** Frozen SoT plain — byte-aligned with canonical freeze (HTML may add visual-only formatting). */
export function resolvePaidProAuthoritativeDisplayPlain(
  _args?: ResolvePaidProAuthoritativeDisplayPlainArgs,
): string {
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
