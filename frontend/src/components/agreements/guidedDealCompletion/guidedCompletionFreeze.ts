/**
 * Hard freeze guided session after final question / bulk apply — block queue regrowth from body rescans.
 */

import type { CreateFlowProductionPhase } from "../createFlowTypes";
import { isUpdatedAgreementReadyPhase } from "../createFlowTypes";
import type { GuidedCompletionPhase } from "./guidedCompletionPhase";
import type { GuidedCompletionSession } from "./types";
import { freezeGuidedSessionAfterApply } from "./guidedSessionPersistence";
import { filterAppliedIdsFromVisibleQueue, logGuidedQuestionQueueFreezeHit } from "./guidedQuestionQueue";

export { filterAppliedIdsFromVisibleQueue };

export function isGuidedQueueRebuildBlocked(args: {
  completionFrozen: boolean;
  frozenAfterApplyRef: boolean;
  bulkApplying: boolean;
  phase: GuidedCompletionPhase;
  finalReviewActive: boolean;
  createFlowPhase?: CreateFlowProductionPhase;
}): boolean {
  if (args.completionFrozen || args.frozenAfterApplyRef || args.bulkApplying) return true;
  if (args.finalReviewActive) return true;
  if (args.createFlowPhase && isUpdatedAgreementReadyPhase(args.createFlowPhase)) return true;
  return args.phase === "applied" || args.phase === "applying_all";
}

/** Return frozen session only — never merge base queue while rebuild blocked. */
export function mergeGuidedSessionWhenRebuildBlocked(
  prev: GuidedCompletionSession | null,
  sessionKey: string,
): GuidedCompletionSession | null {
  if (!prev) return null;
  logGuidedQuestionQueueFreezeHit({
    queueLen: prev.queue.length,
    answeredCount: Object.keys(prev.answered).length,
  });
  return freezeGuidedSessionAfterApply(prev, sessionKey);
}
