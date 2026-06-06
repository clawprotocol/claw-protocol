/**
 * Paid Pro review render SoT parity diagnostics — canonical freeze vs review plain hash.
 */

import { hashPaidProCorpus, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resolvePaidProFrozenAuthoritativeHash } from "./paidProPostFreezeCorpusInvariant";

export function logPaidProReviewSotParity(payload: {
  canonicalHash: string | null;
  reviewHash: string;
  invariantOk: boolean;
  surface?: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-review-sot-parity]", payload);
}

export function auditPaidProReviewRenderSotParity(args: {
  reviewPlain: string;
  surface?: string;
}): { canonicalHash: string | null; reviewHash: string; invariantOk: boolean } {
  const review = (args.reviewPlain || "").trim();
  const reviewHash = review.length >= 80 ? hashPaidProCorpus(review) : "";
  const canonicalHash = hasPaidProSourceOfTruth() ? resolvePaidProFrozenAuthoritativeHash() : null;
  const invariantOk = Boolean(canonicalHash && reviewHash && canonicalHash === reviewHash);
  if (reviewHash) {
    logPaidProReviewSotParity({
      canonicalHash,
      reviewHash,
      invariantOk,
      surface: args.surface ?? "paid_pro_review_render",
    });
  }
  return { canonicalHash, reviewHash, invariantOk };
}
