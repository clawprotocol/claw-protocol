/**
 * Paid Pro generation must always reach a terminal UI phase after server response:
 * review ready, retry (recoverable), or failed (recoverable). Never leave
 * `premiumPostCheckoutPhase === "processing"` when validation failed and no authoritative body exists.
 */

export type PaidProGenerationTerminalReason =
  | "professional_validation_failed"
  | "sot_establishment_failed"
  | "no_server_authority"
  | "founder_intent_gate"
  | "paid_pro_gate_failed"
  | "entitled_rewrite_validation_failed"
  | "entitled_rewrite_canonical_blocked"
  | "entitled_rewrite_snapshot_prepare_failed"
  | "entitled_rewrite_aborted"
  | "draft_limit_reached"
  | "draft_persist_failed";

export type PaidProGenerationTerminalOutcome = "review_ready" | "retry_recoverable" | "failed_recoverable";

/** Dismiss the processing modal and surface retry on the review shell. */
export function resolvePaidProGenerationFailurePostCheckoutPhase(): null {
  return null;
}

export function logPaidProGenerationTerminalTransition(args: {
  reason: PaidProGenerationTerminalReason;
  outcome: PaidProGenerationTerminalOutcome;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-generation-terminal]", {
    reason: args.reason,
    outcome: args.outcome,
    premiumPostCheckoutPhase: null,
  });
}

/** True when runModelPass finally must exit the indefinite processing modal. */
export function shouldRunModelPassFinallyDismissProcessing(args: {
  currentPhase: string | null;
  qualityRetryActive: boolean;
  paidCheckoutCompleted: boolean;
  hasSourceOfTruth: boolean;
}): boolean {
  if (args.currentPhase !== "processing") return false;
  if (args.qualityRetryActive) return true;
  if (args.hasSourceOfTruth) return true;
  if (args.paidCheckoutCompleted && !args.hasSourceOfTruth) return true;
  return false;
}

/** Guard for tests — processing + failed validation + empty body is a deadlock. */
export function isPaidProGenerationProcessingDeadlock(args: {
  premiumPostCheckoutPhase: string | null;
  qualityRetryActive: boolean;
  authoritativeBodyLen: number;
  validationAccepted: boolean;
}): boolean {
  return (
    args.premiumPostCheckoutPhase === "processing" &&
    (args.qualityRetryActive || !args.validationAccepted) &&
    args.authoritativeBodyLen < 500
  );
}
