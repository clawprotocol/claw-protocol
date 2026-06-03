/**
 * Paid Pro post-commit review surface stability — render/recompute/scroll telemetry and dedupe.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export type PaidProReviewStabilitySnapshot = {
  reviewHash: string | null;
  renderCount: number;
  recomputeCount: number;
  scrollResetCount: number;
};

let reviewHash: string | null = null;
let renderCount = 0;
let recomputeCount = 0;
let scrollResetCount = 0;
let paymentApplyScrollResetDone = false;

const loggedGuidedFinalReviewKeys = new Set<string>();
const loggedReviewPipelineKeys = new Set<string>();
let lastGuidedProUxLogKey: string | null = null;
let lastStabilityLogKey: string | null = null;

export function resetPaidProReviewStabilityForTests(): void {
  reviewHash = null;
  renderCount = 0;
  recomputeCount = 0;
  scrollResetCount = 0;
  paymentApplyScrollResetDone = false;
  loggedGuidedFinalReviewKeys.clear();
  loggedReviewPipelineKeys.clear();
  lastGuidedProUxLogKey = null;
  lastStabilityLogKey = null;
}

export function getPaidProReviewStabilitySnapshot(): PaidProReviewStabilitySnapshot {
  return { reviewHash, renderCount, recomputeCount, scrollResetCount };
}

export function notePaidProReviewHashFromPlain(plain: string): void {
  const t = (plain || "").trim();
  if (t.length < 200) return;
  reviewHash = hashPaidProCorpus(t);
  emitPaidProReviewStabilityLog("review_hash");
}

function emitPaidProReviewStabilityLog(reason: string): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${reason}|${reviewHash ?? ""}|${renderCount}|${recomputeCount}|${scrollResetCount}`;
  if (lastStabilityLogKey === key) return;
  lastStabilityLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-review-stability]", {
    reviewHash,
    renderCount,
    recomputeCount,
    scrollResetCount,
    reason,
  });
}

/** Review shell render tick (counts only when visible review hash changes). */
export function recordPaidProReviewRender(plain: string): void {
  const t = (plain || "").trim();
  if (t.length < 200) return;
  const h = hashPaidProCorpus(t);
  if (h === reviewHash) return;
  reviewHash = h;
  renderCount += 1;
  emitPaidProReviewStabilityLog("review_render");
}

/** Expensive preview rebuild attempted (full builder path only). */
export function recordPaidProPreviewRecompute(builder: string): void {
  recomputeCount += 1;
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug("[paid-pro-preview-recompute]", { builder, recomputeCount });
  }
  emitPaidProReviewStabilityLog(`recompute:${builder}`);
}

export function resetPaidProPaymentApplyScrollResetLatch(): void {
  paymentApplyScrollResetDone = false;
}

export function shouldApplyPaidProPaymentScrollReset(): boolean {
  return !paymentApplyScrollResetDone;
}

export function markPaidProPaymentScrollResetApplied(): void {
  paymentApplyScrollResetDone = true;
  scrollResetCount += 1;
  emitPaidProReviewStabilityLog("scroll_reset");
}

export function logGuidedFinalReviewRenderStable(payload: {
  source: string;
  hash: string;
  len: number;
}): void {
  const key = `${payload.source}|${payload.hash}|${payload.len}`;
  if (loggedGuidedFinalReviewKeys.has(key)) return;
  loggedGuidedFinalReviewKeys.add(key);
  if (payload.hash && payload.hash !== reviewHash) {
    reviewHash = payload.hash;
    renderCount += 1;
    emitPaidProReviewStabilityLog("guided_final_review_render");
  }
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-render]", payload);
}

export function logReviewPipelineTelemetryOnce(
  channel: "review-handoff" | "review-gate" | "review-model",
  payload: Record<string, unknown>,
): void {
  const key = `${channel}|${JSON.stringify(payload)}`;
  if (loggedReviewPipelineKeys.has(key)) return;
  loggedReviewPipelineKeys.add(key);
  // eslint-disable-next-line no-console
  console.debug(`[${channel}]`, payload);
}

export function logGuidedProUxStateResolvedStable(
  state: string,
  phase: string,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${state}|${phase}`;
  if (lastGuidedProUxLogKey === key) return;
  lastGuidedProUxLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[guided-pro-ux-state]", { state, guidedCompletionPhase: phase });
}
