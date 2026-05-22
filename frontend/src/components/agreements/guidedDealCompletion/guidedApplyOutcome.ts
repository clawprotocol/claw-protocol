/**
 * Guided background apply outcome — hard pass vs soft pass vs retry.
 */

import type { GuidedCompletionSession } from "./types";
import {
  countGuidedAnsweredVariables,
  resolveGuidedFrozenAnswerCount,
} from "./guidedAnswerApplyOrchestration";
import {
  applyGuidedPostApplyLightPolish,
  validateGuidedBulkRegenerationLength,
  validateGuidedPostApplyQuality,
  logGuidedPostApplyQuality,
  logGuidedPostApplyQualitySoftPass,
  isGuidedApplyOutputBodyUsable,
  shouldSoftPassGuidedPostApplyQuality,
} from "./guidedPostApplyQuality";

export type GuidedBackgroundApplyOutcome = {
  status: "applied" | "failed_retryable";
  softPass: boolean;
  reasons: string[];
};

const GUIDED_APPLY_LENGTH_REASONS = new Set([
  "output_too_short",
  "output_shrunk_unexpectedly",
  "output_bloated_vs_initial",
]);

function stripGuidedApplyLengthReasons(reasons: readonly string[]): string[] {
  return reasons.filter((r) => !GUIDED_APPLY_LENGTH_REASONS.has(r));
}

export type ResolveGuidedBackgroundApplyOutcomeArgs = {
  stableBeforePlain: string;
  postBodyPlain: string;
  session: GuidedCompletionSession;
  /** Premium refine returned accepted (or committed with accepted decision). */
  refineAccepted?: boolean;
  /** runPersistedRefineFromStepBuffer returned true. */
  refineOk?: boolean;
  /** API summary_changes present. */
  hasSummaryChanges?: boolean;
};

export function resolveGuidedBackgroundApplyOutcome(
  args: ResolveGuidedBackgroundApplyOutcomeArgs,
): GuidedBackgroundApplyOutcome {
  const before = (args.stableBeforePlain || "").trim();
  const postBody = (args.postBodyPlain || "").trim();
  const beforeLen = before.length;
  const afterLen = postBody.length;
  const answeredCount = Math.max(
    countGuidedAnsweredVariables(args.session),
    resolveGuidedFrozenAnswerCount(args.session),
  );

  if (afterLen < 500) {
    return { status: "failed_retryable", softPass: false, reasons: ["no_usable_authoritative_body"] };
  }
  if (answeredCount <= 0) {
    return { status: "failed_retryable", softPass: false, reasons: ["no_guided_answers"] };
  }

  const bodyUsable = isGuidedApplyOutputBodyUsable(beforeLen, afterLen);
  const polished = applyGuidedPostApplyLightPolish(before, postBody);
  /** Length gates use the refine candidate (pre-polish); polish may dedupe without invalidating accept. */
  const length = validateGuidedBulkRegenerationLength(before, postBody);
  const quality = validateGuidedPostApplyQuality(before, polished, args.session);
  const qualitySansLength = stripGuidedApplyLengthReasons(quality.reasons);
  const softReasons = [...new Set([...length.reasons, ...qualitySansLength])];
  const strictPass = length.ok && qualitySansLength.length === 0;

  if (strictPass) {
    logGuidedPostApplyQuality(quality);
    return { status: "applied", softPass: false, reasons: [] };
  }

  if (
    shouldSoftPassGuidedPostApplyQuality({
      applyDecisionAccepted: Boolean(args.refineAccepted),
      refineOk: Boolean(args.refineOk),
      bodyUsable,
      answeredCount,
      hasSummaryChanges: args.hasSummaryChanges,
      qualityReasons: softReasons,
    })
  ) {
    logGuidedPostApplyQualitySoftPass({
      reasons: softReasons,
      beforeLen,
      afterLen,
      answeredCount,
      refineAccepted: Boolean(args.refineAccepted),
      refineOk: Boolean(args.refineOk),
    });
    return { status: "applied", softPass: true, reasons: softReasons };
  }

  logGuidedPostApplyQuality(quality);
  return { status: "failed_retryable", softPass: false, reasons: softReasons };
}

/** validateRefinedOutput hook for premium refine during guided bulk apply. */
export function validateGuidedBulkRefinedOutputForApply(args: {
  stableBeforePlain: string;
  candidatePlain: string;
  session: GuidedCompletionSession;
  refineAccepted?: boolean;
}): boolean {
  const outcome = resolveGuidedBackgroundApplyOutcome({
    stableBeforePlain: args.stableBeforePlain,
    postBodyPlain: args.candidatePlain,
    session: args.session,
    refineAccepted: args.refineAccepted ?? true,
    refineOk: true,
  });
  return outcome.status === "applied";
}
