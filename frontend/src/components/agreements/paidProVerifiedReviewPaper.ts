/**
 * Verified paid-review paper — the only corpus that may paint a completed review
 * and open commercial actions after persist + canonical snapshot.
 *
 * Bound to organization, durable agreement id, SHA-256, and length. Local intake,
 * browser/session filler, pipeline text, UI tier, and unverified responses cannot
 * authorize paper.
 */

import {
  canEnableCommercialPrepareFromServerSnapshot,
  readDisplayReviewSnapshotAuthority,
  readVerifiedCommercialDisplayCorpus,
  sha256CorpusDigest,
} from "../../agreement/canonicalReviewSnapshotApi";
import { getOrgId } from "../../launch/orgContext";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";

export const COMPLETED_PAID_REVIEW_HEADING = "Review your agreement draft";

export const VERIFIED_PAID_REVIEW_PAPER_SOURCE = "verified_server_canonical_review_snapshot";

export type VerifiedPaidReviewPaper = {
  plain: string;
  source: typeof VERIFIED_PAID_REVIEW_PAPER_SOURCE;
  orgId: string;
  agreementId: string;
  corpusSha256: string;
  corpusLength: number;
};

export function selectVerifiedPaidReviewPaper(args: {
  orgId?: string | null;
  agreementId?: string | null;
  expectedSha256?: string | null;
  expectedLength?: number | null;
} = {}): VerifiedPaidReviewPaper | null {
  const orgId = (args.orgId || getOrgId()).trim();
  const agreementId = (
    args.agreementId ||
    readDisplayReviewSnapshotAuthority()?.agreementId ||
    ""
  ).trim();
  if (!orgId || !agreementId) return null;
  const verified = readVerifiedCommercialDisplayCorpus(agreementId);
  if (!verified) return null;
  const plain = (verified.corpusPlain || "").trim();
  if (plain.length < PAID_PRO_AUTHORITY_MIN_LEN) return null;
  if (verified.orgId?.trim() && verified.orgId.trim() !== orgId) return null;
  if (verified.agreementId.trim() !== agreementId) return null;
  if (plain.length !== Number(verified.corpusLength)) return null;
  if (args.expectedLength != null && Number(args.expectedLength) !== plain.length) {
    return null;
  }
  if (
    args.expectedSha256 &&
    args.expectedSha256.trim().toLowerCase() !== verified.corpusSha256.toLowerCase()
  ) {
    return null;
  }
  return {
    plain,
    source: VERIFIED_PAID_REVIEW_PAPER_SOURCE,
    orgId: verified.orgId?.trim() || orgId,
    agreementId,
    corpusSha256: verified.corpusSha256.toLowerCase(),
    corpusLength: plain.length,
  };
}

/**
 * Completed-review chrome is allowed only when the document article holds the
 * exact verified corpus. The review heading alone is never enough.
 */
export function canPresentCompletedPaidReview(args: {
  reviewHeading?: string | null;
  articlePlain?: string | null;
  verified?: VerifiedPaidReviewPaper | null;
}): boolean {
  const article = (args.articlePlain || "").trim();
  const verified = args.verified ?? selectVerifiedPaidReviewPaper();
  if (!verified || !article) return false;
  if (article.length !== verified.corpusLength) return false;
  if (article !== verified.plain) return false;
  const heading = (args.reviewHeading || "").trim();
  if (heading && heading !== COMPLETED_PAID_REVIEW_HEADING) return false;
  return true;
}

/**
 * Send / sign / freeze / prepare stay closed unless the article is the verified
 * paper. Accept is still required for Prepare.
 */
export function canEnablePaidReviewCommercialActions(args: {
  articlePlain?: string | null;
  verified?: VerifiedPaidReviewPaper | null;
  requireAcceptedPrepare?: boolean;
} = {}): boolean {
  const verified = args.verified ?? selectVerifiedPaidReviewPaper();
  if (!canPresentCompletedPaidReview({ articlePlain: args.articlePlain, verified })) {
    return false;
  }
  if (args.requireAcceptedPrepare === false) return true;
  return canEnableCommercialPrepareFromServerSnapshot(verified?.agreementId);
}

export async function sha256MatchesVerifiedPaper(
  articlePlain: string,
  verified: VerifiedPaidReviewPaper,
): Promise<boolean> {
  const article = (articlePlain || "").trim();
  if (!article || article.length !== verified.corpusLength || article !== verified.plain) {
    return false;
  }
  const digest = await sha256CorpusDigest(article);
  return digest === verified.corpusSha256.toLowerCase();
}
