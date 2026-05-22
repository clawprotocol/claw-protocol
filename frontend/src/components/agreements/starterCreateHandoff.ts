/**
 * Homepage / free starter create handoff — keep guided completion off until paid Pro body exists.
 */

import type { GuidedCompletionPhase } from "./guidedDealCompletion/guidedCompletionPhase";

export const GUIDED_COMPLETION_PHASE_INACTIVE: GuidedCompletionPhase = "inactive";

const GUIDED_PHASES_BLOCKING_STARTER_GENERATING: ReadonlySet<GuidedCompletionPhase> = new Set([
  "collecting_answers",
  "ready_to_apply",
]);

/** Guided answer collection must not suppress starter draft generating UI. */
export function guidedPhaseBlocksStarterGenerating(args: {
  guidedCompletionPhase: GuidedCompletionPhase;
  premiumPaidDocumentSurface: boolean;
}): boolean {
  if (!args.premiumPaidDocumentSurface) return false;
  return GUIDED_PHASES_BLOCKING_STARTER_GENERATING.has(args.guidedCompletionPhase);
}

export function resolveStarterIsGenerating(args: {
  guidedCompletionPhase: GuidedCompletionPhase;
  premiumPaidDocumentSurface: boolean;
  displayPhase: string;
  loading: boolean;
}): boolean {
  if (guidedPhaseBlocksStarterGenerating(args)) return false;
  return (
    args.displayPhase === "generating_draft" ||
    args.displayPhase === "hydrating_generated" ||
    args.displayPhase === "preparing_review" ||
    args.loading
  );
}

/** Premium guided flow may leave inactive only when a usable paid body exists. */
export function canActivateGuidedCompletionPhase(args: {
  premiumPaidDocumentSurface: boolean;
  paidBodyLen: number;
  minBodyLen?: number;
}): boolean {
  const min = args.minBodyLen ?? 200;
  return args.premiumPaidDocumentSurface && args.paidBodyLen >= min;
}

export function shouldResetGuidedCompletionForStarterHandoff(
  guidedCompletionPhase: GuidedCompletionPhase,
): boolean {
  return guidedCompletionPhase !== GUIDED_COMPLETION_PHASE_INACTIVE;
}
