/**
 * Paid Pro API/network failure guard — starter/free drafts must never become canonical Pro corpus.
 */

import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { hasProGenerationAdoptionForSession } from "./paidProGenerationAdoption";
import {
  isPremiumGenerationApiUnavailableForUi,
  isPremiumGenerationApiUnavailablePipelineSource,
  MIN_PAID_PRO_AUTHORITY_LEN,
} from "./premiumGenerationApiAvailability";

export type PaidProApiFailureGuardContext = {
  premiumRenderSource?: string | null;
  premiumPostCheckoutPhase?: string | null;
  hasPaidProSourceOfTruth?: boolean;
};

export function isPaidProApiFailureBlockingPaidProAuthority(
  args: PaidProApiFailureGuardContext,
): boolean {
  if (args.hasPaidProSourceOfTruth ?? hasPaidProSourceOfTruth()) return false;
  if (hasProGenerationAdoptionForSession()) return false;
  return isPremiumGenerationApiUnavailableForUi({
    premiumPostCheckoutPhase: args.premiumPostCheckoutPhase,
    pipelineSource: args.premiumRenderSource,
    hasPaidProSourceOfTruth: false,
  });
}

/** Minimum paid Pro recovery corpus — aligns with {@link PAID_PRO_RECOVERY_MIN_DISPLAY_LEN}. */
const PAID_PRO_RECOVERY_CORPUS_MIN_LEN = 4_000;

const REJECTED_PAID_CORPUS_PIPELINE_SOURCES = new Set<string>([
  "rejected_paid_corpus",
  "premium_generation_retryable",
]);

/** True when canonical_working_draft / Pro freeze must not run on this corpus. */
export function shouldBlockPaidProCanonicalFreezeOnApiFailure(args: {
  premiumRenderSource?: string | null;
  premiumPostCheckoutPhase?: string | null;
  corpusLen: number;
  hasPaidProSourceOfTruth?: boolean;
  corpusSource?: string | null;
  hasEligibleRecoveryCorpus?: boolean;
}): boolean {
  if (args.hasPaidProSourceOfTruth ?? hasPaidProSourceOfTruth()) return false;
  if (hasProGenerationAdoptionForSession()) return false;
  const pipeline = String(args.premiumRenderSource || "").trim();
  if (
    REJECTED_PAID_CORPUS_PIPELINE_SOURCES.has(pipeline) &&
    !args.hasEligibleRecoveryCorpus
  ) {
    return true;
  }
  if (
    pipeline === "premium_degraded_server_local_recovery" &&
    args.corpusLen < PAID_PRO_RECOVERY_CORPUS_MIN_LEN &&
    !args.hasEligibleRecoveryCorpus
  ) {
    return true;
  }
  if (!isPaidProApiFailureBlockingPaidProAuthority(args)) return false;
  if (args.corpusLen >= MIN_PAID_PRO_AUTHORITY_LEN) return false;
  if (
    args.corpusSource === "server_full_draft" ||
    args.corpusSource === "server_full_document_text" ||
    args.corpusSource === "paidProSourceOfTruth"
  ) {
    return false;
  }
  return true;
}

export function isPaidProStarterFallbackDisplayOnly(args: {
  premiumRenderSource?: string | null;
  corpusLen: number;
}): boolean {
  if (!isPremiumGenerationApiUnavailablePipelineSource(args.premiumRenderSource)) return false;
  return args.corpusLen > 0 && args.corpusLen < MIN_PAID_PRO_AUTHORITY_LEN;
}

export function shouldBlockPaidProReviewReadinessFromFallbackCorpus(args: {
  premiumRenderSource?: string | null;
  premiumPostCheckoutPhase?: string | null;
  corpusLen: number;
  hasPaidProSourceOfTruth?: boolean;
}): boolean {
  if (args.hasPaidProSourceOfTruth ?? hasPaidProSourceOfTruth()) return false;
  if (!isPaidProApiFailureBlockingPaidProAuthority(args)) return false;
  return args.corpusLen < PAID_PRO_AUTHORITY_MIN_LEN || args.corpusLen < MIN_PAID_PRO_AUTHORITY_LEN;
}

export function shouldBlockSignerMetadataPaidProAuthority(args: PaidProApiFailureGuardContext): boolean {
  return isPaidProApiFailureBlockingPaidProAuthority(args) && !(args.hasPaidProSourceOfTruth ?? hasPaidProSourceOfTruth());
}

export function logPaidProApiFailureNoCanonicalFreeze(payload: {
  corpusLen: number;
  pipelineSource: string | null;
  phase: string | null;
  corpusSource: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-api-failure-no-canonical-freeze]", payload);
}

export function logPaidProFallbackDisplayOnly(payload: {
  corpusLen: number;
  pipelineSource: string | null;
  displaySource: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-fallback-display-only]", payload);
}

export function logPaidProRetryRequested(payload: {
  pipelineSource: string | null;
  phase: string | null;
  intakeLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-retry-requested]", payload);
}

export function logPaidProAuthorityBlockedAfterApiFailure(payload: {
  corpusLen: number;
  pipelineSource: string | null;
  phase: string | null;
  surface: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-authority-blocked-after-api-failure]", payload);
}
