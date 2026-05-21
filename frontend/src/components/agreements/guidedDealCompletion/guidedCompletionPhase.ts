/** Guided Pro completion lifecycle — collect answers locally, then one bulk regeneration. */
export type GuidedCompletionPhase =
  | "collecting_answers"
  | "ready_to_apply"
  | "applying_all"
  | "applied"
  | "failed";

export function guidedPhaseSuppressesSendCta(phase: GuidedCompletionPhase): boolean {
  return phase === "collecting_answers" || phase === "ready_to_apply" || phase === "applying_all";
}

export function guidedPhaseBlocksDocumentSwap(phase: GuidedCompletionPhase): boolean {
  return phase === "collecting_answers" || phase === "ready_to_apply" || phase === "applying_all";
}
