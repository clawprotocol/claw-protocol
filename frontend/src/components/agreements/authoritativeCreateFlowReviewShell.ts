/**
 * Single authoritative decision: Paid Pro review shell vs Free Starter acquisition shell.
 * All create-flow review presentation must consult this module — downstream guards must not override it.
 */

import { readCachedWorkspaceProEntitlement } from "../../agreement/agreementProFunnelGate";
import type { AccessTier } from "../../access/types";
import { subscriptionTierForAccess } from "../../access/subscriptionEntitlementCache";
import { CreateUiStage } from "./createUiStage";
import type { CreateFlowProductionPhase } from "./createFlowTypes";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";
import { hasPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "./paidProSourceOfTruth";
import { readPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { getLatchedAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import { readPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";

export type AuthoritativeCreateFlowReviewShell = "paid_pro" | "free_starter";

export type ResolveAuthoritativeCreateFlowReviewShellInput = {
  /** React state from fetchWorkspaceProEntitlement — may lead cached module probe. */
  workspaceProEntitled?: boolean;
  tier?: AccessTier;
  premiumPersistedFlowActive?: boolean;
  premiumSendPathUnlocked?: boolean;
  paidProAuthoritative?: boolean;
  premiumCheckoutCompleted?: boolean;
};

export function resolveWorkspaceProSubscriptionEntitled(): boolean {
  const subTier = subscriptionTierForAccess();
  return Boolean(subTier && tierAllowsAdvancedFullDraftReveal(subTier));
}

export function resolveCreateFlowWorkspaceProEntitled(): boolean {
  return resolveWorkspaceProSubscriptionEntitled() || readCachedWorkspaceProEntitlement();
}

export function hasPaidCreateFlowPipelineAcceptance(): boolean {
  return readPaidProPipelineAcceptedCorpusHash() !== null;
}

export function hasAcceptedPaidCreateFlowFreezeLatch(): boolean {
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  if (latched?.freezeEstablished && latched.body.trim().length >= 500) return true;
  return hasPaidCreateFlowPipelineAcceptance();
}

export function resolveAuthoritativeCreateFlowReviewShell(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): AuthoritativeCreateFlowReviewShell {
  if (input.premiumCheckoutCompleted) return "paid_pro";
  if (hasPaidProSourceOfTruth()) return "paid_pro";
  if (input.paidProAuthoritative) return "paid_pro";
  if (input.premiumPersistedFlowActive || input.premiumSendPathUnlocked) return "paid_pro";
  if (input.workspaceProEntitled || resolveCreateFlowWorkspaceProEntitled()) return "paid_pro";
  if (input.tier && tierAllowsAdvancedFullDraftReveal(input.tier)) return "paid_pro";
  if (hasAcceptedPaidCreateFlowFreezeLatch()) return "paid_pro";
  if (hasPaidCreateFlowPipelineAcceptance()) return "paid_pro";
  const snap = readPremiumCompletionSnapshot();
  if (snap?.premiumAccepted === true) return "paid_pro";
  return "free_starter";
}

export function shouldUsePaidProCreateFlowReviewShell(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): boolean {
  return resolveAuthoritativeCreateFlowReviewShell(input) === "paid_pro";
}

export function shouldBlockFreeStarterReviewSurfaces(
  input: ResolveAuthoritativeCreateFlowReviewShellInput = {},
): boolean {
  return shouldUsePaidProCreateFlowReviewShell(input);
}

export type ComputeCreateFlowPaidProReviewReadyInput = ResolveAuthoritativeCreateFlowReviewShellInput & {
  simpleProductFlow: boolean;
  liveWorkspaceTwoPane: boolean;
  paidProAuthoritative: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  displayPhase: string;
  createFlowPhase?: CreateFlowProductionPhase;
};

/** Paid Pro review chrome on `/app/create` — workspace-pro and pipeline-accepted users included. */
export function computeCreateFlowPaidProReviewReady(
  input: ComputeCreateFlowPaidProReviewReadyInput,
): boolean {
  if (!input.simpleProductFlow || !input.liveWorkspaceTwoPane) return false;
  if (shouldUsePaidProCreateFlowReviewShell(input)) {
    if (input.createUiStage === CreateUiStage.RECIPIENTS) return true;
    return (
      input.createUiStage === CreateUiStage.DRAFT &&
      (input.displayPhase === "review" ||
        input.displayPhase === "generating_draft" ||
        input.createFlowPhase === "generating_draft" ||
        input.createFlowPhase === "draft_ready_for_review")
    );
  }
  if (!input.paidProAuthoritative) return false;
  if (input.createUiStage === CreateUiStage.RECIPIENTS) return true;
  return input.createUiStage === CreateUiStage.DRAFT && input.displayPhase === "review";
}

/** Review plain text for paid create-flow shell when SoT is not yet frozen. */
export function resolveCreateFlowAuthoritativeReviewPlain(args: {
  agreementDocumentText?: string;
  draft?: ParsedDraftShape | null;
}): string {
  const sot = getPaidProSourceOfTruthText().trim();
  if (sot.length >= 500) return sot;
  const snap = readPremiumCompletionSnapshot();
  const snapBody = (snap?.premiumWinningBodyText || snap?.premiumReadonlyPlainText || "").trim();
  if (snap?.premiumAccepted && snapBody.length >= 500) return snapBody;
  const draftPremium = String(args.draft?.premium_server_full_document_text ?? "").trim();
  if (hasPaidCreateFlowPipelineAcceptance() && draftPremium.length >= 500) return draftPremium;
  const doc = (args.agreementDocumentText || "").trim();
  if (hasPaidCreateFlowPipelineAcceptance() && doc.length >= 500) return doc;
  return doc;
}

export function logAuthoritativeCreateFlowReviewShellResolved(
  input: ResolveAuthoritativeCreateFlowReviewShellInput,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const shell = resolveAuthoritativeCreateFlowReviewShell(input);
  console.info("[authoritative-create-flow-review-shell]", {
    shell,
    workspaceProEntitled: Boolean(input.workspaceProEntitled),
    workspaceProCached: resolveCreateFlowWorkspaceProEntitled(),
    pipelineAccepted: hasPaidCreateFlowPipelineAcceptance(),
    hasSourceOfTruth: hasPaidProSourceOfTruth(),
    premiumSnapAccepted: readPremiumCompletionSnapshot()?.premiumAccepted === true,
  });
}
