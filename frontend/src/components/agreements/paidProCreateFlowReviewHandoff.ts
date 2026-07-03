/**
 * Paid /app/create handoff: after pipeline freeze acceptance, establish review authority
 * from the latched substantive corpus — never the short starter preview.
 */

import { readCachedWorkspaceProEntitlement } from "../../agreement/agreementProFunnelGate";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  establishAcceptedPremiumCanonicalCorpus,
  isAcceptedPremiumCanonicalEstablished,
} from "./acceptedPremiumCanonicalCorpus";
import { commitPaidProAcceptanceStorageHygiene } from "./paidProAcceptanceRouting";
import { subscriptionTierForAccess } from "../../access/subscriptionEntitlementCache";
import { tierAllowsAdvancedFullDraftReveal } from "./agreementAdvancedDraftAccess";
import {
  getLatchedAcceptedServerFullDraftAuthority,
  latchAcceptedServerFullDraftAuthority,
} from "./premiumAcceptancePolicy";
import { hasPaidProPipelineSessionAcceptance } from "./paidProPostAcceptanceValidatorCache";
import { readPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { hasCurrentSessionProEntitlement } from "./paidProSessionEligibility";
import { readPremiumCompletionSnapshot } from "./premiumCompletionStorage";

export function hasAcceptedPaidCreateFlowFreezeLatch(): boolean {
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  if (latched?.freezeEstablished && latched.body.trim().length >= 500) return true;
  return readPaidProPipelineAcceptedCorpusHash() !== null;
}

export function resolveWorkspaceProSubscriptionEntitled(): boolean {
  const subTier = subscriptionTierForAccess();
  return Boolean(subTier && tierAllowsAdvancedFullDraftReveal(subTier));
}

/** Cached subscription tier OR workspace billing probe — not React access tier alone. */
export function resolveCreateFlowWorkspaceProEntitled(): boolean {
  return resolveWorkspaceProSubscriptionEntitled() || readCachedWorkspaceProEntitlement();
}

export function hasPaidCreateFlowPipelineAcceptance(): boolean {
  return readPaidProPipelineAcceptedCorpusHash() !== null;
}

export function shouldBlockFreeStarterReviewSurfaces(): boolean {
  if (hasPaidProSourceOfTruth()) return true;
  if (hasAcceptedPaidCreateFlowFreezeLatch()) return true;
  const snap = readPremiumCompletionSnapshot();
  const pipelineAccepted = hasPaidCreateFlowPipelineAcceptance();
  const premiumSnapAccepted = snap?.premiumAccepted === true;
  if (!pipelineAccepted && !premiumSnapAccepted) return false;
  if (hasCurrentSessionProEntitlement()) return true;
  if (resolveCreateFlowWorkspaceProEntitled()) return true;
  return false;
}

export function resolveSubstantiveAcceptedPremiumBodyForReviewHandoff(args: {
  winningBody: string;
  snapshotPlain: string;
  pipelineSource: string;
}): { text: string; source: string } | null {
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  if (latched?.freezeEstablished) {
    const body = latched.body.trim();
    if (body.length >= 500) {
      return { text: body, source: latched.source || args.pipelineSource };
    }
  }
  const pipelineSource = (args.pipelineSource || "server_full_draft").trim();
  if (!isAuthoritativePremiumPipelineRenderSource(pipelineSource)) return null;
  const candidates = [args.winningBody, args.snapshotPlain]
    .map((s) => (s || "").trim())
    .filter((s) => s.length >= 500)
    .sort((a, b) => b.length - a.length);
  for (const text of candidates) {
    if (hasPaidProPipelineSessionAcceptance({ text, source: pipelineSource })) {
      return { text, source: pipelineSource };
    }
  }
  if (hasPaidCreateFlowPipelineAcceptance()) {
    const winning = (args.winningBody || "").trim();
    if (winning.length >= 500) {
      return { text: winning, source: pipelineSource };
    }
  }
  return null;
}

/** Prefer pipeline-accepted corpus over short starter preview for create-flow display. */
export function resolveCreateFlowPaidReviewDisplayPlain(args: {
  winningBody: string;
  snapshotPlain: string;
  pipelineSource: string;
  handoffBody?: string;
  handoffEstablished?: boolean;
}): string {
  const snapshotPlain = (args.snapshotPlain || "").trim();
  const handoffBody = (args.handoffBody || "").trim();
  if (args.handoffEstablished && handoffBody.length >= 500) return handoffBody;
  const substantive = resolveSubstantiveAcceptedPremiumBodyForReviewHandoff({
    winningBody: args.winningBody,
    snapshotPlain,
    pipelineSource: args.pipelineSource,
  });
  const candidates = [
    handoffBody,
    substantive?.text ?? "",
    (args.winningBody || "").trim(),
    snapshotPlain,
  ]
    .map((s) => s.trim())
    .filter((s) => s.length >= 500)
    .sort((a, b) => b.length - a.length);
  return candidates[0] ?? snapshotPlain;
}

export type EstablishAcceptedPremiumCorpusForCreateFlowResult = {
  established: boolean;
  body: string;
  source: string;
};

/**
 * Establish Paid Pro SoT from the freeze-latched / pipeline-accepted corpus for create-flow handoff.
 */
export function tryEstablishAcceptedPremiumCorpusForCreateFlowHandoff(args: {
  winningBody: string;
  snapshotPlain: string;
  pipelineSource: string;
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
}): EstablishAcceptedPremiumCorpusForCreateFlowResult {
  if (isAcceptedPremiumCanonicalEstablished()) {
    const existing = getLatchedAcceptedServerFullDraftAuthority();
    return {
      established: true,
      body: existing?.body.trim() || args.snapshotPlain.trim(),
      source: existing?.source || args.pipelineSource,
    };
  }
  const resolved = resolveSubstantiveAcceptedPremiumBodyForReviewHandoff({
    winningBody: args.winningBody,
    snapshotPlain: args.snapshotPlain,
    pipelineSource: args.pipelineSource,
  });
  if (!resolved) {
    return {
      established: false,
      body: args.snapshotPlain.trim(),
      source: args.pipelineSource,
    };
  }
  try {
    establishAcceptedPremiumCanonicalCorpus({
      rawAcceptedBody: resolved.text,
      pipelineSource: resolved.source,
      draft: args.draft ?? null,
      intakeText: args.intakeText ?? null,
    });
    commitPaidProAcceptanceStorageHygiene();
    return { established: true, body: resolved.text, source: resolved.source };
  } catch {
    return { established: false, body: resolved.text, source: resolved.source };
  }
}

/** Test helper: simulate accepted freeze latch without full pipeline. */
export function latchAcceptedPremiumBodyForCreateFlowTest(
  body: string,
  source = "server_full_draft",
): void {
  latchAcceptedServerFullDraftAuthority(body, source, { freezeEstablished: true });
}
