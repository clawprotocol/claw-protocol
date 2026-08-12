/**
 * Single canonical paid Pro first-review entry — post-checkout AND returning paid /app/create.
 * Both paths must call `planEnterCanonicalPaidProReviewFlow` and apply the same UI/corpus plan.
 */

import { CreateUiStage } from "./createUiStage";
import type { CreateFlowProductionPhase } from "./createFlowTypes";
import type { GuidedCompletionPhase } from "./guidedDealCompletion/guidedCompletionPhase";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruthState";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import {
  hasPaidCreateFlowPipelineAcceptance,
  isCreateFlowPaidAcceptedOrAuthoritativeActive,
} from "./authoritativeCreateFlowReviewShell";
import {
  commitPaidProAcceptanceStorageHygiene,
  shouldApplyCreateFlowPaidFirstReviewRouting,
} from "./paidProAcceptanceRouting";
import { resolveCreateFlowPaidAcceptedCorpusPlain } from "./paidProCreateFlowReviewHandoff";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";
import { resolveSimpleProFinalReviewActive } from "./simpleProFinalReviewPhase";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { resolveLegalEntitiesForCanonicalMetadata } from "./canonicalLegalEntitiesForMetadata";
import { markPaidProPipelineAcceptedCorpusHash, readPaidProPipelineAcceptedCorpusBody } from "./paidProPipelineAcceptedCorpus";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";

export type CanonicalPaidProReviewEntrySource =
  | "post_checkout_apply_success"
  | "dashboard_paid_create"
  | "returning_paid_create";

export type EnterCanonicalPaidProReviewFlowArgs = {
  source: CanonicalPaidProReviewEntrySource;
  corpusPlain: string;
  pipelineSource: string;
  draft: ParsedDraftShape;
  intakeText: string;
  agreementGenerationId?: string | null;
  generationOutcome?: string | null;
  recipientCandidates?: Array<{ name?: string; email?: string; role?: string }>;
  alreadyOpened?: boolean;
  premiumRenderResolveSource?: string | null;
  /** When true, skip re-entry if final review already opened (returning create latch). */
  respectAlreadyOpened?: boolean;
};

export type CanonicalPaidProReviewUiPlan = {
  proUpgradeUseStarterView: false;
  proFullDraftQualityRetry: false;
  premiumPostCheckoutPhase: null;
  premiumPipelineUserMessage: null;
  proFullDraftCustomGateMessage: null;
  guidedCompletionPhase: "applied";
  guidedFinalReviewExplicitlyOpened: true;
  premiumPersistedFlowActive: true;
  premiumSendPathUnlocked: true;
  createFlowPhase: CreateFlowProductionPhase;
  displayPhase: "review";
  createUiStage: typeof CreateUiStage.DRAFT;
  mobileWorkspacePane: "preview";
  previewPaneRevealed: true;
  agreementDocumentDirty: false;
};

export type CanonicalPaidProReviewCorpusRefPlan = {
  agreementDocumentPlain: string;
  lastPremiumWinningCorpus: string;
  premiumPipelineOutputBody: string;
  hydratedPremiumBody: string;
  lastKnownGoodAuthoritativeDraft: string;
  acceptedReviewCorpus: string;
  authoritativeAgreementSnapshot: string;
  guidedFinalReviewExplicitlyUnlocked: true;
};

export type CanonicalPaidProSignerHandoffPlan = {
  signerNames: string[];
  signerTitles: string[];
  partyLegalNames: string[];
  partyEmails: string[];
  partyAddresses: string[];
};

export type CanonicalPaidProReviewFlowPlan = {
  shouldApply: boolean;
  blockedReason?: string;
  source: CanonicalPaidProReviewEntrySource;
  corpusPlain: string;
  pipelineSource: string;
  ui: CanonicalPaidProReviewUiPlan;
  refs: CanonicalPaidProReviewCorpusRefPlan;
  establishSourceOfTruth: boolean;
  commitReviewArtifact: boolean;
  mergeDraftWithCorpus: boolean;
  markPipelineValidationPassed: boolean;
  signerHandoff: CanonicalPaidProSignerHandoffPlan | null;
};

