/**
 * Post-signer-finalize paid Pro review surfaces — locked hydrated signing snapshot only.
 */

import { readAuthoritativeSigningCorpus } from "./authoritativeSigningSnapshot";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
  signerMetadataAuthorityHasHydratableFields,
} from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN,
  readPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import type { AuthoritativeSigningSnapshotRecipientMetadata } from "./authoritativeSigningSnapshot";

export function resolvePaidProPostFinalizeReviewPlain(): string {
  const snapshot = readAuthoritativeSigningCorpus().trim();
  if (snapshot.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) return snapshot;
  const pinned = readPaidProPinnedSignerAppliedCorpus().trim();
  if (pinned.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) return pinned;
  return "";
}

export function resolvePaidProPostFinalizeReviewHash(): string {
  const plain = resolvePaidProPostFinalizeReviewPlain();
  return plain.length >= 80 ? hashPaidProCorpus(plain) : "";
}

export function auditPaidProPostFinalizeHydrationInvariant(args: {
  reviewPlain: string;
  signerMetadata?: AuthoritativeSigningSnapshotRecipientMetadata | null;
}): {
  blocked: boolean;
  blankSignerLinesRemaining: number;
  metadataComplete: boolean;
} {
  const reviewPlain = (args.reviewPlain || "").trim();
  const blankSignerLinesRemaining = countBlankSignerMetadataLinesInExecutionBlock(reviewPlain);
  const metadataComplete = args.signerMetadata
    ? signerMetadataAuthorityHasHydratableFields(args.signerMetadata)
    : false;
  const blocked =
    isPaidProPostFinalizeHydratedCorpusLocked() &&
    metadataComplete &&
    blankSignerLinesRemaining > 0;
  return { blocked, blankSignerLinesRemaining, metadataComplete };
}

export function canProceedPaidProReviewFirstHandoffAfterFinalize(args: {
  signersComplete: boolean;
  reviewPlain?: string;
  minLen?: number;
}): boolean {
  if (!isPaidProPostFinalizeHydratedCorpusLocked()) return false;
  if (!args.signersComplete) return false;
  const plain = (args.reviewPlain ?? resolvePaidProPostFinalizeReviewPlain()).trim();
  const minLen = args.minLen ?? PAID_PRO_AUTHORITY_MIN_LEN;
  if (plain.length < minLen) return false;
  if (countBlankSignerMetadataLinesInExecutionBlock(plain) > 0) return false;
  return true;
}

let lastHydrationBlockedLog = "";

export function logPaidProPostFinalizeHydrationBlocked(payload: {
  blankSignerLinesRemaining: number;
  reviewLen: number;
  reviewHash: string | null;
  surface: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  const key = `${payload.surface}:${payload.reviewHash}:${payload.blankSignerLinesRemaining}`;
  if (key === lastHydrationBlockedLog) return;
  lastHydrationBlockedLog = key;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-post-finalize-hydration-blocked]", payload);
}
