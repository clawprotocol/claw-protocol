/**
 * Single authoritative decision: Paid Pro review shell vs Free Starter acquisition shell.
 * All create-flow review presentation must consult this module — downstream guards must not override it.
 */

import { readCachedWorkspaceProEntitlement } from "../../agreement/agreementProFunnelGate";
import type { AccessTier } from "../../access/types";
import { subscriptionTierForAccess } from "../../access/subscriptionEntitlementCache";
import { CreateUiStage } from "./createUiStage";
import type { CreateFlowProductionPhase } from "./createFlowTypes";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";
import { hasPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "./paidProSourceOfTruth";
import { readPremiumCompletionSnapshot, hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { getLatchedAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import {
  readPaidProPipelineAcceptedCorpusBody,
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  hasRenderablePaidProFirstReviewCorpus,
  isPaidProPostCheckoutRecoveryReviewActive,
} from "./paidProPostCheckoutRenderGate";
import { hasPaidProPipelineSessionAcceptance } from "./paidProPostAcceptanceValidatorCache";
import { hasCurrentSessionProEntitlement } from "./paidProSessionEligibility";
import type { GuidedCompletionPhase } from "./guidedDealCompletion/guidedCompletionPhase";
import { resolveProvisionalWorkspaceProEntitledForCreate } from "./returningPaidCreateBootstrap";
import { hasPaidDashboardCreateContextActive, isAppCreatePath, shouldFailClosedBypassForAuthenticatedWorkspaceCreate } from "../../launch/paidDashboardCreateContext";

/** Matches {@link GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN} — inlined to avoid simpleProFinalReviewCorpus import cycle. */
const CREATE_FLOW_PIPELINE_ACCEPTED_MIN_LEN = 1500;

export type AuthoritativeCreateFlowReviewShell = "paid_pro" | "free_starter";

export type ResolveAuthoritativeCreateFlowReviewShellInput = {
  /** React state from fetchWorkspaceProEntitlement — may lead cached module probe. */
  workspaceProEntitled?: boolean;
  tier?: AccessTier;
  premiumPersistedFlowActive?: boolean;
  premiumSendPathUnlocked?: boolean;
  paidProAuthoritative?: boolean;
  premiumCheckoutCompleted?: boolean;
};

export function resolveWorkspaceProSubscriptionEntitled(): boolean {
  const subTier = subscriptionTierForAccess();
  return Boolean(subTier && tierAllowsAdvancedFullDraftReveal(subTier));
}

export function resolveCreateFlowWorkspaceProEntitled(): boolean {
  return resolveWorkspaceProSubscriptionEntitled() || readCachedWorkspaceProEntitlement();
}

export function hasPaidCreateFlowPipelineAcceptance(): boolean {
  return readPaidProPipelineAcceptedCorpusHash() !== null;
}

export function hasAcceptedPaidCreateFlowFreezeLatch(): boolean {
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  const latchedBody = latched?.body.trim() ?? "";
  if (latchedBody.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    if (latched?.freezeEstablished) return true;
    if (hasPaidCreateFlowPipelineAcceptance()) return true;
    if (
      hasPaidProPipelineSessionAcceptance({
        text: latchedBody,
        source: latched?.source ?? "server_full_draft",
      })
    ) {
      return true;
    }
  }
  return hasPaidCreateFlowPipelineAcceptance();
}

/**
 * Hard parent invariant: once paid generation is accepted OR the authoritative shell is paid_pro,
 * the create-flow route must never mount Free Starter acquisition / checkout branches.
 */
export function isCreateFlowPaidAcceptedOrAuthoritativeActive(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): boolean {
  if (resolveAuthoritativeCreateFlowReviewShell(input) === "paid_pro") return true;
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  const latchedBody = latched?.body.trim() ?? "";
  if (latchedBody.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    if (latched?.freezeEstablished) return true;
    if (
      hasPaidProPipelineSessionAcceptance({
        text: latchedBody,
        source: latched?.source ?? "server_full_draft",
      })
    ) {
      return true;
    }
  }
  const snap = readPremiumCompletionSnapshot();
  if (snap?.premiumAccepted === true) return true;
  return false;
}

export function resolveAuthoritativeCreateFlowReviewShell(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): AuthoritativeCreateFlowReviewShell {
  if (input.premiumCheckoutCompleted) return "paid_pro";
  if (isAppCreatePath() && hasPaidDashboardCreateContextActive()) return "paid_pro";
  if (shouldFailClosedBypassForAuthenticatedWorkspaceCreate()) return "paid_pro";
  if (hasPaidProSourceOfTruth()) return "paid_pro";
  if (input.paidProAuthoritative) return "paid_pro";
  if (input.premiumPersistedFlowActive || input.premiumSendPathUnlocked) return "paid_pro";
  if (input.workspaceProEntitled || resolveCreateFlowWorkspaceProEntitled()) return "paid_pro";
  if (resolveProvisionalWorkspaceProEntitledForCreate()) return "paid_pro";
  if (input.tier && tierAllowsAdvancedFullDraftReveal(input.tier)) return "paid_pro";
  if (hasCurrentSessionProEntitlement()) return "paid_pro";
  if (hasAcceptedPaidCreateFlowFreezeLatch()) return "paid_pro";
  if (hasPaidCreateFlowPipelineAcceptance()) return "paid_pro";
  const snap = readPremiumCompletionSnapshot();
  if (snap?.premiumAccepted === true) return "paid_pro";
  return "free_starter";
}

export function shouldUsePaidProCreateFlowReviewShell(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): boolean {
  return resolveAuthoritativeCreateFlowReviewShell(input) === "paid_pro";
}

/** Hard suppress Free Starter acquisition / conversion UI on `/app/create`. */
export function shouldSuppressFreeStarterCreateFlowConversionUi(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): boolean {
  return isCreateFlowPaidAcceptedOrAuthoritativeActive(input);
}

export function shouldBlockFreeStarterReviewSurfaces(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): boolean {
  return shouldSuppressFreeStarterCreateFlowConversionUi(input);
}

/**
 * React dependency key for module-level paid signals (pipeline hash, SoT, workspace pro cache)
 * that are not always mirrored in component state.
 */
export function readCreateFlowAuthoritativeReviewShellReactiveKey(): string {
  const snap = readPremiumCompletionSnapshot();
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  return [
    readPaidProPipelineAcceptedCorpusHash() ?? "",
    hasPaidProSourceOfTruth() ? "sot" : "",
    latched?.freezeEstablished ? String(latched.body.trim().length) : "",
    resolveCreateFlowWorkspaceProEntitled() ? "wpro" : "",
    snap?.premiumAccepted ? "snap" : "",
  ].join("|");
}

export function shouldUseStarterDocumentPaperSurfaceOnCreateFlow(input: {
  shellInput?: ResolveAuthoritativeCreateFlowReviewShellInput;
  isFreeStreamlineDraftReview: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  paidProFirstReviewDisplayActive: boolean;
  isAuthoritativePaidProReviewActive: boolean;
}): boolean {
  if (shouldSuppressFreeStarterCreateFlowConversionUi(input.shellInput ?? {})) return false;
  return Boolean(
    input.isFreeStreamlineDraftReview &&
      input.createUiStage === CreateUiStage.DRAFT &&
      !input.paidProFirstReviewDisplayActive &&
      !input.isAuthoritativePaidProReviewActive,
  );
}

export function shouldShowCreateFlowStarterProRefineUpsell(input: {
  shellInput?: ResolveAuthoritativeCreateFlowReviewShellInput;
  hasPaidPremiumCompletionSession: () => boolean;
  authoritativePremiumUiCommitted: boolean;
  paidProAuthoritative: boolean;
  suppressIntakePremiumUpsell: boolean;
  proAgreementEntitled: boolean;
  isFreeStreamlineDraftReview: boolean;
  isFreeStarterReviewSurface: boolean;
  belowDocumentRefineSectionParentEligible: boolean;
  premiumPaidDocumentSurface: boolean;
  showStarterProRefineUpsellCardEligible: boolean;
}): boolean {
  if (shouldSuppressPaidAcceptedDegradedRecoveryUi({ shellInput: input.shellInput })) return false;
  if (shouldSuppressFreeStarterCreateFlowConversionUi(input.shellInput ?? {})) return false;
  if (input.hasPaidPremiumCompletionSession()) return false;
  if (input.authoritativePremiumUiCommitted) return false;
  if (input.paidProAuthoritative) return false;
  if (input.suppressIntakePremiumUpsell) return false;
  if (input.proAgreementEntitled) return false;
  if (input.isFreeStreamlineDraftReview || input.isFreeStarterReviewSurface) {
    return input.belowDocumentRefineSectionParentEligible;
  }
  return input.showStarterProRefineUpsellCardEligible;
}

export type ComputeCreateFlowPaidProReviewReadyInput = ResolveAuthoritativeCreateFlowReviewShellInput & {
  simpleProductFlow: boolean;
  liveWorkspaceTwoPane: boolean;
  paidProAuthoritative: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  displayPhase: string;
  createFlowPhase?: CreateFlowProductionPhase;
};

/** Paid Pro review chrome on `/app/create` — workspace-pro and pipeline-accepted users included. */
export function computeCreateFlowPaidProReviewReady(
  input: ComputeCreateFlowPaidProReviewReadyInput,
): boolean {
  if (!input.simpleProductFlow || !input.liveWorkspaceTwoPane) return false;
  if (shouldUsePaidProCreateFlowReviewShell(input)) {
    if (input.createUiStage === CreateUiStage.RECIPIENTS) return true;
    return (
      input.createUiStage === CreateUiStage.DRAFT &&
      (input.displayPhase === "review" ||
        input.displayPhase === "generating_draft" ||
        input.createFlowPhase === "generating_draft" ||
        input.createFlowPhase === "draft_ready_for_review")
    );
  }
  if (!input.paidProAuthoritative) return false;
  if (input.createUiStage === CreateUiStage.RECIPIENTS) return true;
  return input.createUiStage === CreateUiStage.DRAFT && input.displayPhase === "review";
}

/** Review plain text for paid create-flow shell when SoT is not yet frozen. */
export function resolveCreateFlowAuthoritativeReviewPlain(args: {
  agreementDocumentText?: string;
  draft?: ParsedDraftShape | null;
  pipelineWinningBody?: string | null;
  hydratedPremiumBody?: string | null;
}): string {
  const sot = getPaidProSourceOfTruthText().trim();
  if (sot.length >= PAID_PRO_AUTHORITY_MIN_LEN) return sot;
  const pipelineAcceptedBody = readPaidProPipelineAcceptedCorpusBody()?.trim() ?? "";
  if (
    pipelineAcceptedBody.length >= CREATE_FLOW_PIPELINE_ACCEPTED_MIN_LEN &&
    hasPaidCreateFlowPipelineAcceptance()
  ) {
    return pipelineAcceptedBody;
  }
  const snap = readPremiumCompletionSnapshot();
  const snapBody = (snap?.premiumWinningBodyText || snap?.premiumReadonlyPlainText || "").trim();
  if (snap?.premiumAccepted && snapBody.length >= PAID_PRO_AUTHORITY_MIN_LEN) return snapBody;
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  const latchedBody = latched?.body.trim() ?? "";
  const pipelineWinning = (args.pipelineWinningBody || "").trim();
  const hydratedPremium = (args.hydratedPremiumBody || "").trim();
  const draftPremium = String(
    args.draft?.premium_server_full_document_text ??
      args.draft?.premium_full_document_text ??
      "",
  ).trim();
  const draftServerFull = String(
    (args.draft as { server_full_document_text?: string | null } | null)?.server_full_document_text ??
      "",
  ).trim();
  const paidAccepted =
    hasPaidCreateFlowPipelineAcceptance() ||
    hasAcceptedPaidCreateFlowFreezeLatch() ||
    (latchedBody.length >= PAID_PRO_AUTHORITY_MIN_LEN &&
      Boolean(latched?.freezeEstablished || snap?.premiumAccepted));
  const pipelineCandidates = [pipelineWinning, hydratedPremium, latchedBody, draftPremium, draftServerFull]
    .map((s) => s.trim())
    .filter((s) => s.length >= PAID_PRO_AUTHORITY_MIN_LEN);
  if (paidAccepted && pipelineCandidates.length > 0) {
    return pipelineCandidates.sort((a, b) => b.length - a.length)[0]!;
  }
  for (const candidate of pipelineCandidates) {
    if (
      hasPaidProPipelineSessionAcceptance({
        text: candidate,
        source: latched?.source ?? "server_full_draft",
      })
    ) {
      return candidate;
    }
  }
  const doc = (args.agreementDocumentText || "").trim();
  if (paidAccepted && doc.length >= PAID_PRO_AUTHORITY_MIN_LEN) return doc;
  return doc;
}

export function logAuthoritativeCreateFlowReviewShellResolved(
  input: ResolveAuthoritativeCreateFlowReviewShellInput,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const shell = resolveAuthoritativeCreateFlowReviewShell(input);
  console.info("[authoritative-create-flow-review-shell]", {
    shell,
    workspaceProEntitled: Boolean(input.workspaceProEntitled),
    workspaceProCached: resolveCreateFlowWorkspaceProEntitled(),
    pipelineAccepted: hasPaidCreateFlowPipelineAcceptance(),
    hasSourceOfTruth: hasPaidProSourceOfTruth(),
    premiumSnapAccepted: readPremiumCompletionSnapshot()?.premiumAccepted === true,
  });
}

/** Paid review on `/app/create` — same surface eligibility for post-checkout and returning subscribers. */
export function isCanonicalPaidCreateFlowReviewSurfaceEligible(input: {
  shellInput?: ResolveAuthoritativeCreateFlowReviewShellInput;
  productionDraftPrimaryReviewSurface: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  createFlowPhase?: CreateFlowProductionPhase;
  hasDraft: boolean;
}): boolean {
  if (!shouldUsePaidProCreateFlowReviewShell(input.shellInput ?? {})) return false;
  if (!input.productionDraftPrimaryReviewSurface) return false;
  if (input.createUiStage !== CreateUiStage.DRAFT || !input.hasDraft) return false;
  return (
    input.createFlowPhase === "draft_ready_for_review" ||
    input.createFlowPhase === "generating_draft"
  );
}

export function resolveCanonicalPaidCreateFlowReviewCorpusLen(args: {
  draft?: ParsedDraftShape | null;
  agreementDocumentText?: string;
  intakeText?: string | null;
  premiumRenderSource?: string | null;
  premiumCheckoutCompleted?: boolean;
  premiumPostCheckoutPhase?: string | null;
  pipelineWinningBody?: string | null;
  hydratedPremiumBody?: string | null;
}): number {
  if (hasPaidProSourceOfTruth()) {
    return getPaidProSourceOfTruthText().trim().length;
  }
  const createFlowPlain = resolveCreateFlowAuthoritativeReviewPlain({
    agreementDocumentText: args.agreementDocumentText,
    draft: args.draft ?? null,
    pipelineWinningBody: args.pipelineWinningBody,
    hydratedPremiumBody: args.hydratedPremiumBody,
  }).trim();
  if (createFlowPlain.length >= PAID_PRO_AUTHORITY_MIN_LEN) return createFlowPlain.length;
  if (
    hasRenderablePaidProFirstReviewCorpus({
      draft: args.draft ?? null,
      intakeText: args.intakeText ?? null,
      premiumRenderSource: args.premiumRenderSource ?? null,
      premiumCheckoutCompleted: args.premiumCheckoutCompleted,
      premiumPostCheckoutPhase: args.premiumPostCheckoutPhase,
    })
  ) {
    return Math.max(
      createFlowPlain.length,
      String(args.draft?.premium_server_full_document_text ?? "").trim().length,
      String(args.draft?.premium_full_document_text ?? "").trim().length,
    );
  }
  return createFlowPlain.length;
}

/**
 * Single first-review entry for post-checkout (Path A) and returning paid subscribers (Path B).
 * When true, mount SimpleProFinalReviewScreen — never the Free Starter review subtree.
 */
export function isCanonicalPaidCreateFlowFirstReviewActive(input: {
  shellInput?: ResolveAuthoritativeCreateFlowReviewShellInput;
  productionDraftPrimaryReviewSurface: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  createFlowPhase?: CreateFlowProductionPhase;
  hasDraft: boolean;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  agreementDocumentText?: string;
  premiumRenderSource?: string | null;
  premiumCheckoutCompleted?: boolean;
  premiumPostCheckoutPhase?: string | null;
  pipelineWinningBody?: string | null;
  hydratedPremiumBody?: string | null;
}): boolean {
  const corpusLen = resolveCanonicalPaidCreateFlowReviewCorpusLen({
    draft: input.draft ?? null,
    agreementDocumentText: input.agreementDocumentText,
    intakeText: input.intakeText ?? null,
    premiumRenderSource: input.premiumRenderSource ?? null,
    premiumCheckoutCompleted: input.premiumCheckoutCompleted,
    premiumPostCheckoutPhase: input.premiumPostCheckoutPhase,
    pipelineWinningBody: input.pipelineWinningBody,
    hydratedPremiumBody: input.hydratedPremiumBody,
  });
  if (corpusLen < PAID_PRO_AUTHORITY_MIN_LEN) return false;

  const surfaceEligible = isCanonicalPaidCreateFlowReviewSurfaceEligible({
    shellInput: input.shellInput,
    productionDraftPrimaryReviewSurface: input.productionDraftPrimaryReviewSurface,
    createUiStage: input.createUiStage,
    createFlowPhase: input.createFlowPhase,
    hasDraft: input.hasDraft,
  });

  const postCheckoutPath =
    Boolean(input.premiumCheckoutCompleted || hasPaidPremiumCompletionSession()) &&
    isPaidProPostCheckoutRecoveryReviewActive({
      draft: input.draft ?? null,
      intakeText: input.intakeText ?? null,
      premiumRenderSource: input.premiumRenderSource ?? null,
      premiumCheckoutCompleted: input.premiumCheckoutCompleted,
    });

  if (postCheckoutPath || hasPaidProSourceOfTruth()) {
    return input.productionDraftPrimaryReviewSurface && input.createUiStage === CreateUiStage.DRAFT;
  }

  if (
    hasPaidCreateFlowPipelineAcceptance() &&
    corpusLen >= PAID_PRO_AUTHORITY_MIN_LEN &&
    surfaceEligible
  ) {
    return true;
  }

  return surfaceEligible;
}

/** Paid review shell active — block launch_pro_checkout and Free Starter CTAs. */
export function shouldBlockLaunchProCheckoutForPaidCreateFlowReview(input: {
  shellInput?: ResolveAuthoritativeCreateFlowReviewShellInput;
  canonicalFirstReviewActive: boolean;
}): boolean {
  return (
    input.canonicalFirstReviewActive ||
    isCreateFlowPaidAcceptedOrAuthoritativeActive(input.shellInput ?? {})
  );
}

/** Paid acceptance active but canonical review corpus not yet promoted — show hydrating skeleton only. */
export function shouldRenderCreateFlowPaidReviewHydratingSkeleton(input: {
  shellInput?: ResolveAuthoritativeCreateFlowReviewShellInput;
  simpleProFinalReviewShellActive: boolean;
  multiPartyProGateActive?: boolean;
}): boolean {
  if (input.multiPartyProGateActive) return false;
  if (input.simpleProFinalReviewShellActive) return false;
  return isCreateFlowPaidAcceptedOrAuthoritativeActive(input.shellInput ?? {});
}

export type ShouldSuppressPaidAcceptedDegradedRecoveryUiArgs = {
  shellInput?: ResolveAuthoritativeCreateFlowReviewShellInput;
  simpleProFinalReviewActive?: boolean;
  guidedCompletionPhase?: GuidedCompletionPhase | string;
  hasPaidSoT?: boolean;
  pipelineAccepted?: boolean;
};

/** After paid acceptance, never show retry banners, conversion cards, or free/starter review shell. */
export function shouldSuppressPaidAcceptedDegradedRecoveryUi(
  args: ShouldSuppressPaidAcceptedDegradedRecoveryUiArgs = {},
): boolean {
  if (args.simpleProFinalReviewActive) return true;
  if (args.guidedCompletionPhase === "applied") return true;
  if (args.hasPaidSoT ?? hasPaidProSourceOfTruth()) return true;
  if (args.pipelineAccepted ?? hasPaidCreateFlowPipelineAcceptance()) return true;
  if (isCreateFlowPaidAcceptedOrAuthoritativeActive(args.shellInput ?? {})) return true;
  return false;
}

export function shouldSuppressPaidAcceptedFreeStarterSurfaces(
  args: ShouldSuppressPaidAcceptedDegradedRecoveryUiArgs = {},
): boolean {
  return shouldSuppressPaidAcceptedDegradedRecoveryUi(args);
}
