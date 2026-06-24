/**
 * One compact production trace line for post-checkout Pro generation.
 */

export type PremiumFlowTracePayload = {
  originalPromptLen: number;
  starterDraftLen: number;
  checkoutBackLen: number;
  premiumRequestInputLen: number;
  serverResponseLen: number;
  preparedServerLen: number;
  freezeCandidateLen: number;
  freezeAccepted: boolean;
  freezeRejectReasons: string[];
  sourceOfTruthEstablished: boolean;
  renderedReviewLen: number;
  finalUiPhase: string;
  intakeChosenSource?: string;
};

export function logPremiumFlowTrace(payload: PremiumFlowTracePayload): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-flow] trace", payload);
}
