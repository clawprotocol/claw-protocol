/**
 * Frozen review/send artifact — downstream UI must not re-derive from live premium draft state.
 */

import { canonicalDocumentFingerprint, stripCanonicalCommitMarker } from "./canonicalAgreementDocument";

export type CommittedReviewArtifact = {
  plainText: string;
  fingerprint: string;
  committedAtMs: number;
  source: "premium_authoritative" | "starter_preview";
};

let activeArtifact: CommittedReviewArtifact | null = null;
let authoritativeApplyCount = 0;

export function resetCommittedReviewArtifactForTests(): void {
  activeArtifact = null;
  authoritativeApplyCount = 0;
}

export function getCommittedReviewArtifact(): CommittedReviewArtifact | null {
  return activeArtifact;
}

export function getAuthoritativeApplyCount(): number {
  return authoritativeApplyCount;
}

export function commitReviewArtifact(args: {
  plainText: string;
  source: CommittedReviewArtifact["source"];
  bumpApplyCount?: boolean;
}): CommittedReviewArtifact {
  const plain = stripCanonicalCommitMarker((args.plainText || "").trim());
  const artifact: CommittedReviewArtifact = {
    plainText: plain,
    fingerprint: canonicalDocumentFingerprint(plain),
    committedAtMs: Date.now(),
    source: args.source,
  };
  activeArtifact = artifact;
  if (args.bumpApplyCount !== false) authoritativeApplyCount += 1;
  return artifact;
}

export function shouldUseCommittedReviewArtifact(liveFingerprint: string | null | undefined): boolean {
  if (!activeArtifact) return false;
  if (!liveFingerprint) return true;
  return activeArtifact.fingerprint === liveFingerprint;
}

export type PremiumWorkflowPhase =
  | "draft_ready_for_review"
  | "recipient_setup_required"
  | "ready_to_send"
  | "capturing_input"
  | "generating_draft"
  | "complexity_choice_required";

const SEND_WORKFLOW_PHASES: ReadonlySet<PremiumWorkflowPhase> = new Set([
  "recipient_setup_required",
  "ready_to_send",
]);

export function isPremiumSendWorkflowPhase(phase: string | null | undefined): boolean {
  return SEND_WORKFLOW_PHASES.has((phase || "") as PremiumWorkflowPhase);
}

/** Suppress premium rehydration / scroll reset when user is in send/recipient flow. */
export function shouldSuppressPremiumAuthoritativeRehydrate(args: {
  createFlowPhase: string | null | undefined;
  createUiStage?: string | null;
}): boolean {
  if (isPremiumSendWorkflowPhase(args.createFlowPhase)) return true;
  if (args.createUiStage === "RECIPIENTS") return true;
  return false;
}
