/**
 * Free/starter review shell identity — isolated from paid Pro guided render authority.
 */

import { hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import { clearStalePaidProAuthorityForFreshFreeStarter } from "../../launch/newAgreementSessionReset";
import { markCurrentSessionFreeStarterIntent } from "./paidProSessionEligibility";
import {
  isAuthoritativePaidProReview,
  PAID_PRO_REVIEW_BADGE,
  PAID_PRO_REVIEW_SHELL_SUBTITLE,
  PAID_PRO_REVIEW_SHELL_TITLE,
} from "./authoritativePaidProReview";
import type { FreeReviewSurfaceSource } from "./freeStreamlineDraftReview";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { isPaidProFirstReviewDisplayActive } from "./paidProPostCheckoutRenderGate";
import { resolveFreeStarterReviewShellBlocked } from "./paidProCreateFlowRouting";

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
  premiumCheckoutCompleted?: boolean;
  intakeText?: string | null;
  draft?: import("./intakeSmartDefaults").ParsedDraftShape | null;
  premiumRenderSource?: string | null;
};

export function resolveFreeStarterReviewShellActive(input: {
  isFreeStreamlineDraftReview: boolean;
  isFreeStarterReviewSurface: boolean;
  premiumPaidDocumentSurface: boolean;
  paidProAuthoritative: boolean;
  /** Hard invariant: any completed paid checkout / QA bypass forbids the starter shell. */
  premiumCheckoutCompleted?: boolean;
  premiumPersistedFlowActive?: boolean;
  intakeText?: string | null;
  draft?: import("./intakeSmartDefaults").ParsedDraftShape | null;
  premiumRenderSource?: string | null;
}): boolean {
  if (
    resolveFreeStarterReviewShellBlocked({
      isFreeStreamlineDraftReview: input.isFreeStreamlineDraftReview,
      isFreeStarterReviewSurface: input.isFreeStarterReviewSurface,
      premiumPaidDocumentSurface: input.premiumPaidDocumentSurface,
      paidProAuthoritative: input.paidProAuthoritative,
      premiumCheckoutCompleted: input.premiumCheckoutCompleted,
      premiumPersistedFlowActive: input.premiumPersistedFlowActive,
      acceptedPipelineBody: input.draft?.premium_server_full_document_text ?? null,
      acceptedPipelineSource: input.premiumRenderSource,
    })
  ) {
    return false;
  }
  if (
    isPaidProFirstReviewDisplayActive({
      premiumCheckoutCompleted: input.premiumCheckoutCompleted,
      intakeText: input.intakeText,
      draft: input.draft,
      premiumRenderSource: input.premiumRenderSource,
      isPaidPro: input.paidProAuthoritative,
    })
  ) {
    return false;
  }
  // HARD INVARIANT: isPaidPro === true (checkout completed) => free starter shell MUST NOT mount,
  // even when the authoritative corpus failed validation. Paid surfaces fail closed into the
  // explicit recovery state, never into a silent starter degrade.
  if (
    input.premiumCheckoutCompleted ||
    hasPaidProSourceOfTruth() ||
    isAuthoritativePaidProReview({ isPaidPro: input.paidProAuthoritative })
  ) {
    return false;
  }
  if (
    input.premiumPaidDocumentSurface ||
    input.paidProAuthoritative ||
    hasPaidPremiumCompletionSession()
  ) {
    return false;
  }
  if (input.isFreeStreamlineDraftReview) return true;
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
    premiumCheckoutCompleted: input.premiumCheckoutCompleted,
    intakeText: input.intakeText,
    draft: input.draft,
    premiumRenderSource: input.premiumRenderSource,
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

  if (paidProReviewReady || isAuthoritativePaidProReview({ isPaidPro: input.paidProAuthoritative })) {
    return {
      kind: "paid_pro",
      title: PAID_PRO_REVIEW_SHELL_TITLE,
      subtitle: PAID_PRO_REVIEW_SHELL_SUBTITLE,
      badge: PAID_PRO_REVIEW_BADGE,
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
export function resetStalePaidReviewShellForFreeStarter(
  source: FreeReviewSurfaceSource,
  opts?: { skipFreeStarterLatch?: boolean },
): void {
  if (preservePremiumCheckoutReturnInUrl()) return;
  if (source !== "home_create_submit" && source !== "local_parse" && source !== "create_submit") {
    if (source !== "complexity_gate_starter" && source !== "api_hydrate" && source !== "api_late_merge") {
      return;
    }
  }
  clearStalePaidProAuthorityForFreshFreeStarter();
  if (opts?.skipFreeStarterLatch) return;
  markCurrentSessionFreeStarterIntent();
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
  if (
    !shouldLogPaidProAuthoritySurfaceEvent(
      {
        event: "paid-review-shell-resolved",
        surface: args.surface,
        hash: args.title,
        source: args.source,
      },
      { dev: true },
    )
  ) {
    return;
  }
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
