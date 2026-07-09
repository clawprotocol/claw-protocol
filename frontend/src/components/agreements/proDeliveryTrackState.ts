import { resolveProDeliveryTrackCanonicalCorpus } from "./paidProPostAcceptanceStateGuard";
import type { CreateFlowProductionPhase } from "./createFlowTypes";
import type { PremiumSendIntent } from "../../launch/simpleProduct/premiumSendIntent";

export type ProDeliveryTrack = PremiumSendIntent | null;

export function canChooseProDeliveryTrack(args: {
  isPaidPro: boolean;
  createFlowPhase: CreateFlowProductionPhase;
  hasCanonicalCorpus?: boolean;
}): boolean {
  if (!args.isPaidPro) return false;
  const corpus =
    typeof args.hasCanonicalCorpus === "boolean"
      ? { hasCanonicalCorpus: args.hasCanonicalCorpus, hash: null, source: "none" as const }
      : resolveProDeliveryTrackCanonicalCorpus();
  if (!corpus.hasCanonicalCorpus) return false;
  return (
    args.createFlowPhase === "draft_ready_for_review" ||
    args.createFlowPhase === "recipient_setup_required" ||
    args.createFlowPhase === "ready_to_send"
  );
}

export function resolveProDeliveryTrackSelected(args: {
  sendModeTouched: boolean;
  effectiveSendMode: PremiumSendIntent;
  premiumSignersSurfaceReady: boolean;
  /**
   * TEST577: once the user explicitly clicks "Prepare for signing" the signature delivery track is
   * latched. That intent must survive the inline signer-setup phase — during which
   * `signaturePreparationRequested` is deliberately held false so signer fields stay mounted for
   * confirmation — and the signer-details finalize. Without this the effective send mode falls back to
   * the review-first default and the delivery track visibly flips signature → review, routing the
   * green CTA back to the review decision instead of advancing to signature preparation.
   */
  signaturePrepIntentLatched?: boolean;
}): ProDeliveryTrack {
  if (args.signaturePrepIntentLatched) return "signature";
  if (args.premiumSignersSurfaceReady && args.effectiveSendMode === "signature") return "signature";
  if (!args.sendModeTouched) return null;
  return args.effectiveSendMode;
}

/**
 * TEST577: the paid-Pro review surface defaults to the review-first track only while the user has NOT
 * explicitly chosen the signature track. The default must NOT re-assert itself after the user clicks
 * "Prepare for signing" (which latches the signature intent) merely because the inline signer-setup
 * phase holds `signaturePreparationRequested` false. Callers use this to decide whether the effective
 * paid-Pro send mode should collapse to "review".
 */
export function paidProReviewDefaultsToReviewTrack(args: {
  paidProAuthoritative: boolean;
  signaturePreparationRequested: boolean;
  signaturePrepIntentLatched: boolean;
}): boolean {
  return (
    args.paidProAuthoritative &&
    !args.signaturePreparationRequested &&
    !args.signaturePrepIntentLatched
  );
}

export function logProDeliveryTrackState(args: {
  hasCanonicalCorpus: boolean;
  hash: string | null;
  canChooseProDeliveryTrack: boolean;
  selectedTrack: ProDeliveryTrack;
  createFlowPhase?: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[pro-delivery-track-state]", {
    hasCanonicalCorpus: args.hasCanonicalCorpus,
    hash: args.hash,
    canChooseProDeliveryTrack: args.canChooseProDeliveryTrack,
    selectedTrack: args.selectedTrack,
    createFlowPhase: args.createFlowPhase ?? null,
  });
}

export function logAgreementFlowStep(args: {
  step: string;
  selectedAction: ProDeliveryTrack;
  hasCanonicalCorpus: boolean;
  requiresPartyAddress: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[agreement-flow-step]", {
    step: args.step,
    selectedAction: args.selectedAction,
    hasCanonicalCorpus: args.hasCanonicalCorpus,
    requiresPartyAddress: args.requiresPartyAddress,
  });
}

export function frozenCanonicalCorpusHashForDeliveryTrack(): string | null {
  return resolveProDeliveryTrackCanonicalCorpus().hash;
}

export function hasCanonicalCorpusForProDeliveryTrack(): boolean {
  return resolveProDeliveryTrackCanonicalCorpus().hasCanonicalCorpus;
}
