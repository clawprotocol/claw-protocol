/**
 * Authoritative Paid Pro generation write guard — supersession and terminal-state enforcement.
 */

import {
  getActivePaidProGenerationAttemptSequence,
  readPaidProGenerationAttemptTerminalOutcome,
  rejectSupersededPaidProGenerationWrite,
} from "./paidProGenerationAttemptAuthority";

export const PAID_PRO_AUTHORITATIVE_WRITE_SURFACES = [
  "adoption",
  "session_freeze",
  "pipeline_validation_acceptance",
  "source_of_truth",
  "render_source",
  "fallback_state",
  "rejection_reason",
  "degraded_recovery",
  "pipeline_outcome",
] as const;

export type PaidProAuthoritativeWriteSurface = (typeof PAID_PRO_AUTHORITATIVE_WRITE_SURFACES)[number];

export type PaidProAuthoritativeWriteGuardResult =
  | { allowed: true }
  | { allowed: false; reason: string; surface: PaidProAuthoritativeWriteSurface };

export function guardPaidProAuthoritativeWrite(args: {
  agreementGenerationId?: string | null;
  attemptSequence?: number | null;
  surface: PaidProAuthoritativeWriteSurface;
}): PaidProAuthoritativeWriteGuardResult {
  if (
    rejectSupersededPaidProGenerationWrite({
      agreementGenerationId: args.agreementGenerationId,
      attemptSequence: args.attemptSequence,
      surface: args.surface,
    })
  ) {
    return { allowed: false, reason: "superseded_attempt", surface: args.surface };
  }
  const terminal = readPaidProGenerationAttemptTerminalOutcome({
    agreementGenerationId: args.agreementGenerationId,
    attemptSequence: args.attemptSequence,
  });
  if (terminal === "cancelled" || terminal === "superseded") {
    return { allowed: false, reason: `terminal_${terminal}`, surface: args.surface };
  }
  return { allowed: true };
}

export function isPaidProAuthoritativeWriteAllowed(args: {
  agreementGenerationId?: string | null;
  attemptSequence?: number | null;
  surface: PaidProAuthoritativeWriteSurface;
}): boolean {
  return guardPaidProAuthoritativeWrite(args).allowed;
}

export function readActiveAttemptSequenceForGuard(): number {
  return getActivePaidProGenerationAttemptSequence();
}