export type ResolveCanonicalPaidProReviewCorpusArgs = {
  winningBody?: string | null;
  snapshotPlain?: string | null;
  draft?: ParsedDraftShape | null;
  agreementDocumentText?: string;
  pipelineWinningBody?: string | null;
  hydratedPremiumBody?: string | null;
  premiumDeliverablePlain?: string | null;
};

export function resolveCanonicalPaidProReviewCorpus(
  args: ResolveCanonicalPaidProReviewCorpusArgs,
): string {
  return resolveCreateFlowPaidAcceptedCorpusPlain(args).trim();
}

export function planEnterCanonicalPaidProReviewFlow(
  args: EnterCanonicalPaidProReviewFlowArgs,
): CanonicalPaidProReviewFlowPlan {
  const corpusPlain = (args.corpusPlain || "").trim();
  const pipelineSource = (args.pipelineSource || "server_full_draft").trim();
  const baseBlocked: CanonicalPaidProReviewFlowPlan = {
    shouldApply: false,
    blockedReason: "corpus_not_ready",
    source: args.source,
    corpusPlain,
    pipelineSource,
    ui: buildCanonicalUiPlan(),
    refs: buildCorpusRefPlan(""),
    establishSourceOfTruth: false,
    commitReviewArtifact: false,
    mergeDraftWithCorpus: false,
    markPipelineValidationPassed: false,
    signerHandoff: null,
  };

  if (corpusPlain.length < GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) {
    return { ...baseBlocked, blockedReason: "corpus_below_guided_min" };
  }
  if (!isAuthoritativePremiumPipelineRenderSource(pipelineSource)) {
    return { ...baseBlocked, blockedReason: "non_authoritative_pipeline_source" };
  }
  if (args.respectAlreadyOpened !== false && args.alreadyOpened) {
    return { ...baseBlocked, blockedReason: "final_review_already_opened" };
  }
  if (
    args.source === "returning_paid_create" &&
    !shouldApplyCreateFlowPaidFirstReviewRouting({
      alreadyOpened: Boolean(args.alreadyOpened),
      premiumRenderSource: pipelineSource,
      corpusPlain,
    })
  ) {
    return { ...baseBlocked, blockedReason: "create_flow_routing_gate" };
  }

  // Do not require a prior validation latch here. Canonical entry commits markers via
  // commitAcceptedPaidProCorpusHandoffSync / markPipelineValidationPassed on apply.
  // Callers that need pre-validation use evaluateFirstPaidCreatePipelineGate.

  return {
    shouldApply: true,
    source: args.source,
    corpusPlain,
    pipelineSource,
    ui: buildCanonicalUiPlan(),
    refs: buildCorpusRefPlan(corpusPlain),
    establishSourceOfTruth: !hasPaidProSourceOfTruth(),
    commitReviewArtifact: true,
    mergeDraftWithCorpus: true,
    markPipelineValidationPassed: true,
    signerHandoff: planCanonicalPaidProSignerHandoff({
      draft: args.draft,
      intakeText: args.intakeText,
      corpusPlain,
      recipientCandidates: args.recipientCandidates,
    }),
  };
}

function buildCanonicalUiPlan(): CanonicalPaidProReviewUiPlan {
  return {
    proUpgradeUseStarterView: false,
    proFullDraftQualityRetry: false,
    premiumPostCheckoutPhase: null,
    premiumPipelineUserMessage: null,
    proFullDraftCustomGateMessage: null,
    guidedCompletionPhase: "applied",
    guidedFinalReviewExplicitlyOpened: true,
    premiumPersistedFlowActive: true,
    premiumSendPathUnlocked: true,
    createFlowPhase: "draft_ready_for_review",
    displayPhase: "review",
    createUiStage: CreateUiStage.DRAFT,
    mobileWorkspacePane: "preview",
    previewPaneRevealed: true,
    agreementDocumentDirty: false,
  };
}

