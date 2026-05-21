/**
 * Free/starter review shell identity — isolated from paid Pro guided render authority.
 */

import { clearPersistedGuidedSession } from "./guidedDealCompletion/guidedSessionPersistence";
import {
  clearPaidPremiumCompletionSession,
  clearPremiumCompletionDoneInLocalStorage,
  clearPremiumCompletionSnapshot,
  hasPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import type { FreeReviewSurfaceSource } from "./freeStreamlineDraftReview";

export const FREE_STARTER_REVIEW_TITLE = "Review your draft";
export const FREE_STARTER_REVIEW_SUBTITLE =
  "Your starter draft is ready. Review it, then continue when you're ready.";
export const FREE_STARTER_REVIEW_BADGE = "Starter draft";

export type ReviewShellKind = "free_starter" | "paid_pro" | "neutral";

export type ResolveReviewShellChromeInput = {
  isFreeStreamlineDraftReview: boolean;
  isFreeStarterReviewSurface: boolean;
  premiumPaidDocumentSurface: boolean;
  paidProAuthoritative: boolean;
  paidProReviewReadyBase: boolean;
  guidedCompletionActive: boolean;
};

export function resolveFreeStarterReviewShellActive(input: {
  isFreeStreamlineDraftReview: boolean;
  isFreeStarterReviewSurface: boolean;
  premiumPaidDocumentSurface: boolean;
  paidProAuthoritative: boolean;
}): boolean {
  if (input.isFreeStreamlineDraftReview) return true;
  if (
    input.premiumPaidDocumentSurface ||
    input.paidProAuthoritative ||
    hasPaidPremiumCompletionSession()
  ) {
    return false;
  }
  return input.isFreeStarterReviewSurface;
}

export function resolveReviewShellChrome(input: ResolveReviewShellChromeInput): {
  kind: ReviewShellKind;
  title: string;
  subtitle: string;
  badge: string | null;
  paidProReviewReady: boolean;
  blockPaidProShell: boolean;
} {
  const blockPaidProShell = resolveFreeStarterReviewShellActive({
    isFreeStreamlineDraftReview: input.isFreeStreamlineDraftReview,
    isFreeStarterReviewSurface: input.isFreeStarterReviewSurface,
    premiumPaidDocumentSurface: input.premiumPaidDocumentSurface,
    paidProAuthoritative: input.paidProAuthoritative,
  });
  const paidProReviewReady = input.paidProReviewReadyBase && !blockPaidProShell;

  if (blockPaidProShell) {
    return {
      kind: "free_starter",
      title: FREE_STARTER_REVIEW_TITLE,
      subtitle: FREE_STARTER_REVIEW_SUBTITLE,
      badge: FREE_STARTER_REVIEW_BADGE,
      paidProReviewReady: false,
      blockPaidProShell: true,
    };
  }

  if (paidProReviewReady) {
    return {
      kind: "paid_pro",
      title: "Review your Pro agreement",
      subtitle: "Your agreement is ready. Edit it, send it for review, or start signatures.",
      badge: null,
      paidProReviewReady: true,
      blockPaidProShell: false,
    };
  }

  return {
    kind: "neutral",
    title: FREE_STARTER_REVIEW_TITLE,
    subtitle: FREE_STARTER_REVIEW_SUBTITLE,
    badge: null,
    paidProReviewReady: false,
    blockPaidProShell: false,
  };
}

export function shouldGateGuidedRenderAuthorityForFreeReview(input: {
  isFreeStreamlineDraftReview: boolean;
  isFreeStarterReviewSurface: boolean;
  premiumPaidDocumentSurface: boolean;
}): boolean {
  if (input.isFreeStreamlineDraftReview || input.isFreeStarterReviewSurface) return true;
  if (!input.premiumPaidDocumentSurface) return true;
  return false;
}

export function preservePremiumCheckoutReturnInUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(window.location.href).searchParams.get("premiumCompletion") === "1";
  } catch {
    return false;
  }
}

/** Clear stale paid/guided shell state when starting a new free starter review (not checkout return). */
export function resetStalePaidReviewShellForFreeStarter(source: FreeReviewSurfaceSource): void {
  if (preservePremiumCheckoutReturnInUrl()) return;
  if (source !== "home_create_submit" && source !== "local_parse" && source !== "create_submit") {
    if (source !== "complexity_gate_starter" && source !== "api_hydrate" && source !== "api_late_merge") {
      return;
    }
  }
  clearPaidPremiumCompletionSession();
  clearPremiumCompletionSnapshot();
  clearPremiumCompletionDoneInLocalStorage();
  clearPersistedGuidedSession();
}

export function logFreeReviewShellResolved(args: {
  source: string;
  surface: string;
  isPaidPro: boolean;
  isGuidedCompletion: boolean;
  title: string;
}): void {
  console.info("[free-review-shell-resolved]", args);
}

export function logPaidReviewShellResolved(args: {
  source: string;
  surface: string;
  isPaidPro: boolean;
  isGuidedCompletion: boolean;
  title: string;
}): void {
  console.info("[paid-review-shell-resolved]", args);
}

export function logFreeReviewPaidShellBlocked(args: {
  reason: string;
  paidProAuthoritative: boolean;
  premiumPaidDocumentSurface: boolean;
  isFreeStreamlineDraftReview: boolean;
}): void {
  console.info("[free-review-paid-shell-blocked]", args);
}
