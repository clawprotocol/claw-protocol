/**
 * Post-checkout routing: after server_full_draft acceptance, commit UI to canonical paid Pro review.
 */

import {
  hasAcceptedPaidProAuthority,
  resolveAuthoritativePaidProReviewPlain,
  resolvePaidProAcceptanceRoutingMarkers,
  type AuthoritativePaidProReviewInput,
} from "./authoritativePaidProReview";
import { clearCreateReviewDraftReadyMarker } from "./agreementIntakeStorage";
import { clearPersistedGuidedSession } from "./guidedDealCompletion/guidedSessionPersistence";

export type ApplyPaidProAcceptanceRoutingArgs = {
  premiumRenderSource: string | null | undefined;
  acceptedBodyLen: number;
  draft?: AuthoritativePaidProReviewInput["draft"];
  intakeText?: string | null;
};

export type ApplyPaidProAcceptanceRoutingResult = {
  applied: boolean;
  routing: ReturnType<typeof resolvePaidProAcceptanceRoutingMarkers>;
  authoritativePlainLen: number;
};

export { hasAcceptedPaidProAuthority, shouldSuppressGuidedQuestionPanelForPaidAuthority } from "./authoritativePaidProReview";

/**
 * Pure plan for tests; AgreementBuilderIntake applies the returned flags to React state.
 */
export function planPaidProAcceptanceUiRouting(
  args: ApplyPaidProAcceptanceRoutingArgs,
): ApplyPaidProAcceptanceRoutingResult {
  const routing = resolvePaidProAcceptanceRoutingMarkers({
    premiumRenderSource: args.premiumRenderSource,
    acceptedBodyLen: args.acceptedBodyLen,
  });
  const authoritativePlainLen = resolveAuthoritativePaidProReviewPlain({
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  }).length;
  return {
    applied: routing.openCanonicalFinalReview && authoritativePlainLen >= 500,
    routing,
    authoritativePlainLen,
  };
}

/** Post-acceptance UI routing when corpus length alone is sufficient (returning paid create-flow). */
export function shouldOpenCanonicalPaidCreateFlowFirstReview(args: {
  premiumRenderSource?: string | null;
  acceptedBodyLen: number;
}): boolean {
  return resolvePaidProAcceptanceRoutingMarkers({
    premiumRenderSource: args.premiumRenderSource,
    acceptedBodyLen: args.acceptedBodyLen,
  }).openCanonicalFinalReview;
}

/** Side effects safe immediately after establishPaidProSourceOfTruth. */
export function commitPaidProAcceptanceStorageHygiene(): void {
  if (!hasAcceptedPaidProAuthority()) return;
  clearCreateReviewDraftReadyMarker();
  clearPersistedGuidedSession();
}