function buildCorpusRefPlan(corpusPlain: string): CanonicalPaidProReviewCorpusRefPlan {
  return {
    agreementDocumentPlain: corpusPlain,
    lastPremiumWinningCorpus: corpusPlain,
    premiumPipelineOutputBody: corpusPlain,
    hydratedPremiumBody: corpusPlain,
    lastKnownGoodAuthoritativeDraft: corpusPlain,
    acceptedReviewCorpus: corpusPlain,
    authoritativeAgreementSnapshot: corpusPlain,
    guidedFinalReviewExplicitlyUnlocked: true,
  };
}

export function planCanonicalPaidProSignerHandoff(args: {
  draft: ParsedDraftShape;
  intakeText: string;
  corpusPlain: string;
  recipientCandidates?: Array<{ name?: string; email?: string; role?: string }>;
}): CanonicalPaidProSignerHandoffPlan | null {
  const legalEntities = resolveLegalEntitiesForCanonicalMetadata({
    intakeText: args.intakeText,
    draft: args.draft,
  });
  if (legalEntities.length < 2) return null;
  const seed = runPaidProSignerMetadataAuthoritySeed({
    stage: "canonical_paid_pro_review_entry",
    legalEntities,
    intakeText: args.intakeText,
    corpusText: null,
    draft: args.draft,
    authoritativePartyCount: legalEntities.length,
  });
  const hasIntakeEntitySignal = legalEntities.some(Boolean);
  const hasIntakeContactSignal =
    seed.addresses.some(Boolean) ||
    seed.emails.some(Boolean) ||
    seed.names.some((n) => n.trim()) ||
    seed.titles.some((t) => t.trim());
  if (!hasIntakeEntitySignal && !hasIntakeContactSignal) return null;
  return {
    signerNames: seed.names,
    signerTitles: seed.titles,
    partyLegalNames: legalEntities,
    partyEmails: args.recipientCandidates?.map((c) => c.email ?? "") ?? seed.emails,
    partyAddresses: seed.addresses,
  };
}

/** After paid acceptance, degraded branches (starter/retry/checkout/recipient-only) must not win. */
export function shouldBlockDegradedPaidReviewBranchesAfterAcceptance(args: {
  corpusPlain?: string | null;
  pipelineAccepted?: boolean;
  canonicalReviewActive?: boolean;
  guidedCompletionPhase?: GuidedCompletionPhase;
}): boolean {
  const corpusLen = (args.corpusPlain ?? "").trim().length;
  if (corpusLen >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) {
    if (args.pipelineAccepted || args.canonicalReviewActive) return true;
    if (args.guidedCompletionPhase === "applied") return true;
    if (hasPaidCreateFlowPipelineAcceptance() || isCreateFlowPaidAcceptedOrAuthoritativeActive()) return true;
  }
  return false;
}

export function shouldMountSimpleProFinalReviewForCanonicalEntry(args: {
  premiumPaidDocumentSurface: boolean;
  premiumRecipientUxActive: boolean;
  createFlowPhase: CreateFlowProductionPhase;
  guidedCompletionPhase: GuidedCompletionPhase;
  canonicalCreateFlowFirstReviewActive: boolean;
  finalReviewExplicitlyOpened: boolean;
  paidProAuthoritative?: boolean;
}): boolean {
  return resolveSimpleProFinalReviewActive({
    paidProAuthoritative: Boolean(args.paidProAuthoritative),
    premiumPaidDocumentSurface: args.premiumPaidDocumentSurface,
    premiumRecipientUxActive: args.premiumRecipientUxActive,
    createFlowPhase: args.createFlowPhase,
    guidedCompletionPhase: args.guidedCompletionPhase,
    canonicalCreateFlowFirstReviewActive: args.canonicalCreateFlowFirstReviewActive,
    finalReviewExplicitlyOpened: args.finalReviewExplicitlyOpened,
  });
}

/** Side effects safe immediately after canonical entry (storage hygiene + pipeline latch). */
export function commitCanonicalPaidProReviewSessionMarkers(args: {
  corpusPlain: string;
  pipelineSource: string;
}): void {
  commitAcceptedPaidProCorpusHandoffSync(args);
}

const STALE_PAID_RECOVERY_PIPELINE_SOURCES = new Set([
  "premium_network_retryable",
  "premium_network_local_recovery",
  "premium_degraded_server_local_recovery",
  "premium_full_draft_cors_blocked",
]);

