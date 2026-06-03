/**
 * Skip optional post-accept advisory HTTP when Paid Pro authority is already locked.
 * Instrumentation only — does not alter SoT, review render, or signing paths.
 */

import {
  getFrozenCanonicalAgreementCorpus,
  hasFrozenCanonicalAgreementCorpus,
  readAuthoritativeCorpusInvariant,
} from "./canonicalAgreementSnapshot";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { shouldLogPremiumAdvisorySkipDiagnostic } from "./paidProDiagnosticLogPolicy";
import {
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";

export type PremiumAdvisorySkipAfterAuthorityReason =
  | "no_paid_pro_sot"
  | "no_frozen_canonical"
  | "sot_too_short"
  | "sot_hash_mismatch"
  | "review_plain_too_short"
  | "invariant_not_ok"
  | "skip";

export function evaluatePremiumAdvisorySkipAfterAuthoritativeAccept(): {
  skip: boolean;
  reason: PremiumAdvisorySkipAfterAuthorityReason;
  canonicalHash: string | null;
  reviewLen: number;
  sotLen: number;
} {
  if (!hasPaidProSourceOfTruth()) {
    return { skip: false, reason: "no_paid_pro_sot", canonicalHash: null, reviewLen: 0, sotLen: 0 };
  }
  if (!hasFrozenCanonicalAgreementCorpus()) {
    return { skip: false, reason: "no_frozen_canonical", canonicalHash: null, reviewLen: 0, sotLen: 0 };
  }
  const frozen = getFrozenCanonicalAgreementCorpus();
  const canonicalHash = (frozen?.hash || "").trim() || null;
  const sotText = getPaidProSourceOfTruthText().trim();
  const sotLen = sotText.length;
  if (sotLen < PAID_PRO_AUTHORITY_MIN_LEN) {
    return { skip: false, reason: "sot_too_short", canonicalHash, reviewLen: 0, sotLen };
  }
  const sotHash = hashPaidProCorpus(sotText);
  if (!canonicalHash || sotHash !== canonicalHash) {
    return { skip: false, reason: "sot_hash_mismatch", canonicalHash, reviewLen: 0, sotLen };
  }
  const reviewPlain = resolvePaidProReviewRenderPlain().trim();
  const reviewLen = reviewPlain.length;
  if (reviewLen < PAID_PRO_AUTHORITY_MIN_LEN) {
    return { skip: false, reason: "review_plain_too_short", canonicalHash, reviewLen, sotLen };
  }
  const reviewHash = hashPaidProCorpus(reviewPlain);
  const invariant = readAuthoritativeCorpusInvariant({
    canonicalHash,
    reviewHash,
    signerHash: sotHash,
    reviewerHash: canonicalHash,
  });
  if (!invariant.invariantOk) {
    return { skip: false, reason: "invariant_not_ok", canonicalHash, reviewLen, sotLen };
  }
  return { skip: true, reason: "skip", canonicalHash, reviewLen, sotLen };
}

export function shouldSkipPremiumAdvisoryAfterAuthoritativeAccept(): boolean {
  return evaluatePremiumAdvisorySkipAfterAuthoritativeAccept().skip;
}

export function logPremiumAdvisorySkipAfterAuthority(payload: {
  canonicalHash: string | null;
  reviewLen: number;
  sotLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (!shouldLogPremiumAdvisorySkipDiagnostic()) return;
  // eslint-disable-next-line no-console
  console.info("[premium-advisory-skip-after-authority]", payload);
}
