/**
 * End-to-end payment → first Pro review timing (instrumentation only).
 */

import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  finishPaidProPerformanceWaterfall,
  ingestPaidProServerTimingSpans,
  paidProPerfRecordE2ePhase,
  readActivePaidProPerformanceTrace,
  startPaidProPerformanceTrace,
  type PaidProE2ePhaseName,
} from "./paidProPerformanceTrace";
import { paidProPerfTraceEnabled } from "./paidProPerfLogging";

export function beginPaidProPaymentToReviewTrace(args: {
  traceId: string;
  sessionGenerationId?: string | null;
  intakeFingerprint?: string | null;
  intakeText?: string | null;
}): void {
  if (!paidProPerfTraceEnabled() && import.meta.env.MODE !== "test") return;
  const fp =
    (args.intakeFingerprint || "").trim() ||
    (args.intakeText ? shortIntakeFingerprint(args.intakeText) : "") ||
    "unknown";
  startPaidProPerformanceTrace({
    traceId: args.traceId,
    sessionGenerationId: args.sessionGenerationId ?? args.traceId,
    intakeFingerprint: fp,
    deferFinish: true,
  });
  paidProPerfRecordE2ePhase("checkout_return_detected");
}

export function recordPaidProPaymentToReviewPhase(
  phase: PaidProE2ePhaseName,
  meta?: Record<string, string | number | boolean | null | undefined>,
): void {
  paidProPerfRecordE2ePhase(phase, meta);
}

export function ingestPaidProPaymentToReviewServerTiming(headerValue: string | null | undefined): void {
  if (!headerValue?.trim()) return;
  try {
    const parsed = JSON.parse(headerValue) as { spans?: unknown[] };
    if (Array.isArray(parsed.spans)) {
      ingestPaidProServerTimingSpans(parsed.spans as Parameters<typeof ingestPaidProServerTimingSpans>[0]);
    }
  } catch {
    /* ignore malformed timing header */
  }
}

export function completePaidProPaymentToReviewTrace(meta?: {
  renderSource?: string | null;
}): void {
  const trace = readActivePaidProPerformanceTrace();
  if (!trace?.deferFinish) {
    if (trace) finishPaidProPerformanceWaterfall();
    return;
  }
  paidProPerfRecordE2ePhase("review_surface_visible", {
    renderSource: meta?.renderSource ?? undefined,
  });
  finishPaidProPerformanceWaterfall();
}
