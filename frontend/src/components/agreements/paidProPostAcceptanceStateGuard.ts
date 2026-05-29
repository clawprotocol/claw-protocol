/**
 * Guards that prevent paid Pro authority from being torn down by starter/home regen paths.
 */

import {
  hasAcceptedPaidProAuthority,
  type AuthoritativePaidProReviewInput,
} from "./authoritativePaidProReview";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { getPaidProSourceOfTruth, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";

export function shouldBlockStarterRegenerationAfterPaidAuthority(
  input?: AuthoritativePaidProReviewInput,
): boolean {
  return hasPaidProSourceOfTruth() || hasAcceptedPaidProAuthority(input);
}

export function shouldSuppressPremiumProcessingModalAfterPaidAuthority(
  input?: AuthoritativePaidProReviewInput,
): boolean {
  return shouldBlockStarterRegenerationAfterPaidAuthority(input);
}

export type ProDeliveryTrackCanonicalCorpus = {
  hasCanonicalCorpus: boolean;
  hash: string | null;
  source: "frozen_canonical" | "paid_pro_source_of_truth" | "none";
};

/** Delivery-track diagnostics: prefer frozen canonical, then paid SoT (phase must not clear hash). */
export function resolveProDeliveryTrackCanonicalCorpus(): ProDeliveryTrackCanonicalCorpus {
  const frozen = getFrozenCanonicalAgreementCorpus();
  if (frozen?.hash && frozen.frozen) {
    return {
      hasCanonicalCorpus: true,
      hash: frozen.hash,
      source: "frozen_canonical",
    };
  }
  const record = getPaidProSourceOfTruth();
  if (record?.hash) {
    return {
      hasCanonicalCorpus: true,
      hash: record.hash,
      source: "paid_pro_source_of_truth",
    };
  }
  return { hasCanonicalCorpus: false, hash: null, source: "none" };
}
