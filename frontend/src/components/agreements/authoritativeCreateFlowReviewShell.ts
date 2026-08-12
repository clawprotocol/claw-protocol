/**
 * Single authoritative decision: Paid Pro review shell vs Free Starter acquisition shell.
 * All create-flow review presentation must consult this module — downstream guards must not override it.
 */

import type { AccessTier } from "../../access/types";
import { CreateUiStage } from "./createUiStage";
import type { CreateFlowProductionPhase } from "./createFlowTypes";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";
import { getPaidProSourceOfTruthText, hasPaidProSourceOfTruth } from "./paidProSourceOfTruthState";
import { readAcceptedPipelineReviewCorpusPlain } from "./paidProAcceptedPipelineReviewCorpus";
import { readDisplayReviewSnapshotAuthority } from "../../agreement/canonicalReviewSnapshotApi";
import { readPremiumCompletionSnapshot, hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { getLatchedAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import {
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import {
  hasRenderablePaidProFirstReviewCorpus,
  isPaidProPostCheckoutRecoveryReviewActive,
} from "./paidProPostCheckoutRenderGate";
import { hasPaidProPipelineSessionAcceptance } from "./paidProPostAcceptanceValidatorCache";
import { hasCurrentSessionProEntitlement, hasCurrentSessionFreeStarterIntent } from "./paidProSessionEligibility";
import type { GuidedCompletionPhase } from "./guidedDealCompletion/guidedCompletionPhase";
import { resolveProvisionalWorkspaceProEntitledForCreate } from "./paidCreateFlowEntitlementProbe";
import { resolveCreateFlowWorkspaceProEntitled } from "./paidCreateFlowWorkspaceEntitlementProbe";
import { hasPaidCreateFlowPipelineAcceptance } from "./paidCreateFlowPipelineAcceptanceProbe";
import { hasPaidDashboardCreateContextActive, isAppCreatePath, shouldFailClosedBypassForAuthenticatedWorkspaceCreate } from "../../launch/paidDashboardCreateContext";
import { isHomeAnonymousStarterAuthorityActive } from "../../launch/homeAnonymousCreateOrigin";
import { mustBlockPaidEntitlementForLegacyFallbackOrg } from "../../launch/fallbackOrgPaidEntitlementGuard";
import { computeDashboardPaidCreateReviewShellReady, isDashboardPaidCreateRouteActive } from "./dashboardPaidCreateRoute";

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

export {
  resolveCreateFlowWorkspaceProEntitled,
  resolveWorkspaceProSubscriptionEntitled,
} from "./paidCreateFlowWorkspaceEntitlementProbe";
export { hasPaidCreateFlowPipelineAcceptance } from "./paidCreateFlowPipelineAcceptanceProbe";

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
  // Local premium completion snap is not commercial legal authority.
  return Boolean(readDisplayReviewSnapshotAuthority()?.snapshotId);
}

export function resolveAuthoritativeCreateFlowReviewShell(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): AuthoritativeCreateFlowReviewShell {
  // Anonymous homepage origin: Starter-first until checkout completion or session Pro entitlement.
  if (isHomeAnonymousStarterAuthorityActive() && !hasCurrentSessionProEntitlement()) {
    if (input.premiumCheckoutCompleted) return "paid_pro";
    return "free_starter";
  }
  if (hasCurrentSessionFreeStarterIntent() && !hasCurrentSessionProEntitlement()) {
    // In-session paid acceptance / upgrade completion supersedes the starter latch.
    if (input.premiumCheckoutCompleted) return "paid_pro";
    if (hasPaidProSourceOfTruth()) return "paid_pro";
    if (hasAcceptedPaidCreateFlowFreezeLatch()) return "paid_pro";
    if (hasPaidCreateFlowPipelineAcceptance()) return "paid_pro";
    if (readDisplayReviewSnapshotAuthority()?.snapshotId) return "paid_pro";
    return "free_starter";
  }
  if (input.premiumCheckoutCompleted) return "paid_pro";

  // local-org / empty bootstrap: never select paid_pro from path/dashboard inference alone.
  // Explicit workspace Pro entitlement, checkout completion, and accepted corpora still win.
  if (mustBlockPaidEntitlementForLegacyFallbackOrg()) {
    // local-org / empty bootstrap: never trust workspaceProEntitled alone (Case F).
    // Accepted corpora, session Pro markers, and checkout completion still win.
    if (hasPaidProSourceOfTruth()) return "paid_pro";
    if (input.paidProAuthoritative) return "paid_pro";
    if (input.premiumPersistedFlowActive || input.premiumSendPathUnlocked) return "paid_pro";
    if (hasCurrentSessionProEntitlement()) return "paid_pro";
    if (hasAcceptedPaidCreateFlowFreezeLatch()) return "paid_pro";
    if (hasPaidCreateFlowPipelineAcceptance()) return "paid_pro";
    if (readDisplayReviewSnapshotAuthority()?.snapshotId) return "paid_pro";
    const legacySnap = readPremiumCompletionSnapshot();
    if (legacySnap?.premiumAccepted === true) return "paid_pro";
    return "free_starter";
  }

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
  if (readDisplayReviewSnapshotAuthority()?.snapshotId) return "paid_pro";
  return "free_starter";
}

export type CreateFlowReviewShellTransitionReason =
  | "premium_checkout_completed"
  | "paid_dashboard_create_context"
  | "authenticated_workspace_session_fallback"
  | "paid_pro_source_of_truth"
  | "paid_pro_authoritative"
  | "premium_persisted_or_send_unlocked"
  | "workspace_pro_entitled"
  | "provisional_workspace_pro_entitled"
  | "tier_advanced_full_draft"
  | "session_pro_entitlement"
  | "paid_create_flow_freeze_latch"
  | "pipeline_acceptance"
  | "premium_completion_snapshot"
  | "free_starter";

/** Instrumentation: first matching branch that selects paid_pro vs free_starter. */
export function resolveCreateFlowReviewShellTransitionReason(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): CreateFlowReviewShellTransitionReason {
  if (isHomeAnonymousStarterAuthorityActive() && !hasCurrentSessionProEntitlement()) {
    if (input.premiumCheckoutCompleted) return "premium_checkout_completed";
    return "free_starter";
  }
  if (hasCurrentSessionFreeStarterIntent() && !hasCurrentSessionProEntitlement()) {
    if (input.premiumCheckoutCompleted) return "premium_checkout_completed";
    if (hasPaidProSourceOfTruth()) return "paid_pro_source_of_truth";
    if (hasAcceptedPaidCreateFlowFreezeLatch()) return "paid_create_flow_freeze_latch";
    if (hasPaidCreateFlowPipelineAcceptance()) return "pipeline_acceptance";
    const starterSnap = readPremiumCompletionSnapshot();
    if (starterSnap?.premiumAccepted === true) return "premium_completion_snapshot";
    return "free_starter";
  }
  if (input.premiumCheckoutCompleted) return "premium_checkout_completed";
  if (mustBlockPaidEntitlementForLegacyFallbackOrg()) {
    if (hasPaidProSourceOfTruth()) return "paid_pro_source_of_truth";
    if (input.paidProAuthoritative) return "paid_pro_authoritative";
    if (input.premiumPersistedFlowActive || input.premiumSendPathUnlocked) {
      return "premium_persisted_or_send_unlocked";
    }
    if (hasCurrentSessionProEntitlement()) return "session_pro_entitlement";
    if (hasAcceptedPaidCreateFlowFreezeLatch()) return "paid_create_flow_freeze_latch";
    if (hasPaidCreateFlowPipelineAcceptance()) return "pipeline_acceptance";
    const snap = readPremiumCompletionSnapshot();
    if (snap?.premiumAccepted === true) return "premium_completion_snapshot";
    return "free_starter";
  }
  if (isAppCreatePath() && hasPaidDashboardCreateContextActive()) return "paid_dashboard_create_context";
  if (shouldFailClosedBypassForAuthenticatedWorkspaceCreate()) {
    return "authenticated_workspace_session_fallback";
  }
  if (hasPaidProSourceOfTruth()) return "paid_pro_source_of_truth";
  if (input.paidProAuthoritative) return "paid_pro_authoritative";
  if (input.premiumPersistedFlowActive || input.premiumSendPathUnlocked) {
    return "premium_persisted_or_send_unlocked";
  }
  if (input.workspaceProEntitled || resolveCreateFlowWorkspaceProEntitled()) return "workspace_pro_entitled";
  if (resolveProvisionalWorkspaceProEntitledForCreate()) return "provisional_workspace_pro_entitled";
  if (input.tier && tierAllowsAdvancedFullDraftReveal(input.tier)) return "tier_advanced_full_draft";
  if (hasCurrentSessionProEntitlement()) return "session_pro_entitlement";
  if (hasAcceptedPaidCreateFlowFreezeLatch()) return "paid_create_flow_freeze_latch";
  if (hasPaidCreateFlowPipelineAcceptance()) return "pipeline_acceptance";
  const snap = readPremiumCompletionSnapshot();
  if (snap?.premiumAccepted === true) return "premium_completion_snapshot";
  return "free_starter";
}

export function logCreateFlowEntitlementTransition(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const reason = resolveCreateFlowReviewShellTransitionReason(input);
  const shell = reason === "free_starter" ? "free_starter" : "paid_pro";
  console.info("[create-flow-entitlement-transition]", {
    reason,
    shell,
    workspaceProEntitled: Boolean(input.workspaceProEntitled),
    workspaceProCached: resolveCreateFlowWorkspaceProEntitled(),
    provisionalPaid: resolveProvisionalWorkspaceProEntitledForCreate(),
    failClosedBypass: shouldFailClosedBypassForAuthenticatedWorkspaceCreate(),
    paidDashboardCreateContext: hasPaidDashboardCreateContextActive(),
  });
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
  // Free starter/streamline review uses the unified bottom checkout CTA (`launch_pro_checkout`),
  // not the legacy side-by-side ProConversionComparisonCard below the document.
  if (input.isFreeStreamlineDraftReview || input.isFreeStarterReviewSurface) {
    return false;
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
  premiumPostCheckoutPhase?: string | null;
  proFullDraftQualityRetry?: boolean;
};

/** Paid Pro review chrome on `/app/create` — dashboard route requires validated corpus before review content. */
export function computeCreateFlowPaidProReviewReady(
  input: ComputeCreateFlowPaidProReviewReadyInput,
): boolean {
  if (!input.simpleProductFlow || !input.liveWorkspaceTwoPane) return false;
  if (isDashboardPaidCreateRouteActive()) {
    return computeDashboardPaidCreateReviewShellReady({
      createUiStage: input.createUiStage,
      displayPhase: input.displayPhase,
      createFlowPhase: input.createFlowPhase,
      premiumPostCheckoutPhase: input.premiumPostCheckoutPhase,
      proFullDraftQualityRetry: input.proFullDraftQualityRetry,
    });
  }
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

/** "Agreement ready" title/chip — only when a renderable paid corpus exists (never empty shell). */
export function computeCreateFlowPaidProReviewContentReady(
  input: ComputeCreateFlowPaidProReviewReadyInput & {
    draft?: import("./intakeSmartDefaults").ParsedDraftShape | null;
    intakeText?: string | null;
    agreementDocumentText?: string;
    premiumRenderSource?: string | null;
    premiumCheckoutCompleted?: boolean;
    premiumPostCheckoutPhase?: string | null;
    pipelineWinningBody?: string | null;
    hydratedPremiumBody?: string | null;
    authoritativeBodyLen?: number;
    proFullDraftQualityRetry?: boolean;
    createFlowDraftPersistBlocked?: boolean;
  },
): boolean {
  if (input.proFullDraftQualityRetry || input.createFlowDraftPersistBlocked) return false;
  if (!computeCreateFlowPaidProReviewReady(input)) return false;
  if (hasPaidProSourceOfTruth()) {
    if (getPaidProSourceOfTruthText().trim().length >= PAID_PRO_AUTHORITY_MIN_LEN) return true;
  }
  return readAcceptedPipelineReviewCorpusPlain().length >= PAID_PRO_AUTHORITY_MIN_LEN;
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

  const validatedPipeline = readAcceptedPipelineReviewCorpusPlain();
  if (validatedPipeline.length >= PAID_PRO_AUTHORITY_MIN_LEN) return validatedPipeline;

  // Create-flow authoritative review plain requires validated pipeline acceptance.
  // Hash-only session latch / unvalidated hydrated fragments must not surface (TEST523).
  if (!hasPaidCreateFlowPipelineAcceptance()) {
    return "";
  }

  const snap = readPremiumCompletionSnapshot();
  const snapBody = (snap?.premiumWinningBodyText || snap?.premiumReadonlyPlainText || "").trim();
  if (snap?.premiumAccepted && snapBody.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return snapBody;
  }

  const latched = getLatchedAcceptedServerFullDraftAuthority();
  const latchedBody = latched?.body.trim() ?? "";
  if (latchedBody.length >= PAID_PRO_AUTHORITY_MIN_LEN && latched?.freezeEstablished) {
    return latchedBody;
  }

  const pipelineWinning = (args.pipelineWinningBody || "").trim();
  const hydratedPremium = (args.hydratedPremiumBody || "").trim();
  for (const candidate of [pipelineWinning, hydratedPremium]) {
    if (candidate.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      return candidate;
    }
  }

  return "";
}

export function logAuthoritativeCreateFlowReviewShellResolved(
  input: ResolveAuthoritativeCreateFlowReviewShellInput,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const shell = resolveAuthoritativeCreateFlowReviewShell(input);
  const transitionReason = resolveCreateFlowReviewShellTransitionReason(input);
  console.info("[authoritative-create-flow-review-shell]", {
    shell: shell === "free_starter" ? "starter" : shell,
    transitionReason,
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
  const validatedLen = readAcceptedPipelineReviewCorpusPlain().length;
  if (validatedLen >= PAID_PRO_AUTHORITY_MIN_LEN) return validatedLen;
  if (
    hasRenderablePaidProFirstReviewCorpus({
      draft: args.draft ?? null,
      intakeText: args.intakeText ?? null,
      premiumRenderSource: args.premiumRenderSource ?? null,
      premiumCheckoutCompleted: args.premiumCheckoutCompleted,
      premiumPostCheckoutPhase: args.premiumPostCheckoutPhase,
    })
  ) {
    return createFlowPlain.length;
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
