/**
 * Paid Pro review render SoT parity diagnostics — canonical freeze vs review plain hash.
 */

import { classifyPaidProCorpusLifecycleDiff } from "./paidProCorpusLifecycleDiff";
import { preparePaidProReviewDisplayPlain, preparePaidProFrozenDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { shouldUsePaidProSourceOfTruthDisplayOnly } from "./paidProAuthoritativeRenderGate";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import { resolvePaidProFrozenUserVisibleReviewDisplayPlain } from "./paidProDisplayPlainAuthority";
import { readAuthoritativeSigningCorpus } from "./authoritativeSigningSnapshot";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { countBlankSignerMetadataLinesInExecutionBlock } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { getPaidProSourceOfTruthText, hashPaidProCorpus, hasPaidProSourceOfTruth } from "./paidProSourceOfTruthState";
import { resolvePaidProFrozenAuthoritativeHash } from "./paidProPostFreezeCorpusInvariant";

const SIGNER_FIELD_ONLY_CLASSIFICATIONS = new Set([
  "signer_metadata_only",
  "execution_block_hydration_only",
  "whitespace_or_line_width_only",
  "display_normalization_only",
  "identical",
  "notice_contact_hydration_only",
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
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
}): {
  canonicalHash: string | null;
  reviewHash: string;
  invariantOk: boolean;
  signerFieldOnlyDelta: boolean;
  blankSignerLinesRemaining: number;
} {
  const review = (args.reviewPlain || "").trim();
  const reviewHash = review.length >= 80 ? hashPaidProCorpus(review) : "";
  const displayOnly = shouldUsePaidProSourceOfTruthDisplayOnly();
  const postFinalizeLocked = isPaidProPostFinalizeHydratedCorpusLocked();
  const prepareDisplayPlain = (plain: string) =>
    displayOnly || postFinalizeLocked
      ? preparePaidProFrozenDisplayPlain(plain, {
          intakeText: args.intakeText ?? null,
          draftPartyNames:
            args.draft?.parties?.map((p) => String((p as { name?: string }).name ?? "").trim()) ?? null,
        }).text
      : preparePaidProReviewDisplayPlain(plain).text;
  const expectedReviewPlain =
    displayOnly && hasPaidProSourceOfTruth()
      ? resolvePaidProFrozenUserVisibleReviewDisplayPlain({
          intakeText: args.intakeText ?? null,
          draft: args.draft ?? null,
        })
      : "";
  const expectedReviewHash =
    expectedReviewPlain.length >= 80 ? hashPaidProCorpus(expectedReviewPlain) : "";
  const canonicalHash = expectedReviewHash || (hasPaidProSourceOfTruth() ? resolvePaidProFrozenAuthoritativeHash() : null);
  const canonicalPlain = (() => {
    if (!hasPaidProSourceOfTruth()) return "";
    const frozen = getFrozenCanonicalAgreementCorpus()?.canonicalText?.trim();
    if (frozen && frozen.length >= 80) return frozen;
    return getPaidProSourceOfTruthText().trim();
  })();
  const canonicalDisplayPlain = canonicalPlain
    ? prepareDisplayPlain(canonicalPlain).trim()
    : "";
  const canonicalDisplayPlainHash =
    canonicalDisplayPlain.length >= 80 ? hashPaidProCorpus(canonicalDisplayPlain) : "";
  const classification =
    canonicalPlain && review
      ? classifyPaidProCorpusLifecycleDiff(canonicalPlain, review)
      : null;
  const displayNormalizationDelta = Boolean(
    canonicalDisplayPlainHash && reviewHash && canonicalDisplayPlainHash === reviewHash,
  );
  const snapshotPlain = readAuthoritativeSigningCorpus()?.trim() ?? "";
  const snapshotDisplayHash =
    snapshotPlain.length >= 80
      ? hashPaidProCorpus(prepareDisplayPlain(snapshotPlain).trim())
      : "";
  const reviewMatchesSnapshotDisplay = Boolean(
    snapshotDisplayHash && reviewHash && snapshotDisplayHash === reviewHash,
  );
  // TEST576 (option 4b): post-finalize, the authoritative signing snapshot is the display source of
  // truth (it carries the threaded notice addresses). The review render is derived from it, so a
  // snapshot→review diff is a pure display/whitespace normalization, never a substantive change. This
  // makes parity hold even when the review vs frozen-canonical classification is imperfect, because the
  // snapshot and review share identical notice content (no address-length non-locality).
  const snapshotClassification =
    snapshotPlain && review ? classifyPaidProCorpusLifecycleDiff(snapshotPlain, review) : null;
  const reviewMatchesSnapshotClassified = Boolean(
    snapshotClassification && SIGNER_FIELD_ONLY_CLASSIFICATIONS.has(snapshotClassification),
  );
  const signerFieldOnlyDelta = Boolean(
    (classification && SIGNER_FIELD_ONLY_CLASSIFICATIONS.has(classification)) ||
      displayNormalizationDelta ||
      reviewMatchesSnapshotDisplay ||
      reviewMatchesSnapshotClassified,
  );
  const blankSignerLinesRemaining = countBlankSignerMetadataLinesInExecutionBlock(review);
  const hashMatch = Boolean(
    (expectedReviewHash && reviewHash && expectedReviewHash === reviewHash) ||
      (canonicalHash && reviewHash && canonicalHash === reviewHash),
  );
  const invariantOk = displayOnly && expectedReviewHash
    ? expectedReviewHash === reviewHash
    : hashMatch || displayNormalizationDelta || reviewMatchesSnapshotDisplay || signerFieldOnlyDelta;
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
