export type PaidProAuthoritySurfaceLogEvent = {
  event: string;
  surface: string;
  hash: string;
  source: string;
  payloadSignature?: string;
};

const loggedAuthoritySurfaceEvents = new Set<string>();

function runtimeDev(): boolean {
  return Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV);
}

function runtimeTest(): boolean {
  return Boolean(typeof import.meta !== "undefined" && import.meta.env?.MODE === "test");
}

export function paidProAuthoritySurfaceLogKey(event: PaidProAuthoritySurfaceLogEvent): string {
  return `${event.event}:${event.surface}:${event.hash}:${event.source}:${event.payloadSignature ?? ""}`;
}

function runtimePerfTrace(): boolean {
  return Boolean(typeof import.meta !== "undefined" && import.meta.env?.VITE_PAID_PRO_PERF_TRACE);
}

export function shouldLogPaidProAuthoritySurfaceEvent(
  event: PaidProAuthoritySurfaceLogEvent,
  opts?: { dev?: boolean; test?: boolean; force?: boolean },
): boolean {
  if (opts?.force) {
    const key = paidProAuthoritySurfaceLogKey(event);
    if (loggedAuthoritySurfaceEvents.has(key)) return false;
    loggedAuthoritySurfaceEvents.add(key);
    return true;
  }
  const dev = opts?.dev ?? runtimeDev();
  const test = opts?.test ?? runtimeTest();
  if (test || (!dev && !runtimePerfTrace())) return false;
  const key = paidProAuthoritySurfaceLogKey(event);
  if (loggedAuthoritySurfaceEvents.has(key)) return false;
  loggedAuthoritySurfaceEvents.add(key);
  return true;
}

export function resetPaidProAuthoritySurfaceLogDedupeForTests(): void {
  loggedAuthoritySurfaceEvents.clear();
}
