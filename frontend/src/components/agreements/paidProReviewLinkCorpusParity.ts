/**
 * Review-link creation/display must use the same locked post-finalize signing snapshot
 * as the creator post-finalize review surface — never canonical SoT or frozen corpus.
 */

import { countBlankSignerMetadataLinesInExecutionBlock } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import {
  resolvePaidProPostFinalizeReviewPlain,
  resolvePaidProPostFinalizeReviewHash,
} from "./paidProPostFinalizeReviewSurface";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export const REVIEW_LINK_CORPUS_PARITY_BLOCK_MESSAGE =
  "Review link could not be created: the agreement snapshot does not match the finalized review copy. Return to final review and try again.";

export type PaidProReviewLinkCorpusParityAudit = {
  creatorHash: string;
  reviewLinkHash: string;
  source: string;
  hydrated: boolean;
  blankSignerLinesRemaining: number;
  executionBlockCount: number;
  invariantOk: boolean;
};

export function resolvePaidProReviewLinkCorpusPlain(): { plain: string; source: string } | null {
  if (!isPaidProPostFinalizeHydratedCorpusLocked()) return null;
  const plain = resolvePaidProPostFinalizeReviewPlain().trim();
  if (plain.length < PAID_PRO_AUTHORITY_MIN_LEN) return null;
  return { plain, source: "authoritative_signing_snapshot" };
}

export function auditPaidProReviewLinkCorpusParity(args: {
  creatorPlain: string;
  reviewLinkPlain: string;
  source: string;
}): PaidProReviewLinkCorpusParityAudit {
  const creatorPlain = (args.creatorPlain || "").trim();
  const reviewLinkPlain = (args.reviewLinkPlain || "").trim();
  const creatorHash =
    creatorPlain.length >= 80 ? hashPaidProCorpus(creatorPlain) : resolvePaidProPostFinalizeReviewHash();
  const reviewLinkHash = reviewLinkPlain.length >= 80 ? hashPaidProCorpus(reviewLinkPlain) : "";
  const blankSignerLinesRemaining = countBlankSignerMetadataLinesInExecutionBlock(reviewLinkPlain);
  const executionBlockCount = countPaidProExecutionBlocks(reviewLinkPlain);
  const hydrated = blankSignerLinesRemaining === 0 && executionBlockCount === 1;
  const locked = isPaidProPostFinalizeHydratedCorpusLocked();
  const invariantOk =
    !locked ||
    (creatorHash.length > 0 &&
      reviewLinkHash.length > 0 &&
      creatorHash === reviewLinkHash &&
      hydrated &&
      blankSignerLinesRemaining === 0 &&
      executionBlockCount === 1);
  return {
    creatorHash,
    reviewLinkHash,
    source: (args.source || "").trim() || "unknown",
    hydrated,
    blankSignerLinesRemaining,
    executionBlockCount,
    invariantOk,
  };
}

let lastParityLogKey = "";

export function logPaidProReviewLinkCorpusParity(audit: PaidProReviewLinkCorpusParityAudit): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(audit);
  if (key === lastParityLogKey) return;
  lastParityLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-review-link-corpus-parity]", audit);
}

export function logReviewLinkPartySimulationOpened(payload: {
  partyIndex: number;
  partyName: string;
  corpusHash: string;
  hydrated: boolean;
  blankSignerLinesRemaining: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-link-party-simulation-opened]", payload);
}
