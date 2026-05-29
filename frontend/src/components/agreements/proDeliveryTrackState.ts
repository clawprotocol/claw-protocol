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
}): ProDeliveryTrack {
  if (args.premiumSignersSurfaceReady && args.effectiveSendMode === "signature") return "signature";
  if (!args.sendModeTouched) return null;
  return args.effectiveSendMode;
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
