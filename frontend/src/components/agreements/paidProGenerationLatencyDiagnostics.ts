/**
 * Paid Pro checkout → review latency diagnostics (console instrumentation only).
 */

import { paidProPerfTraceEnabled } from "./paidProPerfLogging";
import { readPremiumNetworkCallRecords } from "./paidProPremiumGenerationCallAudit";
import { readPaidProCheckoutMilestonesForWaterfall } from "./paidProQaPerfTrace";
import { shortIdForPremiumLog } from "./premiumSessionDiagnostics";
import type {
  PaidProPerformanceTrace,
  PaidProServerTimingSpanWire,
} from "./paidProPerformanceTrace";

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

const BACKEND_TIMING_SKIP_FOR_DOMINANT = new Set([
  "backend_request_total",
  "backend_request_received",
  "backend_llm_api_call_start",
]);

function resolveDominantBackendSpan(
  spans: PaidProServerTimingSpanWire[],
): { name: string; durationMs: number } | null {
  let best: { name: string; durationMs: number } | null = null;
  for (const s of spans) {
    const name = (s.name || "").trim();
    if (!name || BACKEND_TIMING_SKIP_FOR_DOMINANT.has(name)) continue;
    const durationMs = Math.max(0, Math.round(Number(s.durationMs) || 0));
    if (!best || durationMs > best.durationMs) {
      best = { name, durationMs };
    }
  }
  return best;
}

function backendTimingAttribution(
  spans: PaidProServerTimingSpanWire[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of spans) {
    const name = (s.name || "").trim();
    if (!name) continue;
    const dur = Math.max(0, Math.round(Number(s.durationMs) || 0));
    out[name] = (out[name] ?? 0) + dur;
  }
  return out;
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

  const backendSpans = milestones.lastBackendSpans ?? [];
  const dominantBackendSpan = resolveDominantBackendSpan(backendSpans);
  const backendSpanAttributionMs = backendTimingAttribution(backendSpans);

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
    backendServerTimingSpans: backendSpans,
    backendDominantSpan: dominantBackendSpan,
    backendSpanAttributionMs,
    backendLlmPrimaryMs: backendSpanAttributionMs.backend_llm_primary ?? null,
    backendPostProcessingMs: backendSpanAttributionMs.backend_post_processing ?? null,
    backendValidationMs: backendSpanAttributionMs.backend_validation ?? null,
    backendResponsePackagingMs: backendSpanAttributionMs.backend_response_packaging ?? null,
  };

  // eslint-disable-next-line no-console
  console.info("[paid-pro-generation-latency]", payload);
}
