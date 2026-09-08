/**
 * One ordinary homepage dump is one create-submit → parse → pfd intent.
 *
 * Live #231 (88ccb982): entitled Northline still OPTIONS-only on run1 because
 * `homeAutoGenerateStartedRef` dies on remount. SimpleCreatePage hides the
 * editor when entitlement re-probes (`authSession.access_token` /
 * `refreshCachedAccessToken` → TOKEN_REFRESHED). The remount fires a second
 * `home-create-submit` + parse while the first pfd `fetch()` is in preflight.
 * Latch steal/never-steal (#229–#231) only owned the rewrite; they never
 * single-flighted the create submit, so they oscillated PASS↔FAIL.
 *
 * This module survives remount. A second submit joins the live dump; it does
 * not start a second parse/pfd. Sequential dump 2 begins after release.
 */

export type HomeCreateDumpIntent = {
  fingerprint: string;
  parseStarted: boolean;
  startedAt: number;
};

let homeCreateDumpIntent: HomeCreateDumpIntent | null = null;

export function clearHomeCreateDumpIntent(): void {
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
  homeCreateDumpIntent = {
    fingerprint: (opts?.fingerprint ?? "").trim(),
    parseStarted: false,
    startedAt: Date.now(),
  };
  return true;
}

/** Keep the editor mounted once any dump/rewrite is underway (join or begin). */
export function ensureHomeCreateDumpIntent(opts?: { fingerprint?: string | null }): void {
  if (homeCreateDumpIntent) return;
  homeCreateDumpIntent = {
    fingerprint: (opts?.fingerprint ?? "").trim(),
    parseStarted: false,
    startedAt: Date.now(),
  };
}

export function markHomeCreateDumpParseStarted(): void {
  if (!homeCreateDumpIntent) {
    homeCreateDumpIntent = { fingerprint: "", parseStarted: true, startedAt: Date.now() };
    return;
  }
  homeCreateDumpIntent.parseStarted = true;
}

/**
 * Remount / second home-create-submit must not start another parse while this
 * dump's parse or pfd is already underway.
 */
export function shouldSkipSecondHomeCreateSubmit(): boolean {
  return Boolean(homeCreateDumpIntent?.parseStarted);
}

/** True when the create editor must stay mounted (do not entitlement-reprobe-unmount). */
export function shouldKeepCreateEditorMountedForDump(): boolean {
  return homeCreateDumpIntent != null;
}
