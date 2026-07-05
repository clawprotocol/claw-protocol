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
import { CreateUiStage } from "./createUiStage";
import type { CreateFlowProductionPhase } from "./createFlowTypes";
import { shouldLogPaidProAuthoritySurfaceEvent } from "./paidProAuthoritySurfaceLog";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  shouldSuppressPaidAcceptedFreeStarterSurfaces,
} from "./authoritativeCreateFlowReviewShell";
import { isPaidProFirstReviewDisplayActive } from "./paidProPostCheckoutRenderGate";
import { resolveFreeStarterReviewShellBlocked } from "./paidProCreateFlowRouting";
import {
  computeCreateFlowPaidProReviewContentReady,
  computeCreateFlowPaidProReviewReady,
  resolveAuthoritativeCreateFlowReviewShell,
  type ResolveAuthoritativeCreateFlowReviewShellInput,
} from "./authoritativeCreateFlowReviewShell";

export const FREE_STARTER_REVIEW_TITLE = "Review your draft";
export const FREE_STARTER_REVIEW_SUBTITLE =
  "Your starter draft is ready. Review it, then continue when you're ready.";
export const FREE_STARTER_REVIEW_BADGE = "Starter draft";

export const PAID_PRO_REVIEW_RECOVERING_TITLE = "Review your Pro agreement";
export const PAID_PRO_REVIEW_RECOVERING_SUBTITLE =
  "Your Pro agreement needs another pass before review. Use the recovery options below — your intake is still here.";

export type ReviewShellKind = "free_starter" | "paid_pro" | "neutral";

export type ResolveReviewShellChromeInput = ResolveAuthoritativeCreateFlowReviewShellInput & {
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
  simpleProductFlow?: boolean;
  liveWorkspaceTwoPane?: boolean;
  createUiStage?: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  displayPhase?: string;
  createFlowPhase?: CreateFlowProductionPhase;
  agreementDocumentText?: string;
  pipelineWinningBody?: string | null;
  hydratedPremiumBody?: string | null;
  authoritativeBodyLen?: number;
  proFullDraftQualityRetry?: boolean;
  createFlowDraftPersistBlocked?: boolean;
};

export function resolveFreeStarterReviewShellActive(
  input: ResolveAuthoritativeCreateFlowReviewShellInput & {
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
  if (shouldSuppressPaidAcceptedFreeStarterSurfaces({ shellInput: input })) return false;
  if (resolveAuthoritativeCreateFlowReviewShell(input) === "paid_pro") return false;
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
  paidProReviewContentReady: boolean;
  blockPaidProShell: boolean;
} {
  const shell = resolveAuthoritativeCreateFlowReviewShell(input);
  if (shell === "paid_pro") {
    const paidProReviewReady =
      (input.simpleProductFlow != null &&
        input.liveWorkspaceTwoPane != null &&
        input.createUiStage != null &&
        input.displayPhase != null &&
        computeCreateFlowPaidProReviewReady({
          simpleProductFlow: Boolean(input.simpleProductFlow),
          liveWorkspaceTwoPane: Boolean(input.liveWorkspaceTwoPane),
          paidProAuthoritative: input.paidProAuthoritative,
          createUiStage: input.createUiStage,
          displayPhase: input.displayPhase,
          createFlowPhase: input.createFlowPhase,
          workspaceProEntitled: input.workspaceProEntitled,
          tier: input.tier,
          premiumPersistedFlowActive: input.premiumPersistedFlowActive,
          premiumSendPathUnlocked: input.premiumSendPathUnlocked,
        })) ||
      input.paidProReviewReadyBase ||
      input.paidProAuthoritative;
    const paidProReviewContentReady = computeCreateFlowPaidProReviewContentReady({
      simpleProductFlow: Boolean(input.simpleProductFlow),
      liveWorkspaceTwoPane: Boolean(input.liveWorkspaceTwoPane),
      paidProAuthoritative: input.paidProAuthoritative,
      createUiStage: input.createUiStage ?? CreateUiStage.DRAFT,
      displayPhase: input.displayPhase ?? "review",
      createFlowPhase: input.createFlowPhase,
      workspaceProEntitled: input.workspaceProEntitled,
      tier: input.tier,
      premiumPersistedFlowActive: input.premiumPersistedFlowActive,
      premiumSendPathUnlocked: input.premiumSendPathUnlocked,
      draft: input.draft ?? null,
      intakeText: input.intakeText ?? null,
      agreementDocumentText: input.agreementDocumentText,
      premiumRenderSource: input.premiumRenderSource ?? null,
      premiumCheckoutCompleted: input.premiumCheckoutCompleted,
      pipelineWinningBody: input.pipelineWinningBody,
      hydratedPremiumBody: input.hydratedPremiumBody,
      authoritativeBodyLen: input.authoritativeBodyLen,
      proFullDraftQualityRetry: input.proFullDraftQualityRetry,
      createFlowDraftPersistBlocked: input.createFlowDraftPersistBlocked,
    });
    return {
      kind: "paid_pro",
      title: paidProReviewContentReady ? PAID_PRO_REVIEW_SHELL_TITLE : PAID_PRO_REVIEW_RECOVERING_TITLE,
      subtitle: paidProReviewContentReady
        ? PAID_PRO_REVIEW_SHELL_SUBTITLE
        : PAID_PRO_REVIEW_RECOVERING_SUBTITLE,
      badge: PAID_PRO_REVIEW_BADGE,
      paidProReviewReady: Boolean(paidProReviewReady),
      paidProReviewContentReady,
      blockPaidProShell: false,
    };
  }

  return {
    kind: "free_starter",
    title: FREE_STARTER_REVIEW_TITLE,
    subtitle: FREE_STARTER_REVIEW_SUBTITLE,
    badge: FREE_STARTER_REVIEW_BADGE,
    paidProReviewReady: false,
    paidProReviewContentReady: false,
    blockPaidProShell: true,
  };
}

export function shouldGateGuidedRenderAuthorityForFreeReview(
  input: ResolveAuthoritativeCreateFlowReviewShellInput & {
    isFreeStreamlineDraftReview: boolean;
    isFreeStarterReviewSurface: boolean;
    premiumPaidDocumentSurface: boolean;
  },
): boolean {
  if (resolveAuthoritativeCreateFlowReviewShell(input) === "paid_pro") return false;
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
  if (shouldSuppressPaidAcceptedFreeStarterSurfaces()) return;
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
