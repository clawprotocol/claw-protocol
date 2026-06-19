import type { CreateFlowProductionPhase } from "../createFlowTypes";
import { isGuidedFinalReviewPhase } from "../createFlowTypes";
import type { FinalReviewSendIntent } from "../simpleProFinalReviewPhase";
import type { GuidedCompletionPhase } from "./guidedCompletionPhase";
import type { CanonicalPartyIdentity } from "./signerPartyIdentity";
import { isPlaceholderPartyName } from "../starterPartyLimits";

export const GUIDED_TRANSITION_MIN_BODY_LEN = 1000;
export const GUIDED_TRANSITION_AUTHORITATIVE_RECOVERY_LEN = 3000;
/** Minimum frozen authoritative corpus before post-final-review signing may proceed. */
export const GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN = 2000;

export type ReviewSessionState =
  | "idle"
  | "review_package_ready"
  | "revision_uploaded"
  | "revision_accepted"
  | "approved_for_signing";

export type SignerWorkflowStatus = "pending" | "reviewed" | "approved" | "signed";

export type CanonicalSignerManifestEntry = {
  partyName: string;
  signerName: string | null;
  title: string | null;
  email: string;
  signingOrder: number;
  reviewStatus: SignerWorkflowStatus;
  signatureStatus: SignerWorkflowStatus;
};

export type CanonicalSignerManifest = {
  signFirst: boolean;
  entries: CanonicalSignerManifestEntry[];
};

export type ReviewContinuityState = {
  reviewSessionState: ReviewSessionState;
  reviewAcceptedByParties: boolean;
  uploadedRevisionCorpus: string;
  latestAcceptedCorpus: string;
};

export type GuidedTransitionAssertReason =
  | "accepted_corpus_missing"
  | "authoritative_corpus_missing"
  | "signer_manifest_missing"
  | "body_below_threshold"
  | "preview_not_renderable";

export type GuidedTransitionAssertion = {
  ok: boolean;
  reason: GuidedTransitionAssertReason | null;
  bodyLen: number;
  signerCount: number;
};

export function buildCanonicalSignerManifest(args: {
  identities: readonly CanonicalPartyIdentity[];
  signFirst: boolean;
}): CanonicalSignerManifest {
  return {
    signFirst: args.signFirst,
    entries: args.identities
      .filter(
        (id) =>
          id.partyDisplayName.trim().length > 0 && !isPlaceholderPartyName(id.partyDisplayName.trim()),
      )
      .map((id, index) => ({
        partyName: id.partyDisplayName.trim(),
        signerName: id.representativeName?.trim() || id.partyDisplayName.trim(),
        title: id.title?.trim() || null,
        email: id.email.trim(),
        signingOrder: args.signFirst ? index : args.identities.length - index - 1,
        reviewStatus: "pending",
        signatureStatus: "pending",
      })),
  };
}

export function createInitialReviewContinuityState(corpus: string): ReviewContinuityState {
  return {
    reviewSessionState: "idle",
    reviewAcceptedByParties: false,
    uploadedRevisionCorpus: "",
    latestAcceptedCorpus: corpus.trim(),
  };
}

export function applyUploadedRevisionCandidate(
  state: ReviewContinuityState,
  uploadedRevisionCorpus: string,
): ReviewContinuityState {
  return {
    ...state,
    reviewSessionState: "revision_uploaded",
    uploadedRevisionCorpus: uploadedRevisionCorpus.trim(),
  };
}

export function acceptUploadedRevision(
  state: ReviewContinuityState,
): ReviewContinuityState {
  const candidate = state.uploadedRevisionCorpus.trim();
  if (!candidate) return state;
  return {
    ...state,
    reviewSessionState: "revision_accepted",
    latestAcceptedCorpus: candidate,
    uploadedRevisionCorpus: "",
  };
}

export function markReviewApprovedForSigning(
  state: ReviewContinuityState,
): ReviewContinuityState {
  return {
    ...state,
    reviewSessionState: "approved_for_signing",
    reviewAcceptedByParties: true,
  };
}

