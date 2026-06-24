/**
 * Hard guard: once a long server_full_draft is accepted (>= 15k), automated commits must not
 * replace it with preview/recovery/fallback/safe-display candidates below 90% of that length.
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import {
  getLatchedAcceptedServerFullDraftAuthority,
  LONG_PREMIUM_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";
import { paidProVerboseQaLogsEnabled } from "./paidProPerfLogging";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

export const PAID_PRO_ACCEPTED_SERVER_SHORTENING_MAX_RATIO = 0.9;

/** Sources that must never replace a latched long server_full_draft on automated commit. */
const FORBIDDEN_AUTOMATED_SHORTENING_SOURCES: ReadonlySet<string> = new Set([
  "fallback_preview",
  "fallback_preview_error",
  "snapshot_fallback",
  "premium_network_local_recovery",
  "premium_degraded_server_local_recovery",
  "premium_network_retryable",
  "premium_generation_retryable",
  "rejected_paid_corpus",
  "stale_intake",
  "live_generated_preview",
  "legacy_snapshot",
  "preview_premium_deliverable",
]);

export type GuardPaidProAcceptedServerFullDraftCommitArgs = {
  candidateText: string;
  candidateSource?: string | null;
  renderSource?: string | null;
  generationOutcome?: string | null;
  agreementGenerationId?: string | null;
  reason?: string;
};

export type GuardPaidProAcceptedServerFullDraftCommitResult = {
  text: string;
  rejected: boolean;
  acceptedLen: number;
  candidateLen: number;
  acceptedHash: string;
  candidateHash: string;
  source: string | null;
  renderSource: string | null;
  reason: string;
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function hasLatchedLongAcceptedServerFullDraft(): boolean {
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  return latched !== null && latched.freezeEstablished;
}

export function logPremiumAuthorityCandidateRejectedShorterThanAccepted(payload: {
  acceptedLen: number;
  candidateLen: number;
  source: string | null;
  renderSource: string | null;
  reason: string;
  acceptedHash: string;
  candidateHash: string;
}): void {
  if (!paidProVerboseQaLogsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[premium-authority-candidate-rejected-shorter-than-accepted]", payload);
}

/**
 * When a long server_full_draft is latched, reject materially shorter automated commit candidates
 * and return the latched accepted body unchanged.
 */
export function guardPaidProAcceptedServerFullDraftCommit(
  args: GuardPaidProAcceptedServerFullDraftCommitArgs,
): GuardPaidProAcceptedServerFullDraftCommitResult {
  const candidate = trim(args.candidateText);
  const candidateLen = candidate.length;
  const candidateHash = candidateLen > 0 ? fingerprintAgreementBody(candidate) : "";
  const candidateSource = trim(args.candidateSource);
  const renderSource = trim(args.renderSource ?? args.candidateSource);
  const generationOutcome = trim(args.generationOutcome).toLowerCase();

  const latched = getLatchedAcceptedServerFullDraftAuthority();
  if (!latched || !latched.freezeEstablished || latched.len < LONG_PREMIUM_AUTHORITATIVE_MIN_LEN) {
    return {
      text: candidate,
      rejected: false,
      acceptedLen: 0,
      candidateLen,
      acceptedHash: "",
      candidateHash,
      source: candidateSource || null,
      renderSource: renderSource || null,
      reason: args.reason ?? "no_latched_authority",
    };
  }

  const acceptedLen = latched.len;
  const acceptedHash = latched.hash;
  const minAllowedLen = Math.floor(acceptedLen * PAID_PRO_ACCEPTED_SERVER_SHORTENING_MAX_RATIO);
  const authoritativeRender =
    isAuthoritativePremiumPipelineRenderSource(renderSource) ||
    isAuthoritativePremiumPipelineRenderSource(latched.source);
  const generationOk = !generationOutcome || generationOutcome === "ok";
  const forbiddenSource = FORBIDDEN_AUTOMATED_SHORTENING_SOURCES.has(candidateSource);
  const materiallyShorter = candidateLen > 0 && candidateLen < minAllowedLen;

  const shouldReject =
    authoritativeRender &&
    generationOk &&
    (forbiddenSource || materiallyShorter || candidateLen === 0);

  if (!shouldReject) {
    return {
      text: candidate,
      rejected: false,
      acceptedLen,
      candidateLen,
      acceptedHash,
      candidateHash,
      source: candidateSource || latched.source,
      renderSource: renderSource || latched.source,
      reason: args.reason ?? "candidate_allowed",
    };
  }

  const rejectReason = forbiddenSource
    ? "forbidden_automated_source"
    : candidateLen === 0
      ? "empty_candidate"
      : "materially_shorter_than_accepted_server_full_draft";

  logPremiumAuthorityCandidateRejectedShorterThanAccepted({
    acceptedLen,
    candidateLen,
    source: candidateSource || null,
    renderSource: renderSource || latched.source,
    reason: rejectReason,
    acceptedHash,
    candidateHash,
  });

  return {
    text: latched.body,
    rejected: true,
    acceptedLen,
    candidateLen,
    acceptedHash,
    candidateHash,
    source: latched.source,
    renderSource: latched.source,
    reason: rejectReason,
  };
}
