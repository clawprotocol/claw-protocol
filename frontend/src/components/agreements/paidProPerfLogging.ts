/**
 * Shared Paid Pro perf / verbose logging gates.
 */

/** Strict QA perf trace: VITE_PAID_PRO_PERF_TRACE=1 only (ratio, pass-timing, waterfall). */
export function paidProPerfTraceEnabled(): boolean {
  if (typeof import.meta === "undefined") return false;
  return Boolean(import.meta.env.VITE_PAID_PRO_PERF_TRACE);
}

/** Noisy diagnostic logs: local DEV or explicit perf trace flag. */
export function paidProVerboseQaLogsEnabled(): boolean {
  if (typeof import.meta === "undefined") return false;
  if (import.meta.env.MODE === "test") return Boolean(import.meta.env.VITE_PAID_PRO_PERF_TRACE);
  return Boolean(import.meta.env.DEV || import.meta.env.VITE_PAID_PRO_PERF_TRACE);
}

export function paidProVerboseDetailLogsEnabled(): boolean {
  if (typeof import.meta === "undefined") return false;
  if (import.meta.env.MODE === "test") return false;
  return paidProVerboseQaLogsEnabled();
}
