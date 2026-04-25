import type { LawdogProofActivityV1 } from "./proofActivityStore";
import { proofActivityCounts } from "./proofActivityStore";

/**
 * Proof Score — simple, earned, aligned with agreement outcomes (local launch model).
 *
 * - 10 points per agreement sent (handoff completed in product)
 * - 25 points per fully signed agreement
 * - Completion-quality bonus from share of sent agreements that reached fully signed:
 *   - below 25% → +0
 *   - 25%–49% → +5
 *   - 50%–74% → +15
 *   - 75%+ → +30
 *
 * Completion rate = (fully signed count) / (sent count) when sent ≥ 1; otherwise bonus 0.
 * Capped at 999 for display.
 */
export type ProofScoreBreakdown = {
  score: number;
  from_sent: number;
  from_finalized: number;
  from_completion_bonus: number;
  /** 0–100 when sent ≥ 1; otherwise 0. */
  completion_rate_pct: number;
  summary: string;
};

const CAP = 999;
const W_SENT = 10;
const W_FIN = 25;

export function completionRateFraction(sent: number, finalized: number): number {
  if (sent <= 0) return 0;
  return Math.min(1, finalized / sent);
}

export function completionQualityBonusPoints(rate: number): number {
  if (rate < 0.25) return 0;
  if (rate < 0.5) return 5;
  if (rate < 0.75) return 15;
  return 30;
}

export function computeProofScore(activity: LawdogProofActivityV1): ProofScoreBreakdown {
  const { sent, finalized } = proofActivityCounts(activity);
  const from_sent = Math.min(CAP, sent * W_SENT);
  const from_finalized = Math.min(CAP, finalized * W_FIN);
  const rate = completionRateFraction(sent, finalized);
  const from_completion_bonus = completionQualityBonusPoints(rate);
  const completion_rate_pct = sent <= 0 ? 0 : Math.round(rate * 100);
  let score = Math.min(CAP, from_sent + from_finalized + from_completion_bonus);

  const summary =
    sent <= 0
      ? "Send your first agreement to start your Proof Score — sends and signatures both count."
      : `${sent} sent · ${finalized} fully signed (${completion_rate_pct}% completion) · +${from_completion_bonus} finish bonus.`;

  return {
    score,
    from_sent,
    from_finalized,
    from_completion_bonus,
    completion_rate_pct,
    summary,
  };
}
