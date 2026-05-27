/**
 * Single Pro review footer contract — guided completion OR freeform edit, never both, never gap-only.
 */

import type { AgreementReviewMode } from "../agreementReviewMode";
import { isSourceComparisonReviewMode } from "../agreementReviewMode";
import type { MaterialMissingItem } from "../proAgreementCompleteness/types";
import {
  buildGuidedSessionFromAgreement,
  frozenQuestionTotal,
  getCurrentVariable,
} from "./guidedCompletionEngine";
import {
  resolveGuidedCompletionRenderState,
  type GuidedCompletionRenderState,
  type GuidedPanelMountedSurface,
} from "./resolveGuidedCompletionRenderState";
import { variableHasSelectableAnswerPath } from "./shouldRenderGuidedCompletionPanel";
import type { GuidedCompletionSession } from "./types";

export type ProReviewFooterMode =
  | "guided_completion"
  | "freeform_edit"
  | "source_comparison"
  | "hidden";

export type ResolveProReviewFooterStateArgs = {
  bodyText?: string;
  intakeText?: string | null;
  materialMissingItems?: readonly MaterialMissingItem[];
  guidedSession?: GuidedCompletionSession | null;
  agreementReviewMode?: AgreementReviewMode | null;
  /** Pro review document surface is active (paid body visible). */
  proReviewSurfaceActive?: boolean;
  /** User can proceed with paid Pro document (not stuck in retry-only). */
  canProceedWithPaidProDocument?: boolean;
  recoveryPanelMounted?: boolean;
  bodyUsable?: boolean;
  /** When false, suppress guided questions (starter clone / premium unavailable). */
  paidProAuthoritativeCorpusReady?: boolean;
};

export type ProReviewFooterState = {
  mode: ProReviewFooterMode;
  reason: string;
  currentQuestionId: string | null;
  questionCount: number;
  canRenderQuestion: boolean;
  /** Exactly one GuidedDealCompletionPanel when true. */
  mountGuidedPanel: boolean;
  showFreeformEdit: boolean;
  showFinalizeDeliveryCollapsed: boolean;
  hideFinalizeAdvisory: boolean;
  hideFinalizeGapBullets: boolean;
  hideRecommendedNextStep: boolean;
  guidedRenderState: GuidedCompletionRenderState;
};

function sessionForFooter(args: ResolveProReviewFooterStateArgs): GuidedCompletionSession | null {
  if (args.guidedSession) return args.guidedSession;
  const body = (args.bodyText || "").trim();
  if (body.length < 200) return null;
  return buildGuidedSessionFromAgreement({
    intakeRaw: args.intakeText,
    body,
    materialItems: args.materialMissingItems,
  });
}

export function resolveProReviewFooterState(args: ResolveProReviewFooterStateArgs): ProReviewFooterState {
  const reviewMode = args.agreementReviewMode ?? "generated_agreement_review";
  const bodyText = (args.bodyText || "").trim();
  const bodyUsable = args.bodyUsable ?? bodyText.length >= 500;
  const session = sessionForFooter(args);
  const questionCount = session ? frozenQuestionTotal(session) : 0;
  const current = session ? getCurrentVariable(session) : null;
  const currentRenderable = Boolean(
    current && variableHasSelectableAnswerPath(current) && current.question.trim().length > 8,
  );
  const sessionHasQueue = Boolean(session?.queue.length);
  const mayMountGuided =
    bodyUsable &&
    sessionHasQueue &&
    currentRenderable &&
    !isSourceComparisonReviewMode(reviewMode);

  const panelSurface: GuidedPanelMountedSurface = mayMountGuided && args.canProceedWithPaidProDocument
    ? "document_editor"
    : mayMountGuided && args.recoveryPanelMounted
      ? "recovery_banner"
      : null;

  const guidedRenderState = resolveGuidedCompletionRenderState({
    bodyText,
    intakeText: args.intakeText,
    materialMissingItems: args.materialMissingItems,
    guidedSession: session,
    panelMountedSurface: panelSurface,
    bodyUsable,
    paidProAuthoritativeCorpusReady: args.paidProAuthoritativeCorpusReady,
    draftState: isSourceComparisonReviewMode(reviewMode) ? "source_comparison" : "paid_pro",
  });

  const baseHidden = !args.proReviewSurfaceActive;

  if (isSourceComparisonReviewMode(reviewMode)) {
    return {
      mode: "source_comparison",
      reason: "source_comparison_review",
      currentQuestionId: null,
      questionCount: 0,
      canRenderQuestion: false,
      mountGuidedPanel: false,
      showFreeformEdit: false,
      showFinalizeDeliveryCollapsed: false,
      hideFinalizeAdvisory: true,
      hideFinalizeGapBullets: true,
      hideRecommendedNextStep: true,
      guidedRenderState,
    };
  }

  if (baseHidden) {
    return {
      mode: "hidden",
      reason: "pro_review_surface_inactive",
      currentQuestionId: null,
      questionCount,
      canRenderQuestion: false,
      mountGuidedPanel: false,
      showFreeformEdit: false,
      showFinalizeDeliveryCollapsed: false,
      hideFinalizeAdvisory: true,
      hideFinalizeGapBullets: true,
      hideRecommendedNextStep: true,
      guidedRenderState,
    };
  }

  const canRenderQuestion =
    bodyUsable && sessionHasQueue && currentRenderable && guidedRenderState.unresolvedRenderableCount > 0;

  const mountGuidedPanel = canRenderQuestion && panelSurface !== null;

  if (mountGuidedPanel && panelSurface) {
    return {
      mode: "guided_completion",
      reason: "guided_panel_mounted_below_draft",
      currentQuestionId: current?.id ?? null,
      questionCount,
      canRenderQuestion: true,
      mountGuidedPanel,
      showFreeformEdit: false,
      showFinalizeDeliveryCollapsed: true,
      hideFinalizeAdvisory: true,
      hideFinalizeGapBullets: true,
      hideRecommendedNextStep: true,
      guidedRenderState: {
        ...guidedRenderState,
        canRenderGuidedQuestions: true,
        shouldShowNeedsDetails: false,
        shouldShowCompleteAgreementHeading: true,
        shouldShowUseCompleteBelowCopy: false,
        reason: "renderable_question_mounted",
      },
    };
  }

  return {
    mode: "freeform_edit",
    reason: sessionHasQueue ? "no_renderable_current_question" : "no_guided_queue",
    currentQuestionId: current?.id ?? null,
    questionCount,
    canRenderQuestion: false,
    mountGuidedPanel: false,
    showFreeformEdit: true,
    showFinalizeDeliveryCollapsed: true,
    hideFinalizeAdvisory: true,
    hideFinalizeGapBullets: true,
    hideRecommendedNextStep: true,
    guidedRenderState: {
      ...guidedRenderState,
      canRenderGuidedQuestions: false,
      shouldShowNeedsDetails: false,
      shouldShowCompleteAgreementHeading: false,
      shouldShowUseCompleteBelowCopy: false,
    },
  };
}

export function logProReviewFooterState(state: ProReviewFooterState): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[pro-review-footer]", {
    mode: state.mode,
    reason: state.reason,
    currentQuestionId: state.currentQuestionId,
    questionCount: state.questionCount,
    canRenderQuestion: state.canRenderQuestion,
    mountGuidedPanel: state.mountGuidedPanel,
  });
}
