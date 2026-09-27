/**
 * Entitled named-2p dump→create: after premium-full-draft HTTP 200 with a
 * commercially usable body, Review must paint the corpus even when snapshot
 * prepare / canonical SoT fail-open or shorter-than-accepted churn fires.
 *
 * Live hole (tip 92d36760): pfd 200 + usable Northline body still left
 * blank/hollow (bodyLen 0) or Apply-revision / "Building your Pro agreement"
 * because fail-open called establishPaidProSourceOfTruth before paint, and
 * Review force-render reads session/pipeline authority — not agreementDocumentText.
 */

import { commitAcceptedPaidProCorpusHandoffSync } from "./enterCanonicalPaidProReviewFlow";
import {
  isCommerciallyUsableCreateReviewCorpus,
  pickCreateReviewSettleCorpus,
} from "./multiPartyCreateReviewSettle";
import { hasCanonicalReviewCorpusForRender } from "./paidProDocumentBodyRouter";
import { ensurePaidProReviewSessionAuthorityFromVisibleCorpus } from "./paidProReviewSessionAuthority";

const FAIL_OPEN_AUTHORITATIVE_SOURCES = new Set([
  "server_full_draft",
  "server_full_draft_retry",
  "server_full_draft_degraded",
  "snapshot_server_full_draft",
]);

export function remapEntitledRewriteFailOpenPipelineSource(source?: string | null): string {
  const s = String(source || "").trim();
  if (FAIL_OPEN_AUTHORITATIVE_SOURCES.has(s)) return s;
  return "server_full_draft_degraded";
}

export type EntitledRewriteFailOpenReviewMountPlan = {
  paintReview: boolean;
  corpus: string;
  qualityRetry: false;
  clearDocument: false;
  latchRenderAuthority: boolean;
  trySotAfterPaint: boolean;
  displayPhase: "review";
};

const NO_PAINT: EntitledRewriteFailOpenReviewMountPlan = {
  paintReview: false,
  corpus: "",
  qualityRetry: false,
  clearDocument: false,
  latchRenderAuthority: false,
  trySotAfterPaint: false,
  displayPhase: "review",
};

/**
 * Policy: usable pfd corpus always remounts Review. Snapshot / canonical / SoT
 * fail-open and shorter-than-accepted churn must not quality-retry or clear.
 * Empty / non-commercial bodies are left to the existing fail-closed helpers
 * (too_much / money_vibe — out of scope).
 */
export function planEntitledRewriteFailOpenReviewMount(input: {
  commerciallyUsableCorpus?: string | null;
  winningPremiumBodyText?: string | null;
  premiumRenderSource?: string | null;
  acceptedAuthoritativePlain?: string | null;
  lastCommerciallyUsableCandidate?: string | null;
  snapshotPrepareFailed?: boolean;
  canonicalBlocked?: boolean;
  sotEstablishFailed?: boolean;
  shorterThanAcceptedChurn?: boolean;
}): EntitledRewriteFailOpenReviewMountPlan {
  const corpus = pickCreateReviewSettleCorpus({
    winningPremiumBodyText: input.winningPremiumBodyText || input.commerciallyUsableCorpus,
    premiumRenderSource: input.premiumRenderSource || "server_full_draft",
    acceptedAuthoritativePlain: input.acceptedAuthoritativePlain,
    lastCommerciallyUsableCandidate:
      input.lastCommerciallyUsableCandidate || input.commerciallyUsableCorpus,
  });
  const usable =
    Boolean(corpus) || isCommerciallyUsableCreateReviewCorpus(input.commerciallyUsableCorpus);
  if (!usable) return NO_PAINT;
  const painted =
    corpus ||
    String(input.commerciallyUsableCorpus || input.lastCommerciallyUsableCandidate || "").trim();
  if (!painted) return NO_PAINT;
  return {
    paintReview: true,
    corpus: painted,
    qualityRetry: false,
    clearDocument: false,
    latchRenderAuthority: true,
    trySotAfterPaint: true,
    displayPhase: "review",
  };
}

export type LatchEntitledRewriteFailOpenReviewAuthorityResult = {
  latched: boolean;
  corpus: string;
  hasRenderAuthority: boolean;
};

/**
 * Latch pipeline-accepted + review-session authority so the document router
 * force-paints without SoT / GET / canonical entry. Idempotent.
 */
export function latchEntitledRewriteFailOpenReviewAuthority(args: {
  corpusPlain: string;
  pipelineSource?: string | null;
  agreementId?: string | null;
  reviewSessionId?: string | null;
}): LatchEntitledRewriteFailOpenReviewAuthorityResult {
  const corpus = String(args.corpusPlain || "").trim();
  if (!corpus || (!isCommerciallyUsableCreateReviewCorpus(corpus) && corpus.length < 1500)) {
    return { latched: false, corpus: "", hasRenderAuthority: false };
  }
  const pipelineSource = remapEntitledRewriteFailOpenPipelineSource(args.pipelineSource);
  commitAcceptedPaidProCorpusHandoffSync({
    corpusPlain: corpus,
    pipelineSource,
  });
  ensurePaidProReviewSessionAuthorityFromVisibleCorpus({
    corpusPlain: corpus,
    source: pipelineSource,
    agreementId: args.agreementId,
    reviewSessionId: args.reviewSessionId,
  });
  return {
    latched: true,
    corpus,
    hasRenderAuthority: hasCanonicalReviewCorpusForRender(),
  };
}

export const ENTITLED_REWRITE_FAIL_OPEN_REVIEW_MOUNT_HELPER =
  "planEntitledRewriteFailOpenReviewMount";
export const ENTITLED_REWRITE_FAIL_OPEN_REVIEW_LATCH_HELPER =
  "latchEntitledRewriteFailOpenReviewAuthority";
