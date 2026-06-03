/**
 * Paid Pro checkout → review latency diagnostics (console instrumentation only).
 */

import { paidProPerfTraceEnabled } from "./paidProPerfLogging";
import { readPremiumNetworkCallRecords } from "./paidProPremiumGenerationCallAudit";
import { readPaidProCheckoutMilestonesForWaterfall } from "./paidProQaPerfTrace";
import { shortIdForPremiumLog } from "./premiumSessionDiagnostics";
import type { PaidProPerformanceTrace } from "./paidProPerformanceTrace";

export type PaidProPremiumHttpLatencyMeta = {
  retryCount: number;
  firstAttemptFailed: boolean;
  retryDelayMsTotal: number;
  fetchTimeoutMs: number | null;
};

let premiumHttpLatencyMeta: PaidProPremiumHttpLatencyMeta = {
  retryCount: 0,
  firstAttemptFailed: false,
  retryDelayMsTotal: 0,
  fetchTimeoutMs: null,
};

let finalDisplayedRenderSource: string | null = null;

export function resetPaidProPremiumHttpLatencyMetaForTests(): void {
  premiumHttpLatencyMeta = {
    retryCount: 0,
    firstAttemptFailed: false,
    retryDelayMsTotal: 0,
    fetchTimeoutMs: null,
  };
  finalDisplayedRenderSource = null;
}

export function recordPaidProPremiumHttpFetchTimeoutMs(ms: number): void {
  if (!paidProPerfTraceEnabled()) return;
  premiumHttpLatencyMeta.fetchTimeoutMs = ms;
}

export function recordPaidProPremiumHttpRetryDelayMs(delayMs: number): void {
  if (!paidProPerfTraceEnabled()) return;
  premiumHttpLatencyMeta.retryDelayMsTotal += Math.max(0, Math.round(delayMs));
}

export function markPaidProPremiumHttpFirstAttemptFailed(): void {
  if (!paidProPerfTraceEnabled()) return;
  premiumHttpLatencyMeta.firstAttemptFailed = true;
}

export function incrementPaidProPremiumHttpRetryCount(): void {
  if (!paidProPerfTraceEnabled()) return;
  premiumHttpLatencyMeta.retryCount += 1;
}

export function markPaidProFinalDisplayedRenderSource(source: string | null | undefined): void {
  if (!paidProPerfTraceEnabled()) return;
  const s = (source || "").trim();
  if (s) finalDisplayedRenderSource = s;
}

function isoAt(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

/** Single QA-friendly latency row after checkout waterfall completes. */
export function emitPaidProGenerationLatencyDiagnostics(trace: PaidProPerformanceTrace): void {
  if (!paidProPerfTraceEnabled()) return;
  const milestones = readPaidProCheckoutMilestonesForWaterfall();
  const networkCalls = readPremiumNetworkCallRecords();
  const checkoutReturnAt = milestones.checkoutReturnAt;
  const premiumRequestStartAt = milestones.premiumRequestStartAt;
  const premiumHttpEndAt = milestones.premiumHttpEndAt;
  const firstReviewPaintAt = milestones.firstReviewPaintAt;

  const totalRequestDurationMs =
    premiumRequestStartAt != null && premiumHttpEndAt != null
      ? premiumHttpEndAt - premiumRequestStartAt
      : null;
  const paymentToReviewMountedMs =
    checkoutReturnAt != null && firstReviewPaintAt != null
      ? firstReviewPaintAt - checkoutReturnAt
      : null;
  const paymentToFirstRequestStartMs =
    checkoutReturnAt != null && premiumRequestStartAt != null
      ? premiumRequestStartAt - checkoutReturnAt
      : null;

  const firstNetwork = networkCalls[0];
  const lastNetwork = networkCalls[networkCalls.length - 1];
  const firstSucceeded =
    networkCalls.length > 0
      ? (lastNetwork?.generationOutcome || "").trim() !== "" &&
        !(lastNetwork?.failureCode || "").trim()
      : premiumHttpEndAt != null && !premiumHttpLatencyMeta.firstAttemptFailed;

  const payload = {
    traceId: trace.traceId,
    sessionGenerationIdShort: shortIdForPremiumLog(trace.sessionGenerationId),
    paymentReturnAt: checkoutReturnAt,
    paymentReturnAtIso: isoAt(checkoutReturnAt),
    firstPremiumRequestStartAt: premiumRequestStartAt,
    firstPremiumRequestStartAtIso: isoAt(premiumRequestStartAt),
    firstPremiumResponseAt: premiumHttpEndAt,
    firstPremiumResponseAtIso: isoAt(premiumHttpEndAt),
    reviewYourProAgreementMountedAt: firstReviewPaintAt,
    reviewYourProAgreementMountedAtIso: isoAt(firstReviewPaintAt),
    paymentToFirstRequestStartMs,
    totalPremiumRequestDurationMs: totalRequestDurationMs,
    paymentToReviewMountedMs,
    premiumHttpRetryCount: premiumHttpLatencyMeta.retryCount,
    premiumHttpRetryDelayMsTotal: premiumHttpLatencyMeta.retryDelayMsTotal,
    premiumHttpFetchTimeoutMs: premiumHttpLatencyMeta.fetchTimeoutMs,
    firstPremiumRequestFailed: premiumHttpLatencyMeta.firstAttemptFailed,
    firstPremiumRequestSucceeded: !premiumHttpLatencyMeta.firstAttemptFailed || firstSucceeded,
    premiumNetworkCallCount: networkCalls.length,
    lastPremiumNetworkCallReason: lastNetwork?.reason ?? firstNetwork?.reason ?? null,
    finalDisplayedRenderSource: finalDisplayedRenderSource,
    localPostProcessingMs:
      premiumHttpEndAt != null && milestones.localPostProcessingEndAt != null
        ? milestones.localPostProcessingEndAt - premiumHttpEndAt
        : null,
  };

  // eslint-disable-next-line no-console
  console.info("[paid-pro-generation-latency]", payload);
}