export function assertGuidedPostFinalReviewTransition(args: {
  action: FinalReviewSendIntent | "review_upload" | "review_accept" | "signing_confirm";
  acceptedCorpus: string;
  authoritativeCorpus: string;
  signerManifest: CanonicalSignerManifest | null;
  renderablePreview: string;
  minBodyLen?: number;
}): GuidedTransitionAssertion {
  const accepted = args.acceptedCorpus.trim();
  const authoritative = args.authoritativeCorpus.trim();
  const preview = args.renderablePreview.trim();
  const bodyLen = accepted.length;
  const signerCount = args.signerManifest?.entries.length ?? 0;
  const min = args.minBodyLen ?? GUIDED_TRANSITION_MIN_BODY_LEN;

  if (!accepted) return { ok: false, reason: "accepted_corpus_missing", bodyLen, signerCount };
  if (!authoritative) return { ok: false, reason: "authoritative_corpus_missing", bodyLen, signerCount };
  if (!args.signerManifest || signerCount === 0) {
    return { ok: false, reason: "signer_manifest_missing", bodyLen, signerCount };
  }
  if (bodyLen < min) return { ok: false, reason: "body_below_threshold", bodyLen, signerCount };
  if (preview.length < min && authoritative.length > GUIDED_TRANSITION_AUTHORITATIVE_RECOVERY_LEN) {
    return { ok: false, reason: "preview_not_renderable", bodyLen, signerCount };
  }
  return { ok: true, reason: null, bodyLen, signerCount };
}

export function logAuthoritativeCorpusFrozen(payload: { bodyLen: number; source: string }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[authoritative-corpus-frozen]", payload);
}

export function logReviewCorpusAccepted(payload: { bodyLen: number; action: string }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[review-corpus-accepted]", payload);
}

export function logSigningCorpusInitialized(payload: { bodyLen: number; signerCount: number }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[signing-corpus-initialized]", payload);
}

export function logGuidedTransitionAssertionBlocked(payload: {
  action: string;
  reason: GuidedTransitionAssertReason;
  bodyLen: number;
  signerCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-transition-assertion-blocked]", payload);
}

export function isGuidedPostApplySigningFlowPhase(phase: CreateFlowProductionPhase): boolean {
  return (
    isGuidedFinalReviewPhase(phase) ||
    phase === "recipient_setup_required" ||
    phase === "ready_to_send"
  );
}

/**
 * Post-apply final review may proceed to signing when authoritative corpus and signers are ready.
 * Does not require guidedCompletionActive (phase "applied" ends the guided question session).
 */
export function canProceedFromGuidedFinalReviewToSigning(args: {
  paidProAuthoritative: boolean;
  guidedCompletionPhase: GuidedCompletionPhase;
  finalReviewExplicitlyOpened: boolean;
  createFlowPhase: CreateFlowProductionPhase;
  authoritativeCorpusLen: number;
  signersComplete: boolean;
  refineInFlight?: boolean;
  minAuthoritativeLen?: number;
  /** Post–signer-finalize paid Pro: explicit Prepare signature links only. */
  hasAuthoritativeSigningSnapshot?: boolean;
  acceptedPaidProAuthority?: boolean;
  signaturePreparationRequested?: boolean;
}): boolean {
  if (
    args.acceptedPaidProAuthority &&
    args.hasAuthoritativeSigningSnapshot &&
    args.signersComplete
  ) {
    if (!args.signaturePreparationRequested) return false;
    if (args.refineInFlight) return false;
    const minLen = args.minAuthoritativeLen ?? GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN;
    if (args.authoritativeCorpusLen < minLen) return false;
    return true;
  }
  if (!args.paidProAuthoritative) return false;
  if (args.guidedCompletionPhase !== "applied") return false;
  if (args.refineInFlight) return false;
  if (!args.signersComplete) return false;
  const minLen = args.minAuthoritativeLen ?? GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN;
  if (args.authoritativeCorpusLen < minLen) return false;
  if (args.finalReviewExplicitlyOpened) return true;
  return isGuidedPostApplySigningFlowPhase(args.createFlowPhase);
}

export function logGuidedContinueFinalReviewToSigning(payload: {
  intent: string;
  bodyLen: number;
  phase: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-continue-final-review-to-signing]", payload);
}
