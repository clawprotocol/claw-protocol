/**
 * Final-review apply readiness — recover stale idle status when corpus + answers are complete.
 */

import type { GuidedAnswerApplyStatus } from "./guidedAnswerApplyOrchestration";
import {
  countGuidedAnsweredVariables,
  resolveGuidedFrozenAnswerCount,
} from "./guidedAnswerApplyOrchestration";
import type { GuidedCompletionSession } from "./types";
import { isGuidedCompletionComplete } from "./guidedCompletionEngine";
import { resolveGuidedBackgroundApplyOutcome } from "./guidedApplyOutcome";
import { pickAuthoritativeSigningHandoffCorpus } from "../authoritativeHandoffCorpusResolver";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "../simpleProFinalReviewCorpus";

export type GuidedFinalReviewApplyReadinessStatus =
  | "ready"
  | "needs_sync_apply"
  | "blocked_failed"
  | "blocked_missing_body";

export type ResolveGuidedFinalReviewApplyReadinessArgs = {
  applyStatus: GuidedAnswerApplyStatus;
  guidedCompletionPhase: string;
  guidedSessionComplete: boolean;
  answeredCount: number;
  frozenAnswerCount: number;
  authoritativeBodyLen: number;
  hasAppliedSummary?: boolean;
  appliedChangeCount?: number;
  minAuthoritativeLen?: number;
  minFinalReviewLen?: number;
};

export type GuidedFinalReviewApplyReadiness = {
  status: GuidedFinalReviewApplyReadinessStatus;
  appliedEquivalent: boolean;
  reasons: string[];
};

export function isGuidedApplyEquivalentForFinalReview(
  args: Pick<
    ResolveGuidedFinalReviewApplyReadinessArgs,
    | "applyStatus"
    | "guidedCompletionPhase"
    | "guidedSessionComplete"
    | "answeredCount"
    | "authoritativeBodyLen"
    | "hasAppliedSummary"
    | "minFinalReviewLen"
  >,
): boolean {
  if (args.applyStatus === "applied") return true;
  if (args.guidedCompletionPhase === "applied") return true;
  const minLen = args.minFinalReviewLen ?? GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN;
  if (
    args.guidedSessionComplete &&
    args.answeredCount > 0 &&
    args.authoritativeBodyLen >= minLen
  ) {
    return true;
  }
  if (args.hasAppliedSummary && args.authoritativeBodyLen >= minLen) {
    return true;
  }
  return false;
}

export function resolveGuidedFinalReviewApplyReadiness(
  args: ResolveGuidedFinalReviewApplyReadinessArgs,
): GuidedFinalReviewApplyReadiness {
  const minLen = args.minAuthoritativeLen ?? 500;
  const finalReviewMin = args.minFinalReviewLen ?? GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN;
  const reasons: string[] = [];

  if (args.authoritativeBodyLen < minLen) {
    return {
      status: "blocked_missing_body",
      appliedEquivalent: false,
      reasons: ["authoritative_body_missing"],
    };
  }

  const appliedEquivalent = isGuidedApplyEquivalentForFinalReview(args);
  if (appliedEquivalent) {
    if (args.applyStatus === "idle") reasons.push("idle_recovered_by_corpus_and_answers");
    return { status: "ready", appliedEquivalent: true, reasons };
  }

  if (args.applyStatus === "failed_retryable") {
    return {
      status: "blocked_failed",
      appliedEquivalent: false,
      reasons: ["failed_retryable"],
    };
  }

  if (
    args.guidedSessionComplete &&
    args.answeredCount > 0 &&
    args.authoritativeBodyLen >= finalReviewMin
  ) {
    return {
      status: "needs_sync_apply",
      appliedEquivalent: false,
      reasons: ["idle_with_complete_session_and_full_body"],
    };
  }

  if (args.guidedSessionComplete && args.answeredCount > 0 && args.authoritativeBodyLen >= minLen) {
    return {
      status: "needs_sync_apply",
      appliedEquivalent: false,
      reasons: ["idle_with_complete_session"],
    };
  }

  return {
    status: "blocked_missing_body",
    appliedEquivalent: false,
    reasons: ["guided_answers_or_body_not_ready"],
  };
}

