/** @vitest-environment jsdom */
/**
 * TEST545 — the fatal marker-missing telemetry must not fire during the normal transient
 * pre-bootstrap render window.
 *
 * Runtime trace (captured with temporary diagnostics, since removed) proved the marker is NOT erased,
 * NOT written under a wrong key/storage, and NOT rejected by the reader — the render-phase fail-closed
 * probe simply runs BEFORE the auth-settled effect writes the marker (rawKeyPresent:false on every
 * fatal; markWrite readBackMatches:true afterward; no ERASE). The fix escalates to fatal only once the
 * direct-entry bootstrap has genuinely attempted the marker write and it is still missing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthenticatedWorkspaceSession,
  markAuthenticatedWorkspaceSession,
} from "./completedAgreementViewContext";
import { setOrgId } from "./orgContext";
import {
  clearPaidDashboardCreateContextForTests,
  hasDirectAuthenticatedCreateBootstrapAttempted,
  hasPaidDashboardCreateContextActive,
  markDirectAuthenticatedCreateBootstrapAttempted,
  shouldFailClosedBypassForAuthenticatedWorkspaceCreate,
} from "./paidDashboardCreateContext";
import { bootstrapDirectAuthenticatedCreateEntryIfNeeded } from "./newAgreementSessionReset";

let fatalCount = 0;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

function isFatal(args: unknown[]): boolean {
  return typeof args[0] === "string" && args[0].includes("fatal-paid-dashboard-create-marker-missing");
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  clearPaidDashboardCreateContextForTests();
  clearAuthenticatedWorkspaceSession();
  vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
  fatalCount = 0;
  warnSpy = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
    if (isFatal(a)) fatalCount += 1;
  });
  errSpy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    if (isFatal(a)) fatalCount += 1;
  });
});

afterEach(() => {
  warnSpy.mockRestore();
  errSpy.mockRestore();
  sessionStorage.clear();
  localStorage.clear();
  clearPaidDashboardCreateContextForTests();
  clearAuthenticatedWorkspaceSession();
  vi.unstubAllGlobals();
});

describe("TEST545 — fatal marker telemetry gated on a genuine bootstrap attempt", () => {
  it("NORMAL timeline: zero fatal across the whole pre-settle → settle → post-settle sequence", () => {
    // render #1 (session not yet marked by outer LaunchNavProvider)
    shouldFailClosedBypassForAuthenticatedWorkspaceCreate();
    // outer effect marks the workspace session; org still provisional; auth still loading
    markAuthenticatedWorkspaceSession();
    // pre-bootstrap render probes (these were the live originHint:null logs) — must be SILENT now
    for (let i = 0; i < 8; i += 1) shouldFailClosedBypassForAuthenticatedWorkspaceCreate();
    expect(fatalCount).toBe(0);
    expect(hasDirectAuthenticatedCreateBootstrapAttempted()).toBe(false);

    // auth settles: real org bound, THEN the create effect runs the bootstrap
    setOrgId("real-bound-org-545");
    expect(bootstrapDirectAuthenticatedCreateEntryIfNeeded().bootstrapped).toBe(true);
    expect(hasPaidDashboardCreateContextActive()).toBe(true);
    expect(hasDirectAuthenticatedCreateBootstrapAttempted()).toBe(true);

    // post-settle renders: marker active → no fatal
    for (let i = 0; i < 5; i += 1) shouldFailClosedBypassForAuthenticatedWorkspaceCreate();
    expect(fatalCount).toBe(0);
  });

  it("still fail-closed to paid during the silent pre-bootstrap window", () => {
    markAuthenticatedWorkspaceSession();
    // returns true (treat as paid) even though it logs nothing.
    expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(true);
    expect(fatalCount).toBe(0);
  });

  it("GENUINE failure: after an attempt with no active marker, the fatal DOES fire", () => {
    markAuthenticatedWorkspaceSession();
    setOrgId("real-bound-org-545");
    // Simulate a real marker-write failure: attempt recorded, but no marker present.
    markDirectAuthenticatedCreateBootstrapAttempted();
    expect(hasPaidDashboardCreateContextActive()).toBe(false);
    expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(true);
    expect(fatalCount).toBe(1);
  });
});
