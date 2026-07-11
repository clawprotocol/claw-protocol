/**
 * Hard guard: once a long server_full_draft is accepted (>= 15k), automated commits must not
 * replace it with preview/recovery/fallback/safe-display candidates below 90% of that length.
 */

import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  getLatchedAcceptedServerFullDraftAuthority,
  LONG_PREMIUM_AUTHORITATIVE_MIN_LEN,
  SUBSTANTIVE_SERVER_DRAFT_MIN_LEN,
} from "./premiumAcceptancePolicy";
import { paidProVerboseQaLogsEnabled } from "./paidProPerfLogging";
import { hasPaidProPipelineSessionAcceptance } from "./paidProPostAcceptanceValidatorCache";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { paidProServerFullDraftBelowSubstantiveMin } from "./paidProSubstantiveCorpusAssessment";

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
  "structural_recovery",
  "deterministic_recovery_freeze_candidate",
]);

export type GuardPaidProAcceptedServerFullDraftCommitArgs = {
  candidateText: string;
  candidateSource?: string | null;
  renderSource?: string | null;
  generationOutcome?: string | null;
  agreementGenerationId?: string | null;
  reason?: string;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
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

/**
 * Render resolver may only auto-commit SoT when the premium pipeline already accepted the corpus
 * (or a freeze-established latch exists). Substantive length alone is insufficient — prevents
 * degraded/json_parse document_text or tiny fallbacks from masquerading as server_full_draft SoT.
 */
export function shouldAutoEstablishPaidProSourceOfTruthFromRenderPath(args: {
  body: string;
  pipelineSource: string;
}): boolean {
  const body = trim(args.body);
  const source = trim(args.pipelineSource) || "server_full_draft";
  if (!body || body.length < 500) return false;
  if (
    source === "rejected_paid_corpus" ||
    source === "fallback_preview" ||
    source === "fallback_preview_error" ||
    source === "premium_degraded_server_local_recovery" ||
    source === "structural_recovery" ||
    source === "deterministic_recovery_freeze_candidate"
  ) {
    return false;
  }
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  if (latched?.freezeEstablished && latched.body.trim().length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) {
    return body.length >= latched.len || body.length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN;
  }
  return hasPaidProPipelineSessionAcceptance({ text: body, source });
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
  const mislabeledSubstantiveServerSource =
    paidProServerFullDraftBelowSubstantiveMin({
      text: candidate,
      source: candidateSource || "server_full_draft",
      intakeText: args.intakeText ?? null,
      draft: args.draft ?? null,
      generationOutcome: args.generationOutcome ?? null,
    }) &&
    !hasPaidProPipelineSessionAcceptance({ text: candidate, source: candidateSource || "server_full_draft" });

  if (!latched || !latched.freezeEstablished || latched.len < LONG_PREMIUM_AUTHORITATIVE_MIN_LEN) {
    if (mislabeledSubstantiveServerSource) {
      logPremiumAuthorityCandidateRejectedShorterThanAccepted({
        acceptedLen: 0,
        candidateLen,
        source: candidateSource || null,
        renderSource: renderSource || null,
        reason: "mislabeled_server_full_draft_below_substantive_min",
        acceptedHash: "",
        candidateHash,
      });
    }
    return {
      text: candidate,
      rejected: mislabeledSubstantiveServerSource,
      acceptedLen: 0,
      candidateLen,
      acceptedHash: "",
      candidateHash,
      source: candidateSource || null,
      renderSource: renderSource || null,
      reason: mislabeledSubstantiveServerSource
        ? "mislabeled_server_full_draft_below_substantive_min"
        : args.reason ?? "no_latched_authority",
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
