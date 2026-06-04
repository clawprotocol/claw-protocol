/**
 * Paid Pro review surface: when frozen SoT exists, visible shell/body/CTA must never use free starter state.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { readAuthoritativeSigningCorpus } from "./authoritativeSigningSnapshot";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";
import { stripPremiumIntelligenceCalloutsFromCorpus } from "./premiumDocumentIntelligenceStrip";
import {
  PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN,
  readPaidProPinnedSignerAppliedCorpus,
  resolvePaidProFinalHydratedCorpusForSurface,
} from "./paidProFinalHydratedCorpus";
import {
  guardPaidProReviewRenderCorpus,
  resolvePaidProReviewRenderPlain,
} from "./paidProReviewRenderCorpus";
import { QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE } from "./canonicalPartyLegalNameSanitizer";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  resolvePaidProAuthoritativeDisplayPlain,
  shouldUsePaidProSourceOfTruthDisplayOnly,
} from "./paidProAuthoritativeRenderGate";
import { resolvePaidProPostCheckoutFirstReviewPlain } from "./paidProPostCheckoutRenderGate";
import {
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS } from "./paidProReviewTrustUx";

export { PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS };

export const PAID_PRO_REVIEW_SHELL_TITLE = "Agreement ready";
export const PAID_PRO_REVIEW_SHELL_SUBTITLE =
  "Review the agreement below. Next, add signer details to create signature links.";
export const PAID_PRO_REVIEW_SHELL_SAFETY_LINE =
  "Nothing is sent or signed until you choose to share the links.";
export const PAID_PRO_REVIEW_BADGE = "Pro agreement";
export const PAID_PRO_REVIEW_CHIP_VERSION = "Pro agreement";
/** @deprecated Prefer {@link resolvePaidProReviewChipState} for stage-accurate copy. */
export const PAID_PRO_REVIEW_CHIP_STATE = "Ready for signature";

/** Same label as trust-rail signer step — status, not an action. */
export const PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNER_SETUP = PAID_PRO_REVIEW_SIGNER_DETAILS_NEEDED_STATUS;
export const PAID_PRO_REVIEW_CHIP_READY_TO_PREPARE_SIGNING_LINKS = "Ready to prepare signing links";
export const PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNING = "Ready for signing";

/** Display-only review status chip — does not change workflow state machine. */
export function resolvePaidProReviewChipState(args: {
  signersReady: boolean;
  signingLinksCreated?: boolean;
}): string {
  if (args.signingLinksCreated) return PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNING;
  if (args.signersReady) return PAID_PRO_REVIEW_CHIP_READY_TO_PREPARE_SIGNING_LINKS;
  return PAID_PRO_REVIEW_CHIP_READY_FOR_SIGNER_SETUP;
}
/** Subtle secondary action on the paid Pro review shell. */
export const PAID_PRO_REVIEW_EDIT_SIGNER_DETAILS_LABEL = "Edit signer details";

export type AuthoritativePaidProReviewInput = {
  /** When explicitly false, do not treat as paid review (rare). */
  isPaidPro?: boolean;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  premiumRenderSource?: string | null;
};

function finalizeAuthoritativePaidProReviewPlain(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < PAID_PRO_AUTHORITY_MIN_LEN) return trimmed;
  const parties = readConsumedPaidProSignerMetadataAuthority()?.parties;
  const repaired = repairMalformedPaidProAgreementRecital(trimmed, parties).text.trim();
  return stripPremiumIntelligenceCalloutsFromCorpus(repaired);
}

export function resolveAuthoritativePaidProReviewPlain(
  args?: AuthoritativePaidProReviewInput,
): string {
  if (shouldUsePaidProSourceOfTruthDisplayOnly()) {
    return resolvePaidProAuthoritativeDisplayPlain({
      draft: args?.draft ?? null,
      intakeText: args?.intakeText ?? null,
    });
  }
  const pinnedPlain = readPaidProPinnedSignerAppliedCorpus().trim();
  if (pinnedPlain.length >= PAID_PRO_FINAL_HYDRATED_CORPUS_MIN_LEN) {
    return finalizeAuthoritativePaidProReviewPlain(pinnedPlain);
  }
  const postCheckoutRecovery = resolvePaidProPostCheckoutFirstReviewPlain({
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
    premiumRenderSource: args?.premiumRenderSource ?? null,
    winningPremiumBodyText:
      String(args?.draft?.premium_full_document_text ?? "").trim() || undefined,
  });
  if (postCheckoutRecovery.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return finalizeAuthoritativePaidProReviewPlain(postCheckoutRecovery);
  }
  if (hasPaidProSourceOfTruth()) {
    const renderPlain = resolvePaidProReviewRenderPlain({
      draft: args?.draft ?? null,
      intakeText: args?.intakeText ?? null,
    });
    if (renderPlain.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
      return renderPlain;
    }
  }

  const hydrated = resolvePaidProFinalHydratedCorpusForSurface("review", {
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
  });
  if (hydrated.signerMetadataApplied && hydrated.text.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return finalizeAuthoritativePaidProReviewPlain(hydrated.text);
  }

  const fromSnapshot = readAuthoritativeSigningCorpus();
  if (fromSnapshot.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return finalizeAuthoritativePaidProReviewPlain(fromSnapshot);
  }
  const review = getPaidProDocumentForSurface("review", {
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
  });
  const display = getPaidProDocumentForSurface("display", {
    draft: args?.draft ?? null,
    intakeText: args?.intakeText ?? null,
  });
  const fromSurfaces = (review?.text || display?.text || "").trim();
  if (fromSurfaces.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return finalizeAuthoritativePaidProReviewPlain(fromSurfaces);
  }
  const sot = getPaidProSourceOfTruthText().trim();
  return sot.length >= PAID_PRO_AUTHORITY_MIN_LEN
    ? finalizeAuthoritativePaidProReviewPlain(sot)
    : fromSurfaces;
}

