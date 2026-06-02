/**
 * Shared Paid Pro perf / verbose logging gates.
 */

export function paidProPerfTraceEnabled(): boolean {
  if (typeof import.meta === "undefined") return false;
  return Boolean(import.meta.env.VITE_PAID_PRO_PERF_TRACE);
}

export function paidProVerboseDetailLogsEnabled(): boolean {
  if (typeof import.meta === "undefined") return false;
  if (import.meta.env.MODE === "test") return false;
  return Boolean(import.meta.env.DEV || paidProPerfTraceEnabled());
}
