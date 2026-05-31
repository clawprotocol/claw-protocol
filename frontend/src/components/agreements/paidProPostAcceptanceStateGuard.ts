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

const NON_AUTHORITATIVE_LATE_PREMIUM_SOURCES: ReadonlySet<string> = new Set([
  "rejected_paid_corpus",
  "premium_network_retryable",
  "premium_generation_retryable",
  "fallback_preview",
  "fallback_preview_error",
  "stale_intake",
]);

/**
 * First-authoritative-success-wins orchestration guard.
 *
 * Once a valid server full document / authoritative paid corpus has been accepted, a later
 * (duplicate-race) premium pipeline result must be IGNORED — it may not overwrite the SoT, run the
 * `premium_rewrite_request_no_authoritative_body` path, or re-mount guided/starter/free surfaces.
 * Returns true when the incoming late result must be dropped.
 */
export function shouldIgnoreLatePremiumPipelineResult(args: {
  /** An authoritative paid SoT already exists (or was just committed) for this session. */
  hasAcceptedAuthoritativePaidCorpus: boolean;
  /** Render source of the incoming (later) premium pipeline result. */
  incomingRenderSource?: string | null;
  /** Winning body length of the incoming result. */
  incomingBodyLen: number;
  /** Length of the already-accepted authoritative paid corpus. */
  acceptedBodyLen: number;
}): boolean {
  if (!args.hasAcceptedAuthoritativePaidCorpus) return false;
  const source = (args.incomingRenderSource || "").trim().toLowerCase();
  // A rejected / recoverable / fallback later response can never disturb an accepted authoritative SoT.
  if (NON_AUTHORITATIVE_LATE_PREMIUM_SOURCES.has(source)) return true;
  // An empty later body is never authoritative.
  if (args.incomingBodyLen <= 0) return true;
  // A later, materially shorter body is a downgrade of the first authoritative success — ignore it.
  if (args.acceptedBodyLen > 0 && args.incomingBodyLen < args.acceptedBodyLen) return true;
  return false;
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
