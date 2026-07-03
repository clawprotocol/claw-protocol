/**
 * Create-flow routing: paid subscribers must not enter the Free Starter review shell.
 */

import type { AccessTier } from "../../access/types";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { hasPaidProPipelineSessionAcceptance } from "./paidProPostAcceptanceValidatorCache";
import {
  hasCurrentSessionFreeStarterIntent,
  hasCurrentSessionProEntitlement,
} from "./paidProSessionEligibility";

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
  return false;
}

export function hasFreeStarterSessionWithoutProEntitlement(): boolean {
  return hasCurrentSessionFreeStarterIntent() && !hasCurrentSessionProEntitlement();
}

/**
 * Free Starter upsell must not auto-POST /api/agreements/draft — that row is created once after paid acceptance.
 */
export function shouldAutoPersistReviewAgreementRow(args: {
  hasReviewAgreementId: boolean;
  skipFreeStarterCreateSubmit: boolean;
}): boolean {
  if (args.hasReviewAgreementId) return false;
  if (args.skipFreeStarterCreateSubmit) return true;
  if (hasFreeStarterSessionWithoutProEntitlement()) return false;
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
  if (input.premiumCheckoutCompleted) return true;
  if (hasPaidProSourceOfTruth()) return true;
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
