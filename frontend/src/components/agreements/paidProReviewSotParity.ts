/**
 * Paid Pro review render SoT parity diagnostics — canonical freeze vs review plain hash.
 */

import { classifyPaidProCorpusLifecycleDiff } from "./paidProCorpusLifecycleDiff";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { readAuthoritativeSigningCorpus } from "./authoritativeSigningSnapshot";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { countBlankSignerMetadataLinesInExecutionBlock } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { getPaidProSourceOfTruthText, hashPaidProCorpus, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { resolvePaidProFrozenAuthoritativeHash } from "./paidProPostFreezeCorpusInvariant";

const SIGNER_FIELD_ONLY_CLASSIFICATIONS = new Set([
  "signer_metadata_only",
  "execution_block_hydration_only",
  "whitespace_or_line_width_only",
  "display_normalization_only",
  "identical",
]);

export function logPaidProReviewSotParity(payload: {
  canonicalHash: string | null;
  reviewHash: string;
  invariantOk: boolean;
  signerFieldOnlyDelta?: boolean;
  blankSignerLinesRemaining?: number;
  surface?: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-review-sot-parity]", payload);
}

export function auditPaidProReviewRenderSotParity(args: {
  reviewPlain: string;
  surface?: string;
}): {
  canonicalHash: string | null;
  reviewHash: string;
  invariantOk: boolean;
  signerFieldOnlyDelta: boolean;
  blankSignerLinesRemaining: number;
} {
  const review = (args.reviewPlain || "").trim();
  const reviewHash = review.length >= 80 ? hashPaidProCorpus(review) : "";
  const canonicalHash = hasPaidProSourceOfTruth() ? resolvePaidProFrozenAuthoritativeHash() : null;
  const canonicalPlain = (() => {
    if (!hasPaidProSourceOfTruth()) return "";
    const frozen = getFrozenCanonicalAgreementCorpus()?.canonicalText?.trim();
    if (frozen && frozen.length >= 80) return frozen;
    return getPaidProSourceOfTruthText().trim();
  })();
  const canonicalDisplayPlain = canonicalPlain
    ? preparePaidProReviewDisplayPlain(canonicalPlain).text.trim()
    : "";
  const canonicalDisplayHash =
    canonicalDisplayPlain.length >= 80 ? hashPaidProCorpus(canonicalDisplayPlain) : "";
  const classification =
    canonicalPlain && review
      ? classifyPaidProCorpusLifecycleDiff(canonicalPlain, review)
      : null;
  const displayNormalizationDelta = Boolean(
    canonicalDisplayHash && reviewHash && canonicalDisplayHash === reviewHash,
  );
  const snapshotPlain = readAuthoritativeSigningCorpus()?.trim() ?? "";
  const snapshotDisplayHash =
    snapshotPlain.length >= 80
      ? hashPaidProCorpus(preparePaidProReviewDisplayPlain(snapshotPlain).text.trim())
      : "";
  const reviewMatchesSnapshotDisplay = Boolean(
    snapshotDisplayHash && reviewHash && snapshotDisplayHash === reviewHash,
  );
  const signerFieldOnlyDelta = Boolean(
    (classification && SIGNER_FIELD_ONLY_CLASSIFICATIONS.has(classification)) ||
      displayNormalizationDelta ||
      reviewMatchesSnapshotDisplay,
  );
  const blankSignerLinesRemaining = countBlankSignerMetadataLinesInExecutionBlock(review);
  const hashMatch = Boolean(canonicalHash && reviewHash && canonicalHash === reviewHash);
  const invariantOk =
    hashMatch ||
    displayNormalizationDelta ||
    reviewMatchesSnapshotDisplay ||
    (signerFieldOnlyDelta && blankSignerLinesRemaining === 0);
  if (reviewHash && !invariantOk) {
    logPaidProReviewSotParity({
      canonicalHash,
      reviewHash,
      invariantOk,
      signerFieldOnlyDelta,
      blankSignerLinesRemaining,
      surface: args.surface ?? "paid_pro_review_render",
    });
  }
  return {
    canonicalHash,
    reviewHash,
    invariantOk,
    signerFieldOnlyDelta,
    blankSignerLinesRemaining,
  };
}
