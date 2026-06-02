/**
 * Paid Pro pipeline timing — one compact waterfall per run, not scattered timing logs.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { paidProVerboseDetailLogsEnabled } from "./paidProPerfLogging";

export type PaidProPerformanceSpanName =
  | "intake_classification"
  | "guided_question_gate"
  | "premium_local_pre_processing"
  | "premium_full_draft_api"
  | "server_model"
  | "json_parse_degraded_handling"
  | "enterprise_polish"
  | "structure_repair"
  | "placeholder_gate"
  | "integrity_repair"
  | "execution_block_authority"
  | "sot_establishment"
  | "recovery_display_authority"
  | "final_review_render_plain"
  | "html_render"
  | "vs01_eligibility";

export type PaidProPerformanceSpanMeta = {
  attempt?: number;
  requestReason?: string;
  responseBodyLen?: number;
  documentTextLen?: number;
  serverFullDocumentTextLen?: number;
  generationOutcome?: string;
  failureCode?: string;
  accepted?: boolean;
  rejectedReason?: string;
  retryReason?: string;
  [key: string]: string | number | boolean | null | undefined;
};

export type PaidProPerformanceSpan = {
  name: PaidProPerformanceSpanName;
  startMs: number;
  endMs: number;
  durationMs: number;
  docLen?: number;
  docHash?: string;
  outcome?: string;
  failureCode?: string;
  meta?: PaidProPerformanceSpanMeta;
};

export type PaidProWaterfallSpanSummary = {
  name: string;
  startMs: number;
  durationMs: number;
  attempt?: number;
  requestReason?: string;
  responseBodyLen?: number;
  documentTextLen?: number;
  serverFullDocumentTextLen?: number;
  generationOutcome?: string;
  outcome?: string;
  failureCode?: string;
  accepted?: boolean;
  rejectedReason?: string;
  retryReason?: string;
};

export type PaidProPerformanceTrace = {
  traceId: string;
  sessionGenerationId: string | null;
  intakeFingerprint: string;
  startedAtMs: number;
  spans: PaidProPerformanceSpan[];
};

let activeTrace: PaidProPerformanceTrace | null = null;
let lastFinishedTrace: PaidProPerformanceTrace | null = null;
const openSpanStarts = new Map<PaidProPerformanceSpanName, number>();

export function readLastFinishedPaidProPerformanceTrace(): PaidProPerformanceTrace | null {
  return lastFinishedTrace;
}

export function clearLastFinishedPaidProPerformanceTrace(): void {
  lastFinishedTrace = null;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** One compact waterfall per run in prod/QA; scattered span logs only when verbose. */
function shouldEmitPaidProWaterfall(): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return false;
  return true;
}

export function startPaidProPerformanceTrace(args: {
  traceId: string;
  sessionGenerationId?: string | null;
  intakeFingerprint: string;
}): PaidProPerformanceTrace {
  activeTrace = {
    traceId: args.traceId,
    sessionGenerationId: args.sessionGenerationId ?? null,
    intakeFingerprint: args.intakeFingerprint,
    startedAtMs: nowMs(),
    spans: [],
  };
  openSpanStarts.clear();
  return activeTrace;
}

export function readActivePaidProPerformanceTrace(): PaidProPerformanceTrace | null {
  return activeTrace;
}

export function clearPaidProPerformanceTrace(): void {
  activeTrace = null;
  openSpanStarts.clear();
}

export function paidProPerfSpanStart(name: PaidProPerformanceSpanName): void {
  if (!activeTrace) return;
  openSpanStarts.set(name, nowMs());
}

export function paidProPerfSpanEnd(
  name: PaidProPerformanceSpanName,
  meta?: {
    docLen?: number;
    docText?: string;
    outcome?: string;
    failureCode?: string;
    extra?: PaidProPerformanceSpanMeta;
  },
): void {
  if (!activeTrace) return;
  const start = openSpanStarts.get(name);
  if (start == null) return;
  openSpanStarts.delete(name);
  const endMs = nowMs();
  const docLen = meta?.docLen ?? (meta?.docText ? meta.docText.trim().length : undefined);
  activeTrace.spans.push({
    name,
    startMs: Math.round(start - activeTrace.startedAtMs),
    endMs: Math.round(endMs - activeTrace.startedAtMs),
    durationMs: Math.round(endMs - start),
    docLen,
    docHash: meta?.docText && docLen && docLen >= 80 ? hashPaidProCorpus(meta.docText) : undefined,
    outcome: meta?.outcome,
    failureCode: meta?.failureCode,
    meta: meta?.extra,
  });
}