export type PickBestAuthoritativeCorpusOpts = {
  acceptedAuthoritativeBody?: string | null;
  premiumAccepted?: boolean;
  pipelineSource?: string | null;
};

export function pickBestAuthoritativeCorpusPlain(
  candidates: readonly (string | null | undefined)[],
  opts?: PickBestAuthoritativeCorpusOpts,
): string {
  const mapped = candidates
    .map((raw, index) => ({ text: (raw || "").trim(), source: `corpus_${index}` }))
    .filter((c) => c.text.length > 0);
  if (
    opts?.acceptedAuthoritativeBody &&
    opts.acceptedAuthoritativeBody.trim().length >= 500
  ) {
    return pickAuthoritativeSigningHandoffCorpus({
      candidates: mapped,
      acceptedAuthoritativeBody: opts.acceptedAuthoritativeBody,
      premiumAccepted: opts.premiumAccepted,
      pipelineSource: opts.pipelineSource,
    }).text;
  }
  let best = "";
  for (const c of mapped) {
    if (c.text.length > best.length) best = c.text;
  }
  return best;
}

export type CommitGuidedApplyFromCorpusArgs = {
  session: GuidedCompletionSession;
  corpusPlain: string;
  stableBeforePlain?: string;
};

/** Deterministic commit when authoritative body already reflects guided answers (no refine). */
export function resolveGuidedSyncApplyFromCorpus(
  args: CommitGuidedApplyFromCorpusArgs,
): ReturnType<typeof resolveGuidedBackgroundApplyOutcome> {
  const corpus = (args.corpusPlain || "").trim();
  const stable = (args.stableBeforePlain || corpus).trim() || corpus;
  return resolveGuidedBackgroundApplyOutcome({
    stableBeforePlain: stable,
    postBodyPlain: corpus,
    session: args.session,
    refineAccepted: true,
    refineOk: false,
  });
}

export function resolveGuidedFinalReviewApplyReadinessFromSession(args: {
  applyStatus: GuidedAnswerApplyStatus;
  guidedCompletionPhase: string;
  session: GuidedCompletionSession | null | undefined;
  authoritativeBodyLen: number;
  hasAppliedSummary?: boolean;
  appliedChangeCount?: number;
}): GuidedFinalReviewApplyReadiness {
  const session = args.session;
  const answeredCount = countGuidedAnsweredVariables(session);
  const frozenAnswerCount = resolveGuidedFrozenAnswerCount(session);
  const guidedSessionComplete = Boolean(
    session &&
      (isGuidedCompletionComplete(session) ||
        (answeredCount > 0 && frozenAnswerCount > 0 && answeredCount >= frozenAnswerCount)),
  );
  return resolveGuidedFinalReviewApplyReadiness({
    applyStatus: args.applyStatus,
    guidedCompletionPhase: args.guidedCompletionPhase,
    guidedSessionComplete,
    answeredCount,
    frozenAnswerCount,
    authoritativeBodyLen: args.authoritativeBodyLen,
    hasAppliedSummary: args.hasAppliedSummary,
    appliedChangeCount: args.appliedChangeCount,
  });
}

export function logGuidedFinalReviewApplyReadiness(payload: GuidedFinalReviewApplyReadiness & {
  applyStatus: GuidedAnswerApplyStatus;
  authoritativeBodyLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-apply-readiness]", payload);
}

export function logGuidedFinalReviewApplyStatusRecovered(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-apply-status-recovered]", payload);
}

export function logGuidedFinalReviewSyncApplyStarted(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-sync-apply-started]", payload);
}

export function logGuidedFinalReviewSyncApplyComplete(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-sync-apply-complete]", payload);
}
