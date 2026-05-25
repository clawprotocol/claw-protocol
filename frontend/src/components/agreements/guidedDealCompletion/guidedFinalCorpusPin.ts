/**
 * Pin finalized signer-applied guided corpus after final review — hydrate/resume must not replace it.
 */

import type { CreateFlowProductionPhase } from "../createFlowTypes";
import type { GuidedCompletionPhase } from "./guidedCompletionPhase";
import { fingerprintAgreementBody } from "./guidedSigningPacketVersion";

export type PinnedFinalizedSignerCorpus = {
  body: string;
  hash: string;
};

const PHASE_REVERT_TARGETS = new Set<CreateFlowProductionPhase>([
  "draft_ready_for_review",
  "capturing_input",
  "signer_setup_required",
  "updated_agreement_ready",
]);

const PHASE_ANCHOR_SOURCES = new Set<CreateFlowProductionPhase>([
  "guided_final_review",
  "ready_to_send",
  "finalizing_final_review",
  "recipient_setup_required",
]);

export function buildPinnedFinalizedSignerCorpus(body: string): PinnedFinalizedSignerCorpus | null {
  const stable = (body || "").trim();
  if (!stable) return null;
  return { body: stable, hash: fingerprintAgreementBody(stable) };
}

export function isGuidedFinalCorpusPinActive(args: {
  pinnedHash?: string | null;
  guidedCompletionPhase?: GuidedCompletionPhase | string;
}): boolean {
  return Boolean(args.pinnedHash?.trim()) && args.guidedCompletionPhase === "applied";
}

export function shouldRejectHydratedCorpusOverPin(args: {
  pinnedHash: string;
  incomingBody: string;
}): boolean {
  const pinned = (args.pinnedHash || "").trim();
  const incoming = (args.incomingBody || "").trim();
  if (!pinned || !incoming) return false;
  return fingerprintAgreementBody(incoming) !== pinned;
}

export function shouldBlockGuidedFinalReviewPhaseRollback(args: {
  targetPhase: CreateFlowProductionPhase;
  currentPhase: CreateFlowProductionPhase;
  pinnedHash?: string | null;
  guidedCompletionPhase?: GuidedCompletionPhase | string;
  finalReviewExplicitlyOpened?: boolean;
  guidedSignatureTrackInFlight?: boolean;
}): boolean {
  if (!isGuidedFinalCorpusPinActive(args)) return false;
  if (!args.finalReviewExplicitlyOpened) return false;
  if (!PHASE_REVERT_TARGETS.has(args.targetPhase)) return false;
  return (
    Boolean(args.guidedSignatureTrackInFlight) ||
    PHASE_ANCHOR_SOURCES.has(args.currentPhase) ||
    args.currentPhase === "guided_final_review"
  );
}

export function resolvePersistAgreementIdAfterHydrate(args: {
  postedId?: string | null;
  reviewAgreementIdRef?: string | null;
  reviewAgreementId?: string | null;
  productionSendBarAgreementId?: string | null;
  productionSendBarAgreementIdRef?: string | null;
  draftAgreementId?: string | null;
  resumeAgreementId?: string | null;
}): string {
  return (
    (args.postedId || "").trim() ||
    (args.reviewAgreementIdRef || "").trim() ||
    (args.reviewAgreementId || "").trim() ||
    (args.productionSendBarAgreementIdRef || "").trim() ||
    (args.productionSendBarAgreementId || "").trim() ||
    (args.draftAgreementId || "").trim() ||
    (args.resumeAgreementId || "").trim() ||
    ""
  );
}

export function logGuidedFinalCorpusPinned(payload: {
  hash: string;
  bodyLen: number;
  source: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-corpus-pinned]", payload);
}

export function logGuidedFinalCorpusPinRestored(payload: {
  hash: string;
  bodyLen: number;
  reason: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-corpus-pin-restored]", payload);
}

export function logGuidedFinalCorpusPinRejected(payload: {
  pinnedHash: string;
  incomingLen: number;
  incomingHash: string;
  reason: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-corpus-pin-rejected]", payload);
}