export function paidProPerfRecordInstant(
  name: PaidProPerformanceSpanName,
  durationMs: number,
  meta?: {
    docLen?: number;
    docText?: string;
    outcome?: string;
    failureCode?: string;
    extra?: PaidProPerformanceSpanMeta;
  },
): void {
  if (!activeTrace) return;
  const at = nowMs() - activeTrace.startedAtMs;
  const docLen = meta?.docLen ?? (meta?.docText ? meta.docText.trim().length : undefined);
  activeTrace.spans.push({
    name,
    startMs: Math.round(at),
    endMs: Math.round(at),
    durationMs: Math.round(durationMs),
    docLen,
    docHash: meta?.docText && docLen && docLen >= 80 ? hashPaidProCorpus(meta.docText) : undefined,
    outcome: meta?.outcome,
    failureCode: meta?.failureCode,
    meta: meta?.extra,
  });
}

const scanCounters = new Map<string, number>();

function counterKey(traceId: string, scanType: string): string {
  return `${traceId}:${scanType}`;
}

export function paidProPerfIncrementScan(traceId: string, scanType: string): number {
  const key = counterKey(traceId, scanType);
  const next = (scanCounters.get(key) ?? 0) + 1;
  scanCounters.set(key, next);
  return next;
}

export function paidProPerfReadScanCount(traceId: string, scanType: string): number {
  return scanCounters.get(counterKey(traceId, scanType)) ?? 0;
}

export function paidProPerfResetScanCounters(traceId?: string): void {
  if (!traceId) {
    scanCounters.clear();
    return;
  }
  for (const key of [...scanCounters.keys()]) {
    if (key.startsWith(`${traceId}:`)) scanCounters.delete(key);
  }
}

export function flattenPaidProWaterfallSpan(s: PaidProPerformanceSpan): PaidProWaterfallSpanSummary {
  const m = s.meta ?? {};
  return {
    name: s.name,
    startMs: s.startMs,
    durationMs: s.durationMs,
    ...(m.attempt != null ? { attempt: m.attempt } : {}),
    ...(m.requestReason ? { requestReason: m.requestReason } : {}),
    ...(m.responseBodyLen != null ? { responseBodyLen: m.responseBodyLen } : {}),
    ...(m.documentTextLen != null ? { documentTextLen: m.documentTextLen } : s.docLen != null ? { documentTextLen: s.docLen } : {}),
    ...(m.serverFullDocumentTextLen != null ? { serverFullDocumentTextLen: m.serverFullDocumentTextLen } : {}),
    ...(m.generationOutcome ? { generationOutcome: m.generationOutcome } : s.outcome ? { generationOutcome: s.outcome } : {}),
    ...(s.outcome && !m.generationOutcome ? { outcome: s.outcome } : {}),
    ...(m.failureCode ? { failureCode: m.failureCode } : s.failureCode ? { failureCode: s.failureCode } : {}),
    ...(m.accepted != null ? { accepted: m.accepted } : {}),
    ...(m.rejectedReason ? { rejectedReason: m.rejectedReason } : {}),
    ...(m.retryReason ? { retryReason: m.retryReason } : {}),
  };
}

export function finishPaidProPerformanceWaterfall(): void {
  if (!activeTrace) return;
  const trace = activeTrace;
  const totalMs = Math.round(nowMs() - trace.startedAtMs);
  const spanSummaries = trace.spans.map(flattenPaidProWaterfallSpan);
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") {
    lastFinishedTrace = {
      ...trace,
      spans: trace.spans.map((s) => ({ ...s })),
    };
  }
  if (shouldEmitPaidProWaterfall()) {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-waterfall]", {
      traceId: trace.traceId,
      sessionGenerationId: trace.sessionGenerationId,
      intakeFingerprint: trace.intakeFingerprint,
      totalMs,
      spanCount: spanSummaries.length,
      spans: spanSummaries,
    });
  }
  if (paidProVerboseDetailLogsEnabled()) {
    // eslint-disable-next-line no-console
    console.debug("[paid-pro-waterfall-verbose]", { traceId: trace.traceId, totalMs, spans: spanSummaries });
  }
  clearPaidProPerformanceTrace();
  paidProPerfResetScanCounters(trace.traceId);
}
