/**
 * Shared after-payment first-review authority selection.
 *
 * Paid entitlement authorizes the paid journey. It does not authorize arbitrary
 * document bytes. Agreement paper and commercial actions require verified server
 * authority. A short/local recovery body may label a retry/recovery summary only.
 */

import { hasVerifiedCommercialDisplayCorpus, readVerifiedCommercialDisplayCorpus } from "../../agreement/canonicalReviewSnapshotApi";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";

export type PaidFirstReviewAuthorityKind =
  | "verified_server_snapshot"
  | "validated_server_result"
  | "labeled_recovery"
  | "network_retryable"
  | "none";

/** Compare candidate lengths after newline/trailing-space normalize — not raw string length. */
export function normalizePaidProCandidateCompareLen(text: string | null | undefined): number {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd().length;
}

export function hasVerifiedPaidReviewAuthority(agreementId?: string | null): boolean {
  if (hasPaidProSourceOfTruth()) return true;
  const aid = String(agreementId || "").trim();
  if (aid && hasVerifiedCommercialDisplayCorpus(aid)) return true;
  const any = readVerifiedCommercialDisplayCorpus();
  return Boolean(any?.corpusPlain?.trim());
}

export function canMountPaidAgreementPaper(args?: {
  agreementId?: string | null;
  paidSessionActive?: boolean;
}): boolean {
  if (hasVerifiedPaidReviewAuthority(args?.agreementId)) return true;
  return false;
}

/** Signer finalize, acceptance, send, and signing stay closed without verified server authority. */
export function canEnablePaidCommercialActions(args?: { agreementId?: string | null }): boolean {
  return hasVerifiedPaidReviewAuthority(args?.agreementId);
}

export function classifyPaidFirstReviewAuthority(args?: {
  agreementId?: string | null;
  premiumRenderSource?: string | null;
  paidSessionActive?: boolean;
}): PaidFirstReviewAuthorityKind {
  if (hasVerifiedPaidReviewAuthority(args?.agreementId)) {
    return hasPaidProSourceOfTruth() ? "validated_server_result" : "verified_server_snapshot";
  }
  const source = String(args?.premiumRenderSource || "").trim();
  if (source === "premium_network_retryable") return "network_retryable";
  const paid = args?.paidSessionActive ?? hasPaidPremiumCompletionSession();
  if (paid && (source.includes("recovery") || source === "premium_generation_retryable")) {
    return "labeled_recovery";
  }
  if (paid) return "labeled_recovery";
  return "none";
}
