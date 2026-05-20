import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";
import { isPremiumSendWorkflowPhase } from "./committedReviewArtifact";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

/**
 * Live preview sync must not overwrite POST /premium-full-draft text once an authoritative pipeline
 * body exists (snapshot and/or in-memory hydration).
 */
export function shouldSkipAgreementDocLivePreviewSync(args: {
  premiumPersistedFlowActive: boolean;
  snapshot: PremiumCompletionSnapshot | null;
  pipelineRenderSourceRef: string | null | undefined;
  hydratedBodyTrimmed: string;
  createFlowPhase?: string | null;
  createUiStage?: string | null;
}): boolean {
  if (isPremiumSendWorkflowPhase(args.createFlowPhase) || args.createUiStage === "RECIPIENTS") {
    return true;
  }
  const snap = args.snapshot;
  const snapBody = (snap?.premiumWinningBodyText || snap?.premiumReadonlyPlainText || "").trim();

  const snapshotAuthoritative =
    Boolean(snap?.premiumAccepted) &&
    isAuthoritativePremiumPipelineRenderSource(String(snap?.premiumPipelineRenderSource || "")) &&
    snapBody.length >= 500;

  const pipelineRefAuthoritative =
    isAuthoritativePremiumPipelineRenderSource(String(args.pipelineRenderSourceRef || "")) &&
    args.hydratedBodyTrimmed.length >= 500;

  const persistedFlowWithCorpus =
    args.premiumPersistedFlowActive &&
    (snapBody.length >= 500 || pipelineRefAuthoritative);

  return snapshotAuthoritative || persistedFlowWithCorpus || pipelineRefAuthoritative;
}

/** Snapshot persisted but React doc state never received the winning corpus (duplicate applySuccess guard). */
export function needsAuthoritativeVisibleSurfaceRepair(args: {
  winningBodyLen: number;
  agreementDocumentTextLen: number;
}): boolean {
  if (args.winningBodyLen < 500) return false;
  return args.agreementDocumentTextLen < 500 || args.agreementDocumentTextLen < args.winningBodyLen - 200;
}

export type PremiumAuthoritativeVisibleCommitFailedPayload = {
  acceptedBodyLen: number;
  agreementDocumentTextLen: number;
  renderedAgreementPreviewLen: number;
  reviewDraftPlainLen: number;
  createUiStage: string;
  createFlowPhase: string;
  displayPhase: string;
  proUpgradeUseStarterView: boolean;
  proFullDraftQualityRetry: boolean;
  premiumPostCheckoutPhase: string | null;
  premiumRenderResolveSource: string | null;
};

export function logPremiumAuthoritativeVisibleCommitFailed(payload: PremiumAuthoritativeVisibleCommitFailedPayload): void {
  // eslint-disable-next-line no-console
  console.error("[premium-authoritative-visible-commit-failed]", payload);
}