/**
 * True when paid SoT is established and a non-empty review/display corpus is available.
 */
export function isAuthoritativePaidProReview(input?: AuthoritativePaidProReviewInput): boolean {
  if (input?.isPaidPro === false) return false;
  if (!hasPaidProSourceOfTruth()) return false;
  return resolveAuthoritativePaidProReviewPlain(input).length >= PAID_PRO_AUTHORITY_MIN_LEN;
}

/** Single authority predicate — wins over guided Q&A, starter restore, and preview fallbacks. */
export function hasAcceptedPaidProAuthority(input?: AuthoritativePaidProReviewInput): boolean {
  return isAuthoritativePaidProReview(input);
}

export function shouldSuppressGuidedQuestionPanelForPaidAuthority(
  input?: AuthoritativePaidProReviewInput,
): boolean {
  return hasAcceptedPaidProAuthority(input);
}

export type PaidProAcceptanceRoutingMarkers = {
  clearStarterDraftReadyMarker: boolean;
  suppressGuidedQuestionPanel: boolean;
  openCanonicalFinalReview: boolean;
  setGuidedPhaseApplied: boolean;
};

/** After server_full_draft acceptance, UI must hard-route to canonical paid review (not guided Q&A / starter). */
export function resolvePaidProAcceptanceRoutingMarkers(args: {
  premiumRenderSource?: string | null;
  acceptedBodyLen: number;
}): PaidProAcceptanceRoutingMarkers {
  const len = Math.max(0, args.acceptedBodyLen);
  const pipelineAuthoritative =
    isAuthoritativePremiumPipelineRenderSource(args.premiumRenderSource) &&
    len >= PAID_PRO_AUTHORITY_MIN_LEN;
  const sotActive = hasAcceptedPaidProAuthority();
  const active = sotActive || pipelineAuthoritative;
  return {
    clearStarterDraftReadyMarker: active,
    suppressGuidedQuestionPanel: active,
    openCanonicalFinalReview: active,
    setGuidedPhaseApplied: active,
  };
}

/** Block restoring stored free starter snapshot into visible paid review. */
export function paidProAuthorityBlocksStarterReviewRestore(): boolean {
  return isAuthoritativePaidProReview();
}

/**
 * Final review visible plain: never drop paid SoT when boundary/preview layers return empty.
 */
export function resolvePaidProFinalReviewVisiblePlain(args: {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  boundaryPlain?: string | null;
  displayCandidatePlain?: string | null;
}): string {
  if (shouldUsePaidProSourceOfTruthDisplayOnly()) {
    return resolvePaidProAuthoritativeDisplayPlain({
      draft: args?.draft ?? null,
      intakeText: args?.intakeText ?? null,
    });
  }
  const renderPlain = resolvePaidProReviewRenderPlain({
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  });
  if (renderPlain.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    return renderPlain;
  }
  const authoritative = resolveAuthoritativePaidProReviewPlain({
    draft: args.draft ?? null,
    intakeText: args.intakeText ?? null,
  });
  if (authoritative.length < PAID_PRO_AUTHORITY_MIN_LEN) {
    return (args.boundaryPlain || args.displayCandidatePlain || "").trim();
  }
  const boundary = (args.boundaryPlain || "").trim();
  if (
    boundary.length >= PAID_PRO_AUTHORITY_MIN_LEN &&
    !boundary.includes(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE) &&
    !shouldUsePaidProSourceOfTruthDisplayOnly()
  ) {
    return guardPaidProReviewRenderCorpus(boundary).text;
  }
  const display = (args.displayCandidatePlain || "").trim();
  if (
    display.length >= PAID_PRO_AUTHORITY_MIN_LEN &&
    !display.includes(QA_FUSED_PARTY_LEGAL_NAME_EXAMPLE) &&
    !shouldUsePaidProSourceOfTruthDisplayOnly()
  ) {
    return guardPaidProReviewRenderCorpus(display).text;
  }
  return authoritative;
}

/** Paid SoT present — do not show finalizing/unavailable preview chrome on final review. */
export function suppressPaidProFinalReviewFinalizingState(
  input?: AuthoritativePaidProReviewInput,
): boolean {
  return hasAcceptedPaidProAuthority(input);
}

export function starterPlainLooksStaleVersusPaidAuthority(
  starterPlain: string,
  paidPlain: string,
): boolean {
  const starter = starterPlain.trim();
  const paid = paidPlain.trim();
  if (paid.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  if (!starter) return true;
  if (starter.length < PAID_PRO_AUTHORITY_MIN_LEN) return true;
  if (starter.length < paid.length * 0.85) return true;
  return starter !== paid && paid.length > starter.length + 120;
}
