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

import { looksLikeEmail } from "./recipientEmailValidation";
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
 * Visitor-visible 1–5 question missing-tenet ask is already the landing.
 * Free (`freeStarterMissingTenetAsk`) and paid (`awaiting_gaps`) share this.
 */
export function isVisibleMissingTenetAskLanding(args: {
  phase?: string | null;
  freeStarterAskQuestionCount?: number;
  paidGapQuestionCount?: number;
}): boolean {
  const freeCount = args.freeStarterAskQuestionCount ?? 0;
  if (freeCount >= 1 && freeCount <= 5) return true;
  const paidCount = args.paidGapQuestionCount ?? 0;
  if ((args.phase || "").trim() === "awaiting_gaps" && paidCount >= 1 && paidCount <= 5) {
    return true;
  }
  return false;
}

/**
 * Full-screen generating overlay / wait shimmer may show only when there is no
 * visitor-visible deal and no missing-tenet ask landing. A real ask
 * (`awaiting_gaps` / freeStarterMissingTenetAsk) is landing (B) — overlay must
 * not cover clickable inputs. Generate may continue in the background.
 */
export function shouldShowPaidSessionGeneratingOverlay(args: {
  phase: string | null | undefined;
  hasVisibleDealBody: boolean;
  hasVisibleAskLanding?: boolean;
}): boolean {
  if (args.hasVisibleAskLanding) return false;
  const phase = (args.phase || "").trim();
  if (!phase || phase === "premium_network_recoverable") return false;
  if (phase === "awaiting_gaps") return false;
  if (args.hasVisibleDealBody) return false;
  return true;
}

function trimSigner(s: string | null | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

/**
 * Visitor after-pay Continue needs two human names + emails.
 * Title, address, 1001-char generate SoT, and a new agreement GET are not required.
 */
export function resolvePaidSessionTwoSignerNamesEmailsComplete(args: {
  signer1Name?: string | null;
  signer1Email?: string | null;
  signer2Name?: string | null;
  signer2Email?: string | null;
}): boolean {
  const n1 = trimSigner(args.signer1Name);
  const n2 = trimSigner(args.signer2Name);
  const e1 = trimSigner(args.signer1Email);
  const e2 = trimSigner(args.signer2Email);
  return Boolean(n1.length >= 2 && n2.length >= 2 && looksLikeEmail(e1) && looksLikeEmail(e2));
}

/**
 * After pay, a visible deal on the card + two signer names/emails is enough
 * to open existing SimpleProFinalReviewScreen. Do not sit on Preparing.
 */
export function canOpenPaidSessionFinalReviewAfterSigners(args: {
  paidSessionActive: boolean;
  visibleDealBody: boolean;
  twoSignerNamesAndEmailsComplete: boolean;
}): boolean {
  return Boolean(
    args.paidSessionActive && args.visibleDealBody && args.twoSignerNamesAndEmailsComplete,
  );
}

/**
 * Visible after-pay rebuild is already the deal. Review-screen hydrate must not
 * wait for 1001-char generate SoT or a verified agreement GET.
 */
export function shouldSkipPaidSessionReviewHydrateWait(args: {
  paidSessionActive: boolean;
  visibleDealBody: boolean;
}): boolean {
  return Boolean(args.paidSessionActive && args.visibleDealBody);
}

/**
 * After-pay visitor with two signers finalized: existing SimpleProFinalReviewScreen
 * owns Send for review / Prepare for signing. Do not sit on another Continue,
 * require the inline signer-setup latch, or suppress those on-card actions.
 */
export function shouldShowPaidSessionFinalReviewActions(args: {
  paidSessionActive: boolean;
  visibleDealBody: boolean;
  twoSignerNamesAndEmailsComplete: boolean;
  signerMetadataFinalized: boolean;
  signaturePreparationRequested?: boolean;
}): boolean {
  return (
    canOpenPaidSessionFinalReviewAfterSigners({
      paidSessionActive: args.paidSessionActive,
      visibleDealBody: args.visibleDealBody,
      twoSignerNamesAndEmailsComplete: args.twoSignerNamesAndEmailsComplete,
    }) &&
    Boolean(args.signerMetadataFinalized) &&
    !args.signaturePreparationRequested
  );
}

/**
 * Tear down paidProSignerMetadataFinalizedLatch only on a true session reset.
 * After-pay ≥200 rebuilds are never 1001-char SoT; missing SoT must not clear
 * the latch when a paid session already has a visible deal.
 */
export function shouldTeardownPaidProSignerMetadataFinalizedLatch(args: {
  latch: boolean;
  hasPaidProSourceOfTruth: boolean;
  paidSessionVisibleDealBody: boolean;
  shouldSkipPaidSessionReviewHydrateWait: boolean;
}): boolean {
  if (!args.latch) return false;
  if (args.hasPaidProSourceOfTruth) return false;
  if (args.paidSessionVisibleDealBody || args.shouldSkipPaidSessionReviewHydrateWait) {
    return false;
  }
  return true;
}
