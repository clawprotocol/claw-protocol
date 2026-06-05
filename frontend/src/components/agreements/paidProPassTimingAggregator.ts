/**
 * In-memory aggregation for [premium-pass-timing] — every invocation is recorded
 * (console rows may still dedupe via paidProQaPerfTrace).
 */

import { paidProPerfTraceEnabled } from "./paidProPerfLogging";

export type PassTimingAggregateRow = {
  passName: string;
  surface: string;
  count: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
  firstAt: number;
  lastAt: number;
  lastInputHash: string;
  lastOutputHash: string;
  changedCount: number;
  unchangedCount: number;
};

const EXPENSIVE_PASS_NAMES = new Set([
  "applyAcceptedProCorpusSafeDisplay",
  "preparePaidProServerDocumentForAcceptance",
  "paid-pro-placeholder-gate",
  "premium-structure-repair",
  "paid-pro-recital-polish",
  "paid-pro-signature-polish",
  "paid-pro-enterprise-polish",
  "resolvePaidProReviewRenderPlain",
  "buildPremiumAgreementReadonlyHtml",
]);

/** Minimum aggregate ms for a repeated expensive pass to count toward duplicate_work_bound. */
const DUPLICATE_EXPENSIVE_MIN_TOTAL_MS = 80;

const byPassAndSurface = new Map<string, PassTimingAggregateRow>();
const byPassOnly = new Map<string, PassTimingAggregateRow>();
let summaryEmittedForSession: string | null = null;
let activeSessionKey = "no-session";

function wallClockMs(): number {
  return Date.now();
}

function aggregateKey(passName: string, surface: string): string {
  return `${passName}|${surface}`;
}

function bumpRow(
  store: Map<string, PassTimingAggregateRow>,
  passName: string,
  surface: string,
  elapsedMs: number,
  inputHash: string,
  outputHash: string,
  changed: boolean,
): void {
  const key = aggregateKey(passName, surface);
  const at = wallClockMs();
  const existing = store.get(key);
  if (!existing) {
    store.set(key, {
      passName,
      surface,
      count: 1,
      totalMs: elapsedMs,
      avgMs: elapsedMs,
      maxMs: elapsedMs,
      firstAt: at,
      lastAt: at,
      lastInputHash: inputHash,
      lastOutputHash: outputHash,
      changedCount: changed ? 1 : 0,
      unchangedCount: changed ? 0 : 1,
    });
    return;
  }
  const count = existing.count + 1;
  const totalMs = existing.totalMs + elapsedMs;
  existing.count = count;
  existing.totalMs = totalMs;
  existing.avgMs = Math.round(totalMs / count);
  existing.maxMs = Math.max(existing.maxMs, elapsedMs);
  existing.lastAt = at;
  existing.lastInputHash = inputHash;
  existing.lastOutputHash = outputHash;
  if (changed) existing.changedCount += 1;
  else existing.unchangedCount += 1;
}

export function setPaidProPassTimingSessionKey(sessionId: string | null | undefined): void {
  const next = (sessionId ?? "").trim() || "no-session";
  if (next !== activeSessionKey) {
    summaryEmittedForSession = null;
  }
  activeSessionKey = next;
}

export function recordPaidProPassTimingAggregate(args: {
  passName: string;
  surface: string;
  elapsedMs: number;
  inputHash: string;
  outputHash: string;
  changed: boolean;
}): void {
  if (!paidProPerfTraceEnabled()) return;
  const elapsedMs = Math.max(0, Math.round(args.elapsedMs));
  bumpRow(byPassAndSurface, args.passName, args.surface, elapsedMs, args.inputHash, args.outputHash, args.changed);
  bumpRow(byPassOnly, args.passName, "all_surfaces", elapsedMs, args.inputHash, args.outputHash, args.changed);
}

export function readPaidProPassTimingByPassAndSurface(): readonly PassTimingAggregateRow[] {
  return [...byPassAndSurface.values()];
}

export function readPaidProPassTimingByPassOnly(): readonly PassTimingAggregateRow[] {
  return [...byPassOnly.values()];
}

export function isPaidProExpensivePassName(passName: string): boolean {
  return EXPENSIVE_PASS_NAMES.has(passName);
}

/** Repeated expensive passes with meaningful cumulative time (for latency classification). */
export function readPaidProDuplicateExpensiveWorkWarnings(): string[] {
  const warnings: string[] = [];
  for (const row of byPassOnly.values()) {
    if (row.count < 2) continue;
    if (!EXPENSIVE_PASS_NAMES.has(row.passName)) continue;
    if (row.totalMs < DUPLICATE_EXPENSIVE_MIN_TOTAL_MS) continue;
    warnings.push(`${row.passName}x${row.count}:${row.totalMs}ms`);
  }
  return warnings.sort();
}

export function readPaidProDuplicateExpensiveWorkTotalMs(): number {
  let total = 0;
  for (const row of byPassOnly.values()) {
    if (row.count < 2) continue;
    if (!EXPENSIVE_PASS_NAMES.has(row.passName)) continue;
    if (row.totalMs < DUPLICATE_EXPENSIVE_MIN_TOTAL_MS) continue;
    total += row.totalMs;
  }
  return total;
}

export function resetPaidProPassTimingAggregatorForTests(sessionKey?: string | null): void {
  byPassAndSurface.clear();
  byPassOnly.clear();
  summaryEmittedForSession = null;
  if (sessionKey !== undefined) {
    activeSessionKey = (sessionKey ?? "").trim() || "no-session";
  }
}

export function emitPremiumPassTimingSummaryIfReady(sessionId?: string | null): boolean {
  if (!paidProPerfTraceEnabled()) return false;
  const session = (sessionId ?? activeSessionKey).trim() || activeSessionKey;
  if (summaryEmittedForSession === session) return false;
  summaryEmittedForSession = session;

  const bySurface = [...byPassAndSurface.values()].sort((a, b) => b.totalMs - a.totalMs);
  const byPass = [...byPassOnly.values()].sort((a, b) => b.totalMs - a.totalMs);
  const duplicateExpensive = readPaidProDuplicateExpensiveWorkWarnings();

  // eslint-disable-next-line no-console
  console.info("[premium-pass-timing-summary]", {
    sessionGenerationId: session,
    sortedByTotalMs: bySurface,
    passTotals: byPass,
    duplicateExpensiveWork: duplicateExpensive,
    duplicateExpensiveWorkTotalMs: readPaidProDuplicateExpensiveWorkTotalMs(),
  });
  return true;
}
