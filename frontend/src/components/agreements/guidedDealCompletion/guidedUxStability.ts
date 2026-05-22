/**
 * Stable guided UX flags + transition logging (pre-deploy flicker audit).
 */

import type { GuidedCompletionPhase } from "./guidedCompletionPhase";

export type GuidedUxPhaseFlags = {
  isGuidedCompletion: boolean;
  guidedQueued: boolean;
  guidedApplying: boolean;
  guidedUpdated: boolean;
  guidedReviewReady: boolean;
};

export function deriveGuidedUxPhaseFlags(args: {
  showPrimaryGuided: boolean;
  hasSession: boolean;
  phase: GuidedCompletionPhase;
  /** Keeps “updated” surfaces stable briefly after apply metadata lands */
  hasAuthoritativeSummary?: boolean;
  /** Paid Pro final review moment (post bulk apply, before signers). */
  guidedFinalReview?: boolean;
}): GuidedUxPhaseFlags {
  const surfaceActive = Boolean(args.showPrimaryGuided && args.hasSession);
  const postApply =
    args.phase === "applied" || Boolean(args.hasAuthoritativeSummary) || Boolean(args.guidedFinalReview);
  const queued =
    (surfaceActive || postApply) &&
    (args.phase === "collecting_answers" ||
      args.phase === "ready_to_apply" ||
      args.phase === "failed");
  const applying = (surfaceActive || postApply) && args.phase === "applying_all";
  const updated = postApply;
  const guidedReviewReady = Boolean(args.guidedFinalReview);
  return {
    isGuidedCompletion: surfaceActive || postApply,
    guidedQueued: queued && !updated,
    guidedApplying: applying,
    guidedUpdated: updated,
    guidedReviewReady,
  };
}

let lastLoggedTransitionKey = "";

export function logGuidedStateTransition(
  prev: GuidedUxPhaseFlags | null,
  next: GuidedUxPhaseFlags,
  phase: GuidedCompletionPhase,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = [
    phase,
    next.guidedQueued,
    next.guidedApplying,
    next.guidedUpdated,
  ].join("|");
  if (key === lastLoggedTransitionKey) return;
  lastLoggedTransitionKey = key;
  // eslint-disable-next-line no-console
  console.info("[guided-state-transition]", {
    phase,
    prev: prev
      ? {
          queued: prev.guidedQueued,
          applying: prev.guidedApplying,
          updated: prev.guidedUpdated,
        }
      : null,
    next: {
      isGuidedCompletion: next.isGuidedCompletion,
      guidedQueued: next.guidedQueued,
      guidedApplying: next.guidedApplying,
      guidedUpdated: next.guidedUpdated,
      guidedReviewReady: next.guidedReviewReady,
    },
  });
}
