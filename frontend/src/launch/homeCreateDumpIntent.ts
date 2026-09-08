/**
 * One ordinary homepage dump is one create-submit → parse → pfd flight.
 *
 * Live #231 (c8cec2bb / index-C4Fo5aP6.js): dual `home-create-submit` reached
 * `[CLAW] premium request start` / CORS OPTIONS, then remount AbortSignal
 * aborted before POST (request×1 / response×0). PASS was the same race when
 * the abort lost. Latch PRs #229–#231 never owned the dump AbortController.
 *
 * #233/#234 net-neg: a parseStarted-only skip plus
 * `home-auto-generate-skipped` skipped generate when parse had been marked
 * but the flight promise was not registered yet — first generate ate itself
 * (0/2 POSTs). Do not re-land that skip.
 *
 * Invariant: first generate always starts. Second submit joins the registered
 * parse+pfd promise and must not abort the dump-owned controller. Once
 * request-start / httpStarted, this flight settles a POST or a real error —
 * never OPTIONS-only. Sequential dump 2 begins after release.
 */

export type HomeCreateDumpIntent = {
  fingerprint: string;
  parseStarted: boolean;
  startedAt: number;
  /** Owned by this dump until fetch settles. Remount/second submit must not abort. */
  fetchController: AbortController;
  flightPromise: Promise<unknown> | null;
};

let homeCreateDumpIntent: HomeCreateDumpIntent | null = null;

function createIntent(fingerprint: string): HomeCreateDumpIntent {
  return {
    fingerprint,
    parseStarted: false,
    startedAt: Date.now(),
    fetchController: new AbortController(),
    flightPromise: null,
  };
}

export function clearHomeCreateDumpIntent(): void {
  // Drop the pointer only — never abort an in-flight OPTIONS/POST.
  homeCreateDumpIntent = null;
}

export function isHomeCreateDumpIntentActive(): boolean {
  return homeCreateDumpIntent != null;
}

export function isHomeCreateDumpParseStarted(): boolean {
  return Boolean(homeCreateDumpIntent?.parseStarted);
}

export function readHomeCreateDumpIntent(): HomeCreateDumpIntent | null {
  return homeCreateDumpIntent;
}

/** Homepage submit / first create-page auto-gen. False if a dump is already live. */
export function tryBeginHomeCreateDumpIntent(opts?: { fingerprint?: string | null }): boolean {
  if (homeCreateDumpIntent) return false;
  homeCreateDumpIntent = createIntent((opts?.fingerprint ?? "").trim());
  return true;
}

/** Keep the editor mounted once any dump/rewrite is underway (join or begin). */
export function ensureHomeCreateDumpIntent(opts?: { fingerprint?: string | null }): void {
  if (homeCreateDumpIntent) return;
  homeCreateDumpIntent = createIntent((opts?.fingerprint ?? "").trim());
}

export function markHomeCreateDumpParseStarted(): void {
  if (!homeCreateDumpIntent) {
    homeCreateDumpIntent = createIntent("");
  }
  homeCreateDumpIntent.parseStarted = true;
}

/**
 * AbortController signal owned by this dump. Remount/second submit must use
 * {@link joinHomeCreateDumpFlight} — they must not abort this signal.
 */
export function getHomeCreateDumpFetchSignal(): AbortSignal | null {
  return homeCreateDumpIntent?.fetchController.signal ?? null;
}

export function isHomeCreateDumpFetchAborted(): boolean {
  return Boolean(homeCreateDumpIntent?.fetchController.signal.aborted);
}

export function hasRegisteredHomeCreateDumpFlight(): boolean {
  return homeCreateDumpIntent?.flightPromise != null;
}

/** Register the parse+pfd promise so a remount join awaits the same flight. */
export function registerHomeCreateDumpFlight(flight: Promise<unknown>): void {
  if (!homeCreateDumpIntent) {
    homeCreateDumpIntent = createIntent("");
  }
  homeCreateDumpIntent.flightPromise = flight;
}

/** Second home-create-submit awaits this — it must not start parse 2 or abort. */
export function joinHomeCreateDumpFlight(): Promise<unknown> {
  return homeCreateDumpIntent?.flightPromise ?? Promise.resolve();
}

/**
 * Join only when a parse+pfd promise is already registered.
 * parseStarted alone must not skip the first generate (#233 net-neg).
 */
export function shouldJoinHomeCreateDumpSubmit(): boolean {
  return homeCreateDumpIntent?.flightPromise != null;
}

/** True when the create editor must stay mounted (do not entitlement-reprobe-unmount). */
export function shouldKeepCreateEditorMountedForDump(): boolean {
  return homeCreateDumpIntent != null;
}

/**
 * Resolve the signal `fetch()` may observe. A remount-aborted caller signal is
 * discarded so OPTIONS-in-flight is not killed. Timeout is composed by the API.
 */
export function resolveHomeCreateDumpFetchSignal(caller?: AbortSignal | null): AbortSignal | undefined {
  const dump = getHomeCreateDumpFetchSignal();
  if (dump && !dump.aborted) return dump;
  if (caller && !caller.aborted) return caller;
  return undefined;
}
