/** @vitest-environment jsdom */
/**
 * TEST544 — the direct-entry bootstrap must actually execute (marker written + active).
 *
 * Runtime evidence from the live d325b67d deployment: [fatal-paid-dashboard-create-marker-missing]
 * logs continuously with `originHint: null`. `originHint` = readStoredPaidDashboardCreateMarker()?.source,
 * and that reader does NOT check org — so `null` proves NOTHING was ever stored under the marker key,
 * i.e. markDashboardPaidCreateRoute() was never reached: the bootstrap early-returned.
 *
 * Cause: LaunchNavProvider (which marks the authenticated workspace session) is the OUTERMOST provider,
 * so its mount effect commits AFTER the deep-child create bootstrap effect (React runs effects
 * child→parent). At the child's mount, readAuthenticatedWorkspaceSession() is still false, so the
 * bootstrap bails at not_authenticated_workspace and the one-shot effect never re-runs. Org binding
 * (setOrgId(realOrg)) also lands async later. The fix re-runs the bootstrap once auth settles
 * (useAuth().loading === false) — by then the session is marked and the real org is bound.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCachedAccessToken, clearCachedAccessToken } from "../auth/authAccessTokenCache";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../agreement/agreementProFunnelGate";
import {
  clearAuthenticatedWorkspaceSession,
  markAuthenticatedWorkspaceSession,
} from "./completedAgreementViewContext";
import { setOrgId } from "./orgContext";
import {
  clearPaidDashboardCreateContextForTests,
  hasPaidDashboardCreateContextActive,
  readPaidDashboardCreateContext,
  shouldFailClosedBypassForAuthenticatedWorkspaceCreate,
} from "./paidDashboardCreateContext";
import { bootstrapDirectAuthenticatedCreateEntryIfNeeded } from "./newAgreementSessionReset";

const intakeSrc = readFileSync(
  join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
  "utf8",
);

function onAppCreatePath(): void {
  vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  clearCachedAccessToken();
  invalidateWorkspaceProEntitlementCache();
  markWorkspaceProEntitlementResolvedForTests(null);
  clearPaidDashboardCreateContextForTests();
  clearAuthenticatedWorkspaceSession();
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  clearCachedAccessToken();
  invalidateWorkspaceProEntitlementCache();
  markWorkspaceProEntitlementResolvedForTests(null);
  clearPaidDashboardCreateContextForTests();
  clearAuthenticatedWorkspaceSession();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TEST544 — direct-entry bootstrap ordering vs auth/session/org settle", () => {
  it("REPRO: bootstrap at mount (before session is marked) writes NO marker → continuous fatal", () => {
    onAppCreatePath();
    // LaunchNavProvider has not yet marked the workspace session (outermost provider commits later).
    const result = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
    expect(result.bootstrapped).toBe(false);
    expect(result.reason).toBe("not_authenticated_workspace");
    // Matches the live signature: nothing stored → originHint would be null, fatal keeps firing.
    expect(readPaidDashboardCreateContext()).toBeNull();
  });

  it("FIX: re-running once auth settles (session marked + org bound) writes an ACTIVE marker", () => {
    onAppCreatePath();

    // 1) mount attempt — session not marked yet → no-op (the observed live state).
    expect(bootstrapDirectAuthenticatedCreateEntryIfNeeded().reason).toBe("not_authenticated_workspace");
    expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(false); // not authenticated yet

    // 2) auth settles: LaunchNav marks the session and AuthProvider binds the real org (setOrgId).
    markAuthenticatedWorkspaceSession();
    setOrgId("user-bound-org-544");
    setCachedAccessToken("test-access-token-544");

    // Before the retry, this is exactly the continuous-fatal state (authenticated, no active marker).
    expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(true);

    // 3) auth-settled retry runs the bootstrap → marker written under the real org → ACTIVE.
    const retry = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
    expect(retry.bootstrapped).toBe(true);
    expect(retry.reason).toBe("direct_entry_bootstrapped");
    expect(hasPaidDashboardCreateContextActive()).toBe(true);
    expect(readPaidDashboardCreateContext()?.orgId).toBe("user-bound-org-544");
    // Fatal branch no longer taken.
    expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(false);
  });

  it("marker written under the bound org stays active (no provisional→bound org drift)", () => {
    onAppCreatePath();
    markAuthenticatedWorkspaceSession();
    setOrgId("user-bound-org-544");
    setCachedAccessToken("test-access-token-544");
    expect(bootstrapDirectAuthenticatedCreateEntryIfNeeded().bootstrapped).toBe(true);
    // Marker org matches the current (bound) org → activation holds.
    expect(readPaidDashboardCreateContext()?.orgId).toBe("user-bound-org-544");
    expect(hasPaidDashboardCreateContextActive()).toBe(true);
  });

  it("AgreementBuilderIntake re-runs the bootstrap once auth settles (order fix is wired)", () => {
    expect(intakeSrc).toContain('import { useAuth } from "../../auth/AuthProvider"');
    expect(intakeSrc).toContain("const { loading: authLoading } = useAuth();");
    // A dedicated effect gated on auth settlement invokes the bootstrap.
    const idx = intakeSrc.indexOf("if (authLoading) return;");
    expect(idx).toBeGreaterThan(-1);
    const block = intakeSrc.slice(idx, idx + 200);
    expect(block).toContain("bootstrapDirectAuthenticatedCreateEntryIfNeeded()");
    expect(intakeSrc).toContain("[simpleProductFlow, authLoading]");
  });
});
