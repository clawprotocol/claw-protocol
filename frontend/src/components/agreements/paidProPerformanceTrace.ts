/**
 * Paid Pro pipeline timing — one compact waterfall per run, not scattered timing logs.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";

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

export type PaidProPerformanceSpan = {
  name: PaidProPerformanceSpanName;
  startMs: number;
  endMs: number;
  durationMs: number;
  docLen?: number;
  docHash?: string;
  outcome?: string;
  failureCode?: string;
  meta?: Record<string, string | number | boolean | null>;
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

function paidProPerfVerboseEnabled(): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return false;
  if (typeof import.meta === "undefined") return false;
  return Boolean(import.meta.env.DEV || import.meta.env.VITE_PAID_PRO_PERF_TRACE);
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
    extra?: Record<string, string | number | boolean | null>;
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
    extra?: Record<string, string | number | boolean | null>;
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

export function finishPaidProPerformanceWaterfall(): void {
  if (!activeTrace) return;
  const trace = activeTrace;
  const totalMs = Math.round(nowMs() - trace.startedAtMs);
  const spans = trace.spans.map((s) => ({
    name: s.name,
    ms: s.durationMs,
    ...(s.docLen != null ? { docLen: s.docLen } : {}),
    ...(s.docHash ? { hash: s.docHash.slice(0, 24) } : {}),
    ...(s.outcome ? { outcome: s.outcome } : {}),
    ...(s.failureCode ? { failureCode: s.failureCode } : {}),
  }));
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
      spans,
    });
  }
  if (paidProPerfVerboseEnabled()) {
    // eslint-disable-next-line no-console
    console.debug("[paid-pro-waterfall-verbose]", { traceId: trace.traceId, totalMs, spans });
  }
  clearPaidProPerformanceTrace();
  paidProPerfResetScanCounters(trace.traceId);
}