export function isStalePaidRecoveryPipelineSource(source: string | null | undefined): boolean {
  const s = (source ?? "").trim();
  return STALE_PAID_RECOVERY_PIPELINE_SOURCES.has(s);
}

/** React state/ref resets after canonical paid review entry succeeds. */
export type CanonicalPaidProStaleUiResetPlan = {
  hardError: null;
  premiumTruthPipelineSource: string;
  lastPremiumPipelineRenderSource: string;
  proFullDraftQualityRetry: false;
  proFullDraftCustomGateMessage: null;
  premiumPostCheckoutPhase: null;
  premiumPipelineUserMessage: null;
};

export function planCanonicalPaidProStaleUiReset(pipelineSource: string): CanonicalPaidProStaleUiResetPlan {
  const source = (pipelineSource || "server_full_draft").trim();
  return {
    hardError: null,
    premiumTruthPipelineSource: source,
    lastPremiumPipelineRenderSource: source,
    proFullDraftQualityRetry: false,
    proFullDraftCustomGateMessage: null,
    premiumPostCheckoutPhase: null,
    premiumPipelineUserMessage: null,
  };
}

/**
 * Synchronous post-acceptance corpus commit — same markers/refs first-time post-checkout uses.
 * Must run before paid review shell renders so resolvers never see len 0 after validation accepts.
 */
export function commitAcceptedPaidProCorpusHandoffSync(args: {
  corpusPlain: string;
  pipelineSource: string;
}): boolean {
  const body = args.corpusPlain.trim();
  if (body.length < GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) return false;
  const pipelineSource = (args.pipelineSource || "server_full_draft").trim();
  if (!isAuthoritativePremiumPipelineRenderSource(pipelineSource)) return false;
  markPaidProPipelineValidationPassed({ text: body, source: pipelineSource });
  markPaidProPipelineAcceptedCorpusHash(body);
  commitPaidProAcceptanceStorageHygiene();
  return (readPaidProPipelineAcceptedCorpusBody()?.trim().length ?? 0) >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN;
}

export const ACCEPTED_PAID_PRO_CORPUS_HANDOFF_HELPER = "commitAcceptedPaidProCorpusHandoffSync";

export const CANONICAL_PAID_PRO_REVIEW_ENTRY_HELPER = "enterCanonicalPaidProReviewFlow";

export type PlanFinalizeCanonicalPaidProPipelineSuccessArgs = EnterCanonicalPaidProReviewFlowArgs &
  ResolveCanonicalPaidProReviewCorpusArgs;

/** Shared post-payment / returning-paid pipeline success — same corpus + canonical entry plan. */
export function planFinalizeCanonicalPaidProPipelineSuccess(
  args: PlanFinalizeCanonicalPaidProPipelineSuccessArgs,
): {
  canEnterCanonicalReview: boolean;
  blockedReason?: string;
  corpusPlain: string;
  canonicalPlan: CanonicalPaidProReviewFlowPlan;
  /** Fresh pipeline success must not run snapshot hydration before canonical entry. */
  skipPostGenerationSnapshotHydration: boolean;
} {
  const corpusPlain = (
    resolveCanonicalPaidProReviewCorpus({
      winningBody: args.winningBody,
      snapshotPlain: args.snapshotPlain,
      draft: args.draft,
      agreementDocumentText: args.agreementDocumentText,
      pipelineWinningBody: args.pipelineWinningBody,
      hydratedPremiumBody: args.hydratedPremiumBody,
      premiumDeliverablePlain: args.premiumDeliverablePlain,
    }) || args.corpusPlain
  ).trim();
  const canonicalPlan = planEnterCanonicalPaidProReviewFlow({
    ...args,
    corpusPlain,
    respectAlreadyOpened: false,
  });
  return {
    canEnterCanonicalReview: canonicalPlan.shouldApply,
    blockedReason: canonicalPlan.blockedReason,
    corpusPlain,
    canonicalPlan,
    skipPostGenerationSnapshotHydration: true,
  };
}

export const FINALIZE_CANONICAL_PAID_PRO_PIPELINE_SUCCESS_HELPER =
  "planFinalizeCanonicalPaidProPipelineSuccess";
