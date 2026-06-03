/**
 * Paid Pro pipeline timing — one compact waterfall per run, not scattered timing logs.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import {
  paidProPerfTraceEnabled,
  paidProVerboseDetailLogsEnabled,
} from "./paidProPerfLogging";
import {
  markPaidProCheckoutWaterfallEmitted,
  readPaidProCheckoutMilestonesForWaterfall,
  readPaidProCheckoutWaterfallEmittedSession,
  setPaidProQaTraceSessionGenerationId,
} from "./paidProQaPerfTrace";
import { shortIdForPremiumLog } from "./premiumSessionDiagnostics";
import { emitPaidProGenerationLatencyDiagnostics } from "./paidProGenerationLatencyDiagnostics";

export type PaidProPerformanceSpanName =
  | "parse_draft"
  | "client_preflight_preview"
  | "post_accept_commit_render"
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

/** E2E payment → first review milestones (instrumentation). */
export type PaidProE2ePhaseName =
  | "checkout_return_detected"
  | "premium_completion_started"
  | "frontend_request_assembled"
  | "premium_http_fetch_started"
  | "frontend_response_received"
  | "frontend_parse_normalize"
  | "frontend_client_gates"
  | "authoritative_commit"
  | "review_surface_visible"
  | "backend_request_received"
  | "backend_context_assembly"
  | "backend_llm_primary"
  | "backend_llm_repair"
  | "backend_llm_sanitized_retry"
  | "backend_parse_normalize"
  | "backend_validation"
  | "backend_response_packaging";

export type PaidProPerformanceSpanNameOrE2e = PaidProPerformanceSpanName | PaidProE2ePhaseName;

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
  name: PaidProPerformanceSpanNameOrE2e;
  startMs: number;
  endMs: number;
  durationMs: number;
  docLen?: number;
  docHash?: string;
  outcome?: string;
  failureCode?: string;
  meta?: PaidProPerformanceSpanMeta;
};

