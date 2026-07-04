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
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  hasPaidCreateFlowPipelineAcceptance,
  resolveCreateFlowAuthoritativeReviewPlain,
} from "./authoritativeCreateFlowReviewShell";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

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

/** Side effects safe immediately after establishPaidProSourceOfTruth or pipeline acceptance. */
export function commitPaidProAcceptanceStorageHygiene(): void {
  if (!hasAcceptedPaidProAuthority() && !hasPaidCreateFlowPipelineAcceptance()) return;
  clearCreateReviewDraftReadyMarker();
  clearPersistedGuidedSession();
}

export type ResolveCreateFlowAcceptedPipelineCorpusArgs = {
  agreementDocumentText?: string;
  draft?: ParsedDraftShape | null;
  pipelineWinningBody?: string | null;
  hydratedPremiumBody?: string | null;
};

/** Winning paid corpus for create-flow first review — pipeline/snapshot, never short starter preview. */
export function resolveCreateFlowAcceptedPipelineCorpusPlain(
  args: ResolveCreateFlowAcceptedPipelineCorpusArgs,
): string {
  return resolveCreateFlowAuthoritativeReviewPlain({
    agreementDocumentText: args.agreementDocumentText,
    draft: args.draft ?? null,
    pipelineWinningBody: args.pipelineWinningBody,
    hydratedPremiumBody: args.hydratedPremiumBody,
  }).trim();
}

/**
 * After [paid-pro-validation-decision] accepted on /app/create, open the same first-time paid
 * post-checkout Pro review workflow (guided applied + final review opened).
 */
export function shouldApplyCreateFlowPaidFirstReviewRouting(args: {
  alreadyOpened: boolean;
  premiumRenderSource?: string | null;
  corpusPlain?: string | null;
} & ResolveCreateFlowAcceptedPipelineCorpusArgs): boolean {
  if (args.alreadyOpened) return false;
  const corpusPlain = (args.corpusPlain ?? resolveCreateFlowAcceptedPipelineCorpusPlain(args)).trim();
  if (corpusPlain.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  return shouldOpenCanonicalPaidCreateFlowFirstReview({
    premiumRenderSource: args.premiumRenderSource,
    acceptedBodyLen: corpusPlain.length,
  });
}
