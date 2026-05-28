export type PaidProAuthoritySurfaceLogEvent = {
  event: string;
  surface: string;
  hash: string;
  source: string;
};

const loggedAuthoritySurfaceEvents = new Set<string>();

function runtimeDev(): boolean {
  return Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV);
}

function runtimeTest(): boolean {
  return Boolean(typeof import.meta !== "undefined" && import.meta.env?.MODE === "test");
}

export function paidProAuthoritySurfaceLogKey(event: PaidProAuthoritySurfaceLogEvent): string {
  return `${event.event}:${event.surface}:${event.hash}:${event.source}`;
}

export function shouldLogPaidProAuthoritySurfaceEvent(
  event: PaidProAuthoritySurfaceLogEvent,
  opts?: { dev?: boolean; test?: boolean },
): boolean {
  const dev = opts?.dev ?? runtimeDev();
  const test = opts?.test ?? runtimeTest();
  if (test || !dev) return false;
  const key = paidProAuthoritySurfaceLogKey(event);
  if (loggedAuthoritySurfaceEvents.has(key)) return false;
  loggedAuthoritySurfaceEvents.add(key);
  return true;
}

export function resetPaidProAuthoritySurfaceLogDedupeForTests(): void {
  loggedAuthoritySurfaceEvents.clear();
}
