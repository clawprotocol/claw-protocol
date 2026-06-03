/**
 * QA-only Paid Pro performance trace (no corpus or UX changes).
 * Emits [premium-generation-ratio], [premium-pass-timing] when VITE_PAID_PRO_PERF_TRACE=1.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { paidProPerfTraceEnabled } from "./paidProPerfLogging";
import { shortIdForPremiumLog } from "./premiumSessionDiagnostics";
import type { PaidProServerTimingSpanWire } from "./paidProPerformanceTrace";

export type PaidProQaPassName =
  | "applyAcceptedProCorpusSafeDisplay"
  | "preparePaidProServerDocumentForAcceptance"
  | "paid-pro-placeholder-gate"
  | "premium-structure-repair"
  | "paid-pro-recital-polish"
  | "paid-pro-signature-polish"
  | "paid-pro-enterprise-polish"
  | "resolvePaidProReviewRenderPlain"
  | "buildPremiumAgreementReadonlyHtml";

export type PremiumGenerationRatioSourceField =
  | "document_text"
  | "server_full_document_text"
  | "server_repair_document_text"
  | "none";

/** @deprecated Alias for paidProPerfTraceEnabled (flag-only). */
export function paidProQaPerfTraceEnabled(): boolean {
  return paidProPerfTraceEnabled();
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function wallClockMs(): number {
  return Date.now();
}

function corpusHashForTrace(text: string): string {
  const t = (text || "").trim();
  if (!t) return "empty";
  if (t.length >= 80) return hashPaidProCorpus(t);
  return `len:${t.length}`;
}

let activeQaTraceSessionGenerationId: string | null = null;

export function setPaidProQaTraceSessionGenerationId(id: string | null | undefined): void {
  activeQaTraceSessionGenerationId = (id ?? "").trim() || null;
}

function sessionKey(): string {
  return activeQaTraceSessionGenerationId ?? "no-session";
}

const passLogDedupe = new Set<string>();
let checkoutWaterfallEmittedForSession: string | null = null;

const checkoutMilestones: {
  checkoutReturnAt: number | null;
  premiumRequestStartAt: number | null;
  premiumHttpEndAt: number | null;
  localPostProcessingEndAt: number | null;
  firstReviewPaintAt: number | null;
  lastServerTimingHeader: string | null;
  lastBackendSpans: PaidProServerTimingSpanWire[];
} = {
  checkoutReturnAt: null,
  premiumRequestStartAt: null,
  premiumHttpEndAt: null,
  localPostProcessingEndAt: null,
  firstReviewPaintAt: null,
  lastServerTimingHeader: null,
  lastBackendSpans: [],
};

export function readPaidProCheckoutMilestonesForWaterfall(): typeof checkoutMilestones {
  return {
    ...checkoutMilestones,
    lastBackendSpans: [...checkoutMilestones.lastBackendSpans],
  };
}

export function readPaidProCheckoutWaterfallEmittedSession(): string | null {
  return checkoutWaterfallEmittedForSession;
}

export function markPaidProCheckoutWaterfallEmitted(sessionId: string): void {
  checkoutWaterfallEmittedForSession = sessionId;
}

export function resetPaidProQaPerfTraceForTests(): void {
  passLogDedupe.clear();
  checkoutWaterfallEmittedForSession = null;
  activeQaTraceSessionGenerationId = null;
  checkoutMilestones.checkoutReturnAt = null;
  checkoutMilestones.premiumRequestStartAt = null;
  checkoutMilestones.premiumHttpEndAt = null;
  checkoutMilestones.localPostProcessingEndAt = null;
  checkoutMilestones.firstReviewPaintAt = null;
  checkoutMilestones.lastServerTimingHeader = null;
  checkoutMilestones.lastBackendSpans = [];
}

function shouldLogPass(passName: string, surface: string, corpusHashBefore: string): boolean {
  const key = `${sessionKey()}|${corpusHashBefore}|${passName}|${surface}`;
  if (passLogDedupe.has(key)) return false;
  passLogDedupe.add(key);
  return true;
}

function emitPremiumPassTiming(payload: {
  passName: PaidProQaPassName | string;
  surface: string;
  inputLen: number;
  outputLen: number;
  elapsedMs: number;
  corpusHashBefore: string;
  corpusHashAfter: string;
  changed: boolean;
}): void {
  if (!paidProPerfTraceEnabled()) return;
  if (!shouldLogPass(payload.passName, payload.surface, payload.corpusHashBefore)) return;
  // eslint-disable-next-line no-console
  console.info("[premium-pass-timing]", {
    passName: payload.passName,
    surface: payload.surface,
    inputLen: payload.inputLen,
    outputLen: payload.outputLen,
    elapsedMs: payload.elapsedMs,
    corpusHashBefore: payload.corpusHashBefore,
    corpusHashAfter: payload.corpusHashAfter,
    changed: payload.changed,
    sessionGenerationIdShort: shortIdForPremiumLog(sessionKey()),
  });
}

/** Time a pass that returns plain text only. */
export function tracePaidProQaPassText(
  passName: PaidProQaPassName,
  surface: string,
  inputText: string,
  run: () => string,
): string {
  if (!paidProPerfTraceEnabled()) return run();
  const hashBefore = corpusHashForTrace(inputText);
  const inputLen = (inputText || "").length;
  const started = nowMs();
  const output = run();
  const outputLen = (output || "").length;
  const hashAfter = corpusHashForTrace(output);
  emitPremiumPassTiming({
    passName,
    surface,
    inputLen,
    outputLen,
    elapsedMs: Math.round(nowMs() - started),
    corpusHashBefore: hashBefore,
    corpusHashAfter: hashAfter,
    changed: output !== inputText,
  });
  return output;
}

/** Time a pass that returns `{ text, ... }`. */
export function tracePaidProQaPassWithText<T extends { text: string }>(
  passName: PaidProQaPassName,
  surface: string,
  inputText: string,
  run: () => T,
): T {
  if (!paidProPerfTraceEnabled()) return run();
  const hashBefore = corpusHashForTrace(inputText);
  const inputLen = (inputText || "").length;
  const started = nowMs();
  const result = run();
  const outputLen = (result.text || "").length;
  const hashAfter = corpusHashForTrace(result.text);
  emitPremiumPassTiming({
    passName,
    surface,
    inputLen,
    outputLen,
    elapsedMs: Math.round(nowMs() - started),
    corpusHashBefore: hashBefore,
    corpusHashAfter: hashAfter,
    changed: result.text !== inputText,
  });
  return result;
}

export function logPremiumGenerationRatio(args: {
  sessionGenerationId?: string | null;
  intakeLen: number;
  serverDocumentLen: number;
  normalizedDocumentLen: number;
  sourceField: PremiumGenerationRatioSourceField;
  responseBodyLen: number;
}): void {
  if (!paidProPerfTraceEnabled()) return;
  const intakeLen = Math.max(0, args.intakeLen);
  const normalizedDocumentLen = Math.max(0, args.normalizedDocumentLen);
  const expansionRatio =
    intakeLen > 0 ? Math.round((normalizedDocumentLen / intakeLen) * 100) / 100 : null;
  // eslint-disable-next-line no-console
  console.info("[premium-generation-ratio]", {
    sessionGenerationIdShort: shortIdForPremiumLog(args.sessionGenerationId ?? sessionKey()),
    intakeLen,
    serverDocumentLen: Math.max(0, args.serverDocumentLen),
    normalizedDocumentLen,
    expansionRatio,
    sourceField: args.sourceField,
    responseBodyLen: Math.max(0, args.responseBodyLen),
  });
}

export function resolvePremiumGenerationRatioSourceField(parsed: {
  document_text?: string | null;
  server_full_document_text?: string | null;
  server_repair_document_text?: string | null;
}): { sourceField: PremiumGenerationRatioSourceField; serverDocumentLen: number; normalizedDocumentLen: number } {
  const serverFull = (parsed.server_full_document_text || "").trim();
  const doc = (parsed.document_text || "").trim();
  const repair = (parsed.server_repair_document_text || "").trim();
  if (serverFull.length > 0) {
    return {
      sourceField: "server_full_document_text",
      serverDocumentLen: serverFull.length,
      normalizedDocumentLen: serverFull.length,
    };
  }
  if (doc.length > 0) {
    return {
      sourceField: "document_text",
      serverDocumentLen: doc.length,
      normalizedDocumentLen: doc.length,
    };
  }
  if (repair.length > 0) {
    return {
      sourceField: "server_repair_document_text",
      serverDocumentLen: repair.length,
      normalizedDocumentLen: repair.length,
    };
  }
  return { sourceField: "none", serverDocumentLen: 0, normalizedDocumentLen: 0 };
}

export function markPaidProCheckoutReturnAt(): void {
  if (!paidProPerfTraceEnabled()) return;
  if (checkoutMilestones.checkoutReturnAt == null) {
    checkoutMilestones.checkoutReturnAt = wallClockMs();
  }
}

export function markPaidProPremiumRequestStartAt(): void {
  if (!paidProPerfTraceEnabled()) return;
  if (checkoutMilestones.premiumRequestStartAt == null) {
    checkoutMilestones.premiumRequestStartAt = wallClockMs();
  }
}

export function markPaidProPremiumHttpEndAt(): void {
  if (!paidProPerfTraceEnabled()) return;
  checkoutMilestones.premiumHttpEndAt = wallClockMs();
}

export function markPaidProLocalPostProcessingEndAt(): void {
  if (!paidProPerfTraceEnabled()) return;
  checkoutMilestones.localPostProcessingEndAt = wallClockMs();
}

export function markPaidProFirstReviewPaintAt(): void {
  if (!paidProPerfTraceEnabled()) return;
  checkoutMilestones.firstReviewPaintAt = wallClockMs();
}

export function storePaidProServerTimingHeaderForWaterfall(headerValue: string | null | undefined): void {
  if (!paidProPerfTraceEnabled()) return;
  const raw = (headerValue || "").trim();
  if (!raw) return;
  checkoutMilestones.lastServerTimingHeader = raw;
  try {
    const parsed = JSON.parse(raw) as { spans?: PaidProServerTimingSpanWire[] };
    if (Array.isArray(parsed.spans)) {
      checkoutMilestones.lastBackendSpans = parsed.spans;
    }
  } catch {
    checkoutMilestones.lastBackendSpans = [];
  }
}

export function readPaidProQaPerfTraceStateForTests(): {
  passLogDedupeSize: number;
  checkoutWaterfallEmittedForSession: string | null;
  checkoutMilestones: typeof checkoutMilestones;
} {
  return {
    passLogDedupeSize: passLogDedupe.size,
    checkoutWaterfallEmittedForSession,
    checkoutMilestones: { ...checkoutMilestones, lastBackendSpans: [...checkoutMilestones.lastBackendSpans] },
  };
}