export type PaidProServerTimingSpanWire = {
  name: string;
  startMs: number;
  durationMs: number;
  [key: string]: string | number | boolean | null | undefined;
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
  deferFinish?: boolean;
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

/** Legacy compact waterfall when checkout QA waterfall did not emit. */
function shouldEmitLegacyPaidProWaterfall(): boolean {
  return paidProPerfTraceEnabled();
}

export function startPaidProPerformanceTrace(args: {
  traceId: string;
  sessionGenerationId?: string | null;
  intakeFingerprint: string;
  deferFinish?: boolean;
}): PaidProPerformanceTrace {
  activeTrace = {
    traceId: args.traceId,
    sessionGenerationId: args.sessionGenerationId ?? null,
    intakeFingerprint: args.intakeFingerprint,
    startedAtMs: nowMs(),
    deferFinish: args.deferFinish ?? false,
    spans: [],
  };
  setPaidProQaTraceSessionGenerationId(args.sessionGenerationId ?? args.traceId);
  openSpanStarts.clear();
  return activeTrace;
}

export function ensurePaidProPerformanceTrace(args: {
  traceId: string;
  sessionGenerationId?: string | null;
  intakeFingerprint: string;
  deferFinish?: boolean;
}): PaidProPerformanceTrace {
  if (activeTrace) return activeTrace;
  return startPaidProPerformanceTrace(args);
}

export function readActivePaidProPerformanceTrace(): PaidProPerformanceTrace | null {
  return activeTrace;
}

export function clearPaidProPerformanceTrace(): void {
  activeTrace = null;
  setPaidProQaTraceSessionGenerationId(null);
  openSpanStarts.clear();
}

function spanDurationByName(spans: PaidProWaterfallSpanSummary[], name: string): number {
  return spans.find((s) => s.name === name)?.durationMs ?? 0;
}

function emitPaidProCheckoutWaterfallIfReady(trace: PaidProPerformanceTrace, totalMs: number): boolean {
  if (!paidProPerfTraceEnabled()) return false;
  const sessionId = (trace.sessionGenerationId ?? trace.traceId).trim();
  if (!sessionId) return false;
  if (readPaidProCheckoutWaterfallEmittedSession() === sessionId) return false;

  const milestones = readPaidProCheckoutMilestonesForWaterfall();
  const spanSummaries = trace.spans.map(flattenPaidProWaterfallSpan);
  const topContributors = [...spanSummaries]
    .filter((s) => s.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5)
    .map((s) => ({ name: s.name, durationMs: s.durationMs }));
  const serverRoundTripMs =
    milestones.premiumRequestStartAt != null && milestones.premiumHttpEndAt != null
      ? milestones.premiumHttpEndAt - milestones.premiumRequestStartAt
      : spanDurationByName(spanSummaries, "premium_full_draft_api") ||
        spanDurationByName(spanSummaries, "frontend_response_received");
  const localPostProcessingMs =
    milestones.premiumHttpEndAt != null && milestones.localPostProcessingEndAt != null
      ? milestones.localPostProcessingEndAt - milestones.premiumHttpEndAt
      : spanDurationByName(spanSummaries, "premium_local_pre_processing");
  const checkoutReturnAt = milestones.checkoutReturnAt;
  const firstReviewPaintAt = milestones.firstReviewPaintAt;
  const totalPaymentToReviewMs =
    checkoutReturnAt != null && firstReviewPaintAt != null
      ? firstReviewPaintAt - checkoutReturnAt
      : totalMs;

  markPaidProCheckoutWaterfallEmitted(sessionId);
  emitPremiumGenerationAttribution(trace, spanSummaries, totalMs);
  emitPaidProGenerationLatencyDiagnostics(trace);

  // eslint-disable-next-line no-console
  console.info("[paid-pro-waterfall]", {
    traceId: trace.traceId,
    sessionGenerationId: trace.sessionGenerationId,
    sessionGenerationIdShort: shortIdForPremiumLog(trace.sessionGenerationId),
    intakeFingerprint: trace.intakeFingerprint,
    checkoutReturnAt,
    premiumRequestStartAt: milestones.premiumRequestStartAt,
    premiumHttpEndAt: milestones.premiumHttpEndAt,
    serverRoundTripMs,
    localPostProcessingMs,
    firstReviewPaintAt,
    totalPaymentToReviewMs,
    totalMs,
    topContributors,
    ...(milestones.lastServerTimingHeader
      ? { backendServerTimingHeader: milestones.lastServerTimingHeader }
      : {}),
    ...(milestones.lastBackendSpans.length
      ? { backendServerTimingSpans: milestones.lastBackendSpans }
      : {}),
    ...(milestones.serverTimingHeaderObserved && !milestones.serverTimingHeaderPresent
      ? { backendServerTimingHeaderMissing: true }
      : {}),
    spanCount: spanSummaries.length,
    spans: spanSummaries,
  });
  return true;
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
  name: PaidProPerformanceSpanNameOrE2e,
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

export function paidProPerfRecordE2ePhase(
  phase: PaidProE2ePhaseName,
  meta?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!activeTrace) return;
  paidProPerfRecordInstant(phase, 0, {
    extra: meta as PaidProPerformanceSpanMeta | undefined,
  });
}

export function ingestPaidProServerTimingSpans(spans: PaidProServerTimingSpanWire[]): void {
  if (!activeTrace || spans.length === 0) return;
  for (const s of spans) {
    const name = (s.name || "").trim();
    if (!name) continue;
    activeTrace.spans.push({
      name: name as PaidProE2ePhaseName,
      startMs: Math.round(Number(s.startMs) || 0),
      endMs: Math.round(Number(s.startMs) || 0) + Math.round(Number(s.durationMs) || 0),
      durationMs: Math.round(Number(s.durationMs) || 0),
      meta: Object.fromEntries(
        Object.entries(s).filter(([k]) => !["name", "startMs", "durationMs"].includes(k)),
      ) as PaidProPerformanceSpanMeta,
    });
  }
  activeTrace.spans.sort((a, b) => a.startMs - b.startMs || a.durationMs - b.durationMs);
}

const DUPLICATE_WATCH_SPANS: PaidProPerformanceSpanName[] = [
  "parse_draft",
  "client_preflight_preview",
  "structure_repair",
  "enterprise_polish",
  "placeholder_gate",
  "premium_local_pre_processing",
];

const ATTRIBUTION_BUCKET_SPANS: Array<{
  bucket: "parse_draft" | "premium_full_draft_http" | "client_preflight" | "post_accept_render";
  spanNames: string[];
}> = [
  { bucket: "parse_draft", spanNames: ["parse_draft"] },
  { bucket: "premium_full_draft_http", spanNames: ["premium_full_draft_api", "server_model"] },
  {
    bucket: "client_preflight",
    spanNames: [
      "client_preflight_preview",
      "intake_classification",
      "premium_local_pre_processing",
      "enterprise_polish",
      "structure_repair",
      "placeholder_gate",
      "integrity_repair",
    ],
  },
  {
    bucket: "post_accept_render",
    spanNames: [
      "post_accept_commit_render",
      "authoritative_commit",
      "sot_establishment",
      "final_review_render_plain",
      "html_render",
    ],
  },
];

function sumAttributionMs(spans: PaidProWaterfallSpanSummary[], names: string[]): number {
  let total = 0;
  for (const s of spans) {
    if (names.includes(s.name)) total += s.durationMs;
  }
  return total;
}

function emitPremiumGenerationAttribution(
  trace: PaidProPerformanceTrace,
  spanSummaries: PaidProWaterfallSpanSummary[],
  totalMs: number,
): void {
  if (!paidProPerfTraceEnabled()) return;
  const buckets = Object.fromEntries(
    ATTRIBUTION_BUCKET_SPANS.map(({ bucket, spanNames }) => [
      bucket,
      sumAttributionMs(spanSummaries, spanNames),
    ]),
  ) as Record<string, number>;
  const unattributedMs = Math.max(
    0,
    totalMs -
      (buckets.parse_draft ?? 0) -
      (buckets.premium_full_draft_http ?? 0) -
      (buckets.client_preflight ?? 0) -
      (buckets.post_accept_render ?? 0),
  );
  // eslint-disable-next-line no-console
  console.info("[premium-generation-attribution]", {
    traceId: trace.traceId,
    sessionGenerationId: trace.sessionGenerationId,
    intakeFingerprint: trace.intakeFingerprint,
    totalMs,
    ...buckets,
    unattributedMs,
  });
}

function buildWaterfallSummary(spans: PaidProWaterfallSpanSummary[]): {
  topContributors: Array<{ name: string; durationMs: number }>;
  duplicateSpanWarnings: string[];
} {
  const byName = new Map<string, number>();
  for (const s of spans) {
    byName.set(s.name, (byName.get(s.name) ?? 0) + 1);
  }
  const duplicateSpanWarnings = [...byName.entries()]
    .filter(([name, count]) => count > 1 && DUPLICATE_WATCH_SPANS.includes(name as PaidProPerformanceSpanName))
    .map(([name, count]) => `${name}x${count}`);
  const topContributors = [...spans]
    .filter((s) => s.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5)
    .map((s) => ({ name: s.name, durationMs: s.durationMs }));
  return { topContributors, duplicateSpanWarnings };
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
  const { topContributors, duplicateSpanWarnings } = buildWaterfallSummary(spanSummaries);
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") {
    lastFinishedTrace = {
      ...trace,
      spans: trace.spans.map((s) => ({ ...s })),
    };
  }
  const emittedCheckoutWaterfall = emitPaidProCheckoutWaterfallIfReady(trace, totalMs);
  if (!emittedCheckoutWaterfall && shouldEmitLegacyPaidProWaterfall()) {
    emitPremiumGenerationAttribution(trace, spanSummaries, totalMs);
    // eslint-disable-next-line no-console
    console.info("[paid-pro-waterfall]", {
      traceId: trace.traceId,
      sessionGenerationId: trace.sessionGenerationId,
      intakeFingerprint: trace.intakeFingerprint,
      totalMs,
      spanCount: spanSummaries.length,
      topContributors,
      ...(duplicateSpanWarnings.length ? { duplicateSpanWarnings } : {}),
      spans: spanSummaries,
    });
  }
  if (paidProVerboseDetailLogsEnabled()) {
    // eslint-disable-next-line no-console
    console.debug("[paid-pro-waterfall-verbose]", {
      traceId: trace.traceId,
      sessionGenerationId: trace.sessionGenerationId,
      intakeFingerprint: trace.intakeFingerprint,
      totalMs,
      topContributors,
      spans: spanSummaries,
    });
  }
  clearPaidProPerformanceTrace();
  paidProPerfResetScanCounters(trace.traceId);
}
