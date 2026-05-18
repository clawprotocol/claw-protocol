import { CreateUiStage } from "./createUiStage";
import type { CreateFlowProductionPhase } from "./createFlowTypes";

export type FreeReviewSurfaceSource =
  | "local_parse"
  | "basic_parse_timeout"
  | "home_create_submit"
  | "create_submit"
  | "api_hydrate"
  | "api_late_merge"
  | "session_restore"
  | "display_phase_guard";

export type ResolveIsFreeStreamlineDraftReviewInput = {
  simpleProductFlow: boolean;
  liveWorkspaceTwoPane: boolean;
  createProductionTwoPane: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  createFlowPhase: CreateFlowProductionPhase;
  hasDraft: boolean;
  paidProAuthoritative: boolean;
  premiumPaidDocumentSurface: boolean;
  premiumPersistedFlowActive: boolean;
  premiumSendPathUnlocked: boolean;
  hasPaidPremiumCompletionSession: () => boolean;
  showUpgradeToFullDraftOnReview: boolean;
};

/**
 * Universal free DRAFT review surface — not limited to first-session streamline UX.
 * When true, render StarterDraftDocumentSurface + ProConversionComparisonCard chrome.
 */
export function resolveIsFreeStreamlineDraftReview(input: ResolveIsFreeStreamlineDraftReviewInput): boolean {
  if (!input.simpleProductFlow || !input.liveWorkspaceTwoPane || !input.createProductionTwoPane) return false;
  if (input.createUiStage !== CreateUiStage.DRAFT || !input.hasDraft) return false;
  if (input.paidProAuthoritative || input.premiumPaidDocumentSurface) return false;
  if (input.premiumPersistedFlowActive || input.premiumSendPathUnlocked) return false;
  if (input.hasPaidPremiumCompletionSession()) return false;
  if (
    input.createFlowPhase !== "draft_ready_for_review" &&
    input.createFlowPhase !== "generating_draft"
  ) {
    return false;
  }
  return true;
}

export function logFreeReviewSurfaceResolved(args: {
  source: FreeReviewSurfaceSource;
  displayPhase: string;
  createFlowPhase: CreateFlowProductionPhase;
  hasDraft: boolean;
  fromHomeAutoGenerate: boolean;
}): void {
  console.info("[free-review-surface-resolved]", {
    source: args.source,
    surface: "starter_document_surface",
    displayPhase: args.displayPhase,
    createFlowPhase: args.createFlowPhase,
    hasDraft: args.hasDraft,
    fromHomeAutoGenerate: args.fromHomeAutoGenerate,
  });
}

export function logFreeReviewLegacySurfaceBlocked(args: {
  reason: string;
  displayPhase: string;
  createFlowPhase: CreateFlowProductionPhase;
}): void {
  console.info("[free-review-legacy-surface-blocked]", args);
}

export function logFreeReviewApiLateMerge(args: {
  agreementIdShort: string | null;
  displayPhaseBefore: string;
}): void {
  console.info("[free-review-api-late-merge]", args);
}

export type CommitFreeDraftForReviewPatch = {
  createFlowPhase: CreateFlowProductionPhase;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  displayPhase: "review";
  draftNowCommitted: true;
  mobileWorkspacePane: "preview";
  previewPaneRevealed: true;
  followUpDetailTotal: 0;
};

export function buildCommitFreeDraftForReviewPatch(): CommitFreeDraftForReviewPatch {
  return {
    createFlowPhase: "draft_ready_for_review",
    createUiStage: CreateUiStage.DRAFT,
    displayPhase: "review",
    draftNowCommitted: true,
    mobileWorkspacePane: "preview",
    previewPaneRevealed: true,
    followUpDetailTotal: 0,
  };
}
