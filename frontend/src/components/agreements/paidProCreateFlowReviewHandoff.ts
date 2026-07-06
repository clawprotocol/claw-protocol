/**
 * Paid /app/create handoff: after pipeline freeze acceptance, establish review authority
 * from the latched substantive corpus — never the short starter preview.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  establishAcceptedPremiumCanonicalCorpus,
  isAcceptedPremiumCanonicalEstablished,
} from "./acceptedPremiumCanonicalCorpus";
import { commitPaidProAcceptanceStorageHygiene } from "./paidProAcceptanceRouting";
import {
  getLatchedAcceptedServerFullDraftAuthority,
  latchAcceptedServerFullDraftAuthority,
} from "./premiumAcceptancePolicy";
import { hasPaidProPipelineSessionAcceptance } from "./paidProPostAcceptanceValidatorCache";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";
import { readPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import { resolveCreateFlowAcceptedPipelineCorpusPlain } from "./paidProAcceptanceRouting";
import { hasPaidCreateFlowPipelineAcceptance } from "./paidCreateFlowPipelineAcceptanceProbe";

export {
  hasAcceptedPaidCreateFlowFreezeLatch,
  hasPaidCreateFlowPipelineAcceptance,
  resolveCreateFlowWorkspaceProEntitled,
  resolveWorkspaceProSubscriptionEntitled,
  shouldBlockFreeStarterReviewSurfaces,
} from "./authoritativeCreateFlowReviewShell";

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

/** Paid accepted /app/create must persist via review-first handoff (bypasses free draft cap). */
export function shouldUsePaidCreateFlowReviewFirstPersist(args?: {
  pipelineWinningBody?: string | null;
  hydratedPremiumBody?: string | null;
  agreementDocumentText?: string;
  draft?: ParsedDraftShape | null;
}): boolean {
  if (hasPaidCreateFlowPipelineAcceptance()) return true;
  const corpusPlain = resolveCreateFlowAcceptedPipelineCorpusPlain({
    draft: args?.draft ?? null,
    agreementDocumentText: args?.agreementDocumentText,
    pipelineWinningBody: args?.pipelineWinningBody,
    hydratedPremiumBody: args?.hydratedPremiumBody,
  }).trim();
  if (corpusPlain.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  if (hasPaidProPipelineSessionAcceptance({ text: corpusPlain, source: "server_full_draft" })) {
    return true;
  }
  if (readPremiumCompletionSnapshot()?.premiumAccepted === true) return true;
  return false;
}

/** Merge accepted paid corpus onto draft before POST /api/agreements/draft. */
export function mergeDraftForPaidCreateFlowPersist(
  draft: ParsedDraftShape,
  corpusPlain: string,
): ParsedDraftShape {
  const body = corpusPlain.trim();
  if (body.length < PAID_PRO_AUTHORITY_MIN_LEN) return draft;
  return {
    ...draft,
    premium_full_document_text: body,
    premium_server_full_document_text: body,
    purpose: body,
  };
}

/** Longest substantive paid corpus for create-flow review — validated pipeline only. */
export function resolveCreateFlowPaidAcceptedCorpusPlain(args: {
  winningBody?: string | null;
  snapshotPlain?: string | null;
  draft?: ParsedDraftShape | null;
  agreementDocumentText?: string;
  pipelineWinningBody?: string | null;
  hydratedPremiumBody?: string | null;
  premiumDeliverablePlain?: string | null;
}): string {
  const pipeline = resolveCreateFlowAcceptedPipelineCorpusPlain({
    draft: args.draft ?? null,
    agreementDocumentText: args.agreementDocumentText,
    pipelineWinningBody: args.pipelineWinningBody,
    hydratedPremiumBody: args.hydratedPremiumBody,
  });
  if (pipeline.length >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) return pipeline;
  return pipeline;
}

/** Accepted paid create-flow must not surface draft-limit / network-recoverable dead-ends. */
export function shouldSuppressPremiumNetworkRecoverableForPaidCreateFlow(args?: {
  pipelineWinningBody?: string | null;
  hydratedPremiumBody?: string | null;
  agreementDocumentText?: string;
  draft?: ParsedDraftShape | null;
}): boolean {
  if (!hasPaidCreateFlowPipelineAcceptance()) return false;
  const corpusLen = resolveCreateFlowAcceptedPipelineCorpusPlain({
    draft: args?.draft ?? null,
    agreementDocumentText: args?.agreementDocumentText,
    pipelineWinningBody: args?.pipelineWinningBody,
    hydratedPremiumBody: args?.hydratedPremiumBody,
  }).length;
  return corpusLen >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN;
}

/** Non-fatal persist failure when paid create-flow already has accepted corpus. */
export function shouldRecoverPaidCreateFlowFromPersistFailure(args: {
  corpusPlain?: string | null;
  paidCheckoutCompleted?: boolean;
}): boolean {
  if (args.paidCheckoutCompleted) return true;
  if (!hasPaidCreateFlowPipelineAcceptance()) return false;
  const corpus = (args.corpusPlain ?? "").trim();
  if (corpus.length >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) return true;
  return false;
}
