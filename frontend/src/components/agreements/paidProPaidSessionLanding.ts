/**
 * Paid-session visitor landing — one hole, two faces.
 *
 * After pay, the visitor dump IS the deal. The visible landing is:
 *   (A) the commercial-ready dump / ≥200 non-hollow rebuild on AGREEMENT DRAFT, or
 *   (B) a 2–5 question ask for tenets that are actually missing from the original dump.
 *
 * "Building your Pro agreement" / shimmer / empty box must never cover (A).
 * Generate may continue in the background.
 */

import { meetsPaidSessionFallbackPaintFloor } from "./paidProFirstReviewDisplayAuthority";

/**
 * True when a paid session already has a visitor-visible deal body (≥200 non-hollow).
 * Same floor as shell paint and Retry lockout.
 */
export function resolvePaidSessionVisibleDealBody(args: {
  paidSessionActive: boolean;
  acceptedCanonicalPlain?: string | null;
  lastKnownGoodPlain?: string | null;
  intakeText?: string | null;
}): boolean {
  if (!args.paidSessionActive) return false;
  const intake = args.intakeText || "";
  return (
    meetsPaidSessionFallbackPaintFloor(args.acceptedCanonicalPlain || "", intake) ||
    meetsPaidSessionFallbackPaintFloor(args.lastKnownGoodPlain || "", intake)
  );
}

/**
 * Full-screen generating overlay / wait shimmer may show only when there is no
 * visitor-visible deal yet. A real missing-tenet ask (`awaiting_gaps`) is landing (B).
 */
export function shouldShowPaidSessionGeneratingOverlay(args: {
  phase: string | null | undefined;
  hasVisibleDealBody: boolean;
}): boolean {
  const phase = (args.phase || "").trim();
  if (!phase || phase === "premium_network_recoverable") return false;
  if (phase === "awaiting_gaps") return true;
  if (args.hasVisibleDealBody) return false;
  return true;
}
