/**
 * TEST522 — Single authoritative Paid Pro review state.
 *
 * Every consumer (shell title, document body, CTA mode, processing modal, retry recovery)
 * must read this snapshot — no independent render/readiness computation elsewhere.
 */

import type { AccessTier } from "../../access/types";
import { CreateUiStage } from "./createUiStage";
import type { CreateFlowProductionPhase } from "./createFlowTypes";
import {
  computeCreateFlowPaidProReviewReady,
  resolveAuthoritativeCreateFlowReviewShell,
  type AuthoritativeCreateFlowReviewShell,
  type ResolveAuthoritativeCreateFlowReviewShellInput,
} from "./authoritativeCreateFlowReviewShell";
import {
  PAID_PRO_REVIEW_SHELL_SUBTITLE,
  PAID_PRO_REVIEW_SHELL_TITLE,
} from "./authoritativePaidProReview";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import {
  readAcceptedPipelineReviewCorpusPlain,
} from "./paidProAcceptedPipelineReviewCorpus";
import { getPaidProSourceOfTruthText, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { getLatchedAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import { hasPaidProPipelineSessionAcceptance } from "./paidProPostAcceptanceValidatorCache";
import {
  paidProReviewStateBlocksReviewRender,
  resolvePaidProReviewState,
  type PaidProReviewState,
} from "./paidProReviewStateMachine";

export const PAID_PRO_REVIEW_RECOVERING_TITLE = "Review your Pro agreement";
export const PAID_PRO_REVIEW_RECOVERING_SUBTITLE =
  "Your Pro agreement needs another pass before review. Use the recovery options below — your intake is still here.";

export type PaidProReviewAuthorityInput = ResolveAuthoritativeCreateFlowReviewShellInput & {
  simpleProductFlow: boolean;
  liveWorkspaceTwoPane: boolean;
  paidProAuthoritative: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  displayPhase: string;
  createFlowPhase?: CreateFlowProductionPhase;
  tier?: AccessTier;
  premiumPaidDocumentSurface: boolean;
  premiumCheckoutCompleted: boolean;
  premiumGenerationInFlight: boolean;
  premiumCorpusValidationFailed: boolean;
  proFullDraftQualityRetry?: boolean;
  createFlowDraftPersistBlocked?: boolean;
  signerMetadataEditActive?: boolean;
  premiumPostCheckoutPhase?: string | null;
  suppressProcessingModal?: boolean;
  authoritativePremiumUiCommitted?: boolean;
};

export type PaidProValidatedCorpus = {
  plain: string;
  source: string | null;
  len: number;
};

/** The only gate for whether a paid Pro corpus may drive review render / title / CTA. */
export function resolveValidatedPaidProReviewCorpus(): PaidProValidatedCorpus {
  if (hasPaidProSourceOfTruth()) {
    const sot = getPaidProSourceOfTruthText().trim();
    if (sot.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      return { plain: sot, source: "paid_pro_source_of_truth", len: sot.length };
    }
  }
  const pipelinePlain = readAcceptedPipelineReviewCorpusPlain();
  if (pipelinePlain.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return { plain: pipelinePlain, source: "pipeline_validated", len: pipelinePlain.length };
  }
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  const latchedBody = latched?.body.trim() ?? "";
  if (
    latchedBody.length >= PAID_PRO_AUTHORITY_MIN_LEN &&
    hasPaidProPipelineSessionAcceptance({
      text: latchedBody,
      source: latched?.source ?? "server_full_draft",
    })
  ) {
    return { plain: latchedBody, source: "latched_accepted", len: latchedBody.length };
  }
  return { plain: "", source: null, len: 0 };
}

export type PaidProReviewAuthoritySnapshot = {
  reviewState: PaidProReviewState;
  shellKind: AuthoritativeCreateFlowReviewShell;
  /** Pro review chrome mounted (phase/stage) — not the same as content ready. */
  shellMounted: boolean;
  /** "Agreement ready" title — validated corpus exists and state is AUTHORITATIVE_READY. */
  contentReady: boolean;
  /** Validated document body may mount. */
  renderAllowed: boolean;
  blocksReviewRender: boolean;
  showRetryRecovery: boolean;
  showProcessingModal: boolean;
  validatedCorpus: PaidProValidatedCorpus;
  shellTitle: string;
  shellSubtitle: string;
};

export function resolvePaidProReviewAuthority(
  input: PaidProReviewAuthorityInput,
): PaidProReviewAuthoritySnapshot | null {
  const shellKind = resolveAuthoritativeCreateFlowReviewShell(input);
  if (shellKind !== "paid_pro") return null;

  const validatedCorpus = resolveValidatedPaidProReviewCorpus();
  const hasValidatedCorpus =
    validatedCorpus.len >= PAID_PRO_AUTHORITY_MIN_LEN ||
    Boolean(input.authoritativePremiumUiCommitted);

  const shellMounted = computeCreateFlowPaidProReviewReady({
    simpleProductFlow: input.simpleProductFlow,
    liveWorkspaceTwoPane: input.liveWorkspaceTwoPane,
    paidProAuthoritative: input.paidProAuthoritative,
    createUiStage: input.createUiStage,
    displayPhase: input.displayPhase,
    createFlowPhase: input.createFlowPhase,
    workspaceProEntitled: input.workspaceProEntitled,
    tier: input.tier,
    premiumPersistedFlowActive: input.premiumPersistedFlowActive,
    premiumSendPathUnlocked: input.premiumSendPathUnlocked,
    premiumCheckoutCompleted: input.premiumCheckoutCompleted,
  });

  const reviewState = resolvePaidProReviewState({
    premiumPaidDocumentSurface: input.premiumPaidDocumentSurface,
    premiumCheckoutCompleted: input.premiumCheckoutCompleted,
    premiumGenerationInFlight: input.premiumGenerationInFlight,
    hasValidAuthoritativeCorpus: hasValidatedCorpus,
    premiumCorpusValidationFailed: input.premiumCorpusValidationFailed,
    proFullDraftQualityRetry: input.proFullDraftQualityRetry,
    createFlowDraftPersistBlocked: input.createFlowDraftPersistBlocked,
    authoritativeBodyLen: validatedCorpus.len,
    signerMetadataEditActive: input.signerMetadataEditActive,
  });

  const terminalFailure = reviewState === "FAILED_PREMIUM_CORPUS";
  const contentReady =
    shellMounted &&
    !terminalFailure &&
    !input.proFullDraftQualityRetry &&
    !input.createFlowDraftPersistBlocked &&
    reviewState === "AUTHORITATIVE_READY" &&
    validatedCorpus.len >= PAID_PRO_AUTHORITY_MIN_LEN;

  const renderAllowed =
    contentReady &&
    validatedCorpus.len >= PAID_PRO_AUTHORITY_MIN_LEN &&
    !paidProReviewStateBlocksReviewRender(reviewState);

  const showProcessingModal =
    !input.suppressProcessingModal &&
    input.premiumPostCheckoutPhase === "processing" &&
    reviewState === "GENERATING";

  const showRetryRecovery =
    terminalFailure ||
    Boolean(input.proFullDraftQualityRetry) ||
    Boolean(input.createFlowDraftPersistBlocked);

  return {
    reviewState,
    shellKind,
    shellMounted,
    contentReady,
    renderAllowed,
    blocksReviewRender: !renderAllowed,
    showRetryRecovery,
    showProcessingModal,
    validatedCorpus,
    shellTitle: contentReady ? PAID_PRO_REVIEW_SHELL_TITLE : PAID_PRO_REVIEW_RECOVERING_TITLE,
    shellSubtitle: contentReady
      ? PAID_PRO_REVIEW_SHELL_SUBTITLE
      : PAID_PRO_REVIEW_RECOVERING_SUBTITLE,
  };
}

export function logPaidProReviewAuthorityResolved(snapshot: PaidProReviewAuthoritySnapshot): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-review-authority]", {
    reviewState: snapshot.reviewState,
    shellMounted: snapshot.shellMounted,
    contentReady: snapshot.contentReady,
    renderAllowed: snapshot.renderAllowed,
    validatedLen: snapshot.validatedCorpus.len,
    validatedSource: snapshot.validatedCorpus.source,
    showRetryRecovery: snapshot.showRetryRecovery,
    showProcessingModal: snapshot.showProcessingModal,
  });
}
