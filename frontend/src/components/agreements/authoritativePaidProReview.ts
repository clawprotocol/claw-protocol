/**
 * Paid Pro review surface: when frozen SoT exists, visible shell/body/CTA must never use free starter state.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import {
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

export const PAID_PRO_REVIEW_SHELL_TITLE = "Review your Pro agreement";
export const PAID_PRO_REVIEW_SHELL_SUBTITLE =
  "Your agreement is ready. Edit it, send it for review, or start signatures.";
export const PAID_PRO_REVIEW_BADGE = "Pro agreement";
export const PAID_PRO_REVIEW_CHIP_VERSION = "Pro agreement";
export const PAID_PRO_REVIEW_CHIP_STATE = "Ready for review";

export type AuthoritativePaidProReviewInput = {
  /** When explicitly false, do not treat as paid review (rare). */
  isPaidPro?: boolean;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
};

export function resolveAuthoritativePaidProReviewPlain(
  args?: AuthoritativePaidProReviewInput,
): string {
  const review = getPaidProDocumentForSurface("review", {
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
  });
  const display = getPaidProDocumentForSurface("display", {
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
  });
  const fromSurfaces = (review?.text || display?.text || "").trim();
  if (fromSurfaces.length >= PAID_PRO_AUTHORITY_MIN_LEN) return fromSurfaces;
  const sot = getPaidProSourceOfTruthText().trim();
  return sot.length >= PAID_PRO_AUTHORITY_MIN_LEN ? sot : fromSurfaces;
}

/**
 * True when paid SoT is established and a non-empty review/display corpus is available.
 */
export function isAuthoritativePaidProReview(input?: AuthoritativePaidProReviewInput): boolean {
  if (input?.isPaidPro === false) return false;
  if (!hasPaidProSourceOfTruth()) return false;
  return resolveAuthoritativePaidProReviewPlain(input).length >= PAID_PRO_AUTHORITY_MIN_LEN;
}

/** Single authority predicate — wins over guided Q&A, starter restore, and preview fallbacks. */
export function hasAcceptedPaidProAuthority(input?: AuthoritativePaidProReviewInput): boolean {
  return isAuthoritativePaidProReview(input);
}

export function shouldSuppressGuidedQuestionPanelForPaidAuthority(
  input?: AuthoritativePaidProReviewInput,
): boolean {
  return hasAcceptedPaidProAuthority(input);
}

export type PaidProAcceptanceRoutingMarkers = {
  clearStarterDraftReadyMarker: boolean;
  suppressGuidedQuestionPanel: boolean;
  openCanonicalFinalReview: boolean;
  setGuidedPhaseApplied: boolean;
};

/** After server_full_draft acceptance, UI must hard-route to canonical paid review (not guided Q&A / starter). */
export function resolvePaidProAcceptanceRoutingMarkers(args: {
  premiumRenderSource?: string | null;
  acceptedBodyLen: number;
}): PaidProAcceptanceRoutingMarkers {
  const len = Math.max(0, args.acceptedBodyLen);
  const pipelineAuthoritative =
    isAuthoritativePremiumPipelineRenderSource(args.premiumRenderSource) &&
    len >= PAID_PRO_AUTHORITY_MIN_LEN;
  const sotActive = hasAcceptedPaidProAuthority();
  const active = sotActive || pipelineAuthoritative;
  return {
    clearStarterDraftReadyMarker: active,
    suppressGuidedQuestionPanel: active,
    openCanonicalFinalReview: active,
    setGuidedPhaseApplied: active,
  };
}

/** Block restoring stored free starter snapshot into visible paid review. */
export function paidProAuthorityBlocksStarterReviewRestore(): boolean {
  return isAuthoritativePaidProReview();
}

export function starterPlainLooksStaleVersusPaidAuthority(
  starterPlain: string,
  paidPlain: string,
): boolean {
  const starter = starterPlain.trim();
  const paid = paidPlain.trim();
  if (paid.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  if (!starter) return true;
  if (starter.length < PAID_PRO_AUTHORITY_MIN_LEN) return true;
  if (starter.length < paid.length * 0.85) return true;
  return starter !== paid && paid.length > starter.length + 120;
}
