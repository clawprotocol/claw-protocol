/**
 * Create-flow routing: paid subscribers must not enter the Free Starter review shell.
 */

import type { AccessTier } from "../../access/types";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruthState";
import { hasPaidProPipelineSessionAcceptance } from "./paidProPostAcceptanceValidatorCache";
import {
  hasCurrentSessionFreeStarterIntent,
  hasCurrentSessionProEntitlement,
} from "./paidProSessionEligibility";
import {
  hasAcceptedPaidCreateFlowFreezeLatch,
  resolveCreateFlowWorkspaceProEntitled,
  shouldBlockFreeStarterReviewSurfaces,
  shouldUsePaidProCreateFlowReviewShell,
} from "./authoritativeCreateFlowReviewShell";
import { resolveProvisionalWorkspaceProEntitledForCreate } from "./paidCreateFlowEntitlementProbe";
import { hasPaidDashboardCreateContextActive } from "../../launch/paidDashboardCreateContext";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { resolveCreateFlowAcceptedPipelineCorpusPlain } from "./paidProAcceptanceRouting";
import { shouldUsePaidCreateFlowReviewFirstPersist } from "./paidProCreateFlowReviewHandoff";
import { isHomeAnonymousStarterAuthorityActive } from "../../launch/homeAnonymousCreateOrigin";
import { getCachedAccessToken } from "../../auth/authAccessTokenCache";

export type ResolveSkipFreeStarterCreateSubmitInput = {
  tier: AccessTier;
  proAgreementEntitled: boolean;
};

/** Paid workspace / entitled agreement: never latch free-starter session on create submit. */
export function resolveSkipFreeStarterCreateSubmit(
  input: ResolveSkipFreeStarterCreateSubmitInput,
): boolean {
  if (tierAllowsAdvancedFullDraftReveal(input.tier)) return true;
  if (input.proAgreementEntitled) return true;
  if (resolveCreateFlowWorkspaceProEntitled()) return true;
  if (resolveProvisionalWorkspaceProEntitledForCreate()) return true;
  if (hasPaidDashboardCreateContextActive()) return true;
  if (shouldUsePaidProCreateFlowReviewShell({ tier: input.tier })) return true;
  return false;
}

export function hasFreeStarterSessionWithoutProEntitlement(): boolean {
  return hasCurrentSessionFreeStarterIntent() && !hasCurrentSessionProEntitlement();
}

/**
 * Anonymous homepage Starter may persist one guest draft before auth.
 * Authenticated non-Pro free-starter upsell still must not auto-POST a workspace row.
 */
export function shouldPersistAnonymousGuestStarterDraft(args?: {
  canSaveGuestDraft?: boolean;
}): boolean {
  if (args?.canSaveGuestDraft === false) return false;
  if (getCachedAccessToken()) return false;
  return isHomeAnonymousStarterAuthorityActive();
}

/**
 * Free Starter upsell must not auto-POST /api/agreements/draft as a paid workspace row.
 * Exception: anonymous guest homepage Starter persists one guest draft (J7 claim identity).
 */
export type ShouldAutoPersistReviewAgreementRowArgs = {
  hasReviewAgreementId: boolean;
  skipFreeStarterCreateSubmit: boolean;
  /** When true, generation failed professional validation — never POST /draft. */
  qualityRetryActive?: boolean;
  draft?: import("./intakeSmartDefaults").ParsedDraftShape | null;
  agreementDocumentText?: string;
  pipelineWinningBody?: string | null;
  hydratedPremiumBody?: string | null;
  /** Server guest slot. Undefined defers to backend assert_can_create_draft. */
  canSaveGuestDraft?: boolean;
};

/** True when returning-paid / dashboard create has a validated pipeline corpus safe for review-first persist. */
export function hasPaidCreateFlowPersistableCorpus(
  args: Pick<
    ShouldAutoPersistReviewAgreementRowArgs,
    "draft" | "agreementDocumentText" | "pipelineWinningBody" | "hydratedPremiumBody"
  >,
): boolean {
  if (
    !shouldUsePaidCreateFlowReviewFirstPersist({
      draft: args.draft ?? null,
      agreementDocumentText: args.agreementDocumentText,
      pipelineWinningBody: args.pipelineWinningBody,
      hydratedPremiumBody: args.hydratedPremiumBody,
    })
  ) {
    return false;
  }
  const corpusLen = resolveCreateFlowAcceptedPipelineCorpusPlain({
    draft: args.draft ?? null,
    agreementDocumentText: args.agreementDocumentText,
    pipelineWinningBody: args.pipelineWinningBody,
    hydratedPremiumBody: args.hydratedPremiumBody,
  }).trim().length;
  return corpusLen >= PAID_PRO_AUTHORITY_MIN_LEN;
}

export function shouldAutoPersistReviewAgreementRow(args: ShouldAutoPersistReviewAgreementRowArgs): boolean {
  if (args.hasReviewAgreementId) return false;
  if (args.qualityRetryActive) return false;
  if (args.skipFreeStarterCreateSubmit) {
    return hasPaidCreateFlowPersistableCorpus(args);
  }
  if (hasFreeStarterSessionWithoutProEntitlement()) {
    return shouldPersistAnonymousGuestStarterDraft({
      canSaveGuestDraft: args.canSaveGuestDraft,
    });
  }
  return true;
}

export type ResolveFreeStarterReviewShellBlockedInput = {
  isFreeStreamlineDraftReview: boolean;
  isFreeStarterReviewSurface: boolean;
  premiumPaidDocumentSurface: boolean;
  paidProAuthoritative: boolean;
  premiumCheckoutCompleted?: boolean;
  premiumPersistedFlowActive?: boolean;
  acceptedPipelineBody?: string | null;
  acceptedPipelineSource?: string | null;
};

/**
 * Hard block on Free Starter review shell when paid generation already established authority.
 */
export function resolveFreeStarterReviewShellBlocked(
  input: ResolveFreeStarterReviewShellBlockedInput,
): boolean {
  if (shouldBlockFreeStarterReviewSurfaces()) return true;
  if (input.premiumCheckoutCompleted) return true;
  if (hasPaidProSourceOfTruth()) return true;
  if (hasAcceptedPaidCreateFlowFreezeLatch()) return true;
  if (input.paidProAuthoritative) return true;
  if (input.premiumPersistedFlowActive) return true;
  const body = (input.acceptedPipelineBody ?? "").trim();
  const source = (input.acceptedPipelineSource ?? "server_full_draft").trim();
  if (
    body.length >= 500 &&
    hasPaidProPipelineSessionAcceptance({ text: body, source })
  ) {
    return true;
  }
  return false;
}
