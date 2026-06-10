/**
 * Resolve the agreement body used when finalizing paid Pro signer metadata.
 * Stale starter-tier frozen canonical must never override an established Pro SoT
 * (e.g. premium_network_local_recovery after CORS/network failure).
 */

import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { countBlankSignerMetadataLinesInExecutionBlock } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

export type PaidProSignerFinalizeRawCorpusSource =
  | "paid_pro_source_of_truth"
  | "frozen_canonical_pro"
  | "frozen_canonical_starter"
  | "authoritative_paid_pro_review_plain"
  | "simple_pro_final_review"
  | "none";

export type PaidProSignerFinalizeRawCorpusResolution = {
  corpus: string;
  source: PaidProSignerFinalizeRawCorpusSource;
};

function hasWitnessBlock(text: string): boolean {
  return /\bIN WITNESS WHEREOF\b/i.test(text || "");
}

function scoreFinalizeCandidate(text: string, tier: "starter" | "pro" | null): number {
  const body = (text || "").trim();
  if (body.length < 80) return -1;
  let score = body.length;
  if (tier === "pro") score += 50_000;
  if (hasWitnessBlock(body)) score += 10_000;
  if (body.length >= PAID_PRO_AUTHORITY_MIN_LEN) score += 5_000;
  score -= countBlankSignerMetadataLinesInExecutionBlock(body) * 500;
  return score;
}

export function resolvePaidProSignerFinalizeRawCorpus(args?: {
  authoritativePaidProReviewPlain?: string | null;
  simpleProFinalReviewPlain?: string | null;
}): PaidProSignerFinalizeRawCorpusResolution {
  const frozen = getFrozenCanonicalAgreementCorpus();
  const frozenText = frozen?.canonicalText?.trim() ?? "";
  const frozenTier = frozen?.tier ?? null;
  const sotText = hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText().trim() : "";
  const reviewPlain = (args?.authoritativePaidProReviewPlain || "").trim();
  const simplePlain = (args?.simpleProFinalReviewPlain || "").trim();

  const candidates: Array<{
    corpus: string;
    source: PaidProSignerFinalizeRawCorpusSource;
    tier: "starter" | "pro" | null;
  }> = [];

  if (sotText.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    candidates.push({ corpus: sotText, source: "paid_pro_source_of_truth", tier: "pro" });
  } else if (sotText.length >= 80) {
    candidates.push({ corpus: sotText, source: "paid_pro_source_of_truth", tier: "pro" });
  }

  if (frozenText.length >= 80) {
    candidates.push({
      corpus: frozenText,
      source: frozenTier === "starter" ? "frozen_canonical_starter" : "frozen_canonical_pro",
      tier: frozenTier,
    });
  }

  if (reviewPlain.length >= 80) {
    candidates.push({
      corpus: reviewPlain,
      source: "authoritative_paid_pro_review_plain",
      tier: "pro",
    });
  }

  if (simplePlain.length >= 80) {
    candidates.push({
      corpus: simplePlain,
      source: "simple_pro_final_review",
      tier: null,
    });
  }

  if (candidates.length === 0) {
    return { corpus: "", source: "none" };
  }

  // Pro SoT always wins over a stale starter freeze when both exist.
  if (
    sotText.length >= PAID_PRO_AUTHORITY_MIN_LEN &&
    frozenTier === "starter" &&
    frozenText.length > 0 &&
    frozenText !== sotText
  ) {
    return { corpus: sotText, source: "paid_pro_source_of_truth" };
  }

  const best = candidates.reduce((winner, candidate) => {
    const winnerScore = scoreFinalizeCandidate(winner.corpus, winner.tier);
    const candidateScore = scoreFinalizeCandidate(candidate.corpus, candidate.tier);
    if (candidateScore > winnerScore) return candidate;
    if (candidateScore < winnerScore) return winner;
    if (candidate.source === "paid_pro_source_of_truth") return candidate;
    return winner;
  });

  return { corpus: best.corpus, source: best.source };
}
