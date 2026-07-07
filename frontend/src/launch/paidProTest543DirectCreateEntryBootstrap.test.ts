/** @vitest-environment jsdom */
/**
 * TEST543 — direct /app/create entry parity with Dashboard → Create.
 *
 * Fresh Chrome (typed URL / new tab / refresh) boots straight into /app/create WITHOUT going through
 * the SPA `navigate("/app/create", { paidDashboardCreate: true })` used by Dashboard → Create, so it:
 *   1. never sets the paid-dashboard-create route marker (→ [fatal-paid-dashboard-create-marker-missing]
 *      logs continuously via shouldFailClosedBypassForAuthenticatedWorkspaceCreate), and
 *   2. never runs initializeNewAgreementSession, and
 *   3. leaves isDashboardPaidCreateRouteActive() false, routing the user OFF the canonical dashboard
 *      paid-create review/recovery path onto the generic returning-paid path.
 *
 * bootstrapDirectAuthenticatedCreateEntryIfNeeded closes that gap for a genuinely fresh authenticated
 * direct entry, and is a no-op for resume / non-authenticated / non-create / already-marked entries.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../agreement/agreementProFunnelGate";
import { markAuthenticatedWorkspaceSession } from "./completedAgreementViewContext";
import {
  clearPaidDashboardCreateContextForTests,
  hasPaidDashboardCreateContextActive,
  isDashboardPaidCreateRouteActive,
  markPaidDashboardCreateContextForTests,
  shouldFailClosedBypassForAuthenticatedWorkspaceCreate,
} from "./paidDashboardCreateContext";
import { bootstrapDirectAuthenticatedCreateEntryIfNeeded } from "./newAgreementSessionReset";
import { resolveProvisionalWorkspaceProEntitledForCreate } from "../components/agreements/returningPaidCreateBootstrap";
import { writeCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";

function onAppCreatePath(): void {
  vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  invalidateWorkspaceProEntitlementCache();
  markWorkspaceProEntitlementResolvedForTests(null);
  clearPaidDashboardCreateContextForTests();
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  invalidateWorkspaceProEntitlementCache();
  markWorkspaceProEntitlementResolvedForTests(null);
  clearPaidDashboardCreateContextForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TEST543 — direct /app/create authenticated entry bootstraps to dashboard-create parity", () => {
  it("BEFORE bootstrap: fresh authenticated direct entry fails-closed and would log the fatal marker-missing", () => {
    onAppCreatePath();
    markAuthenticatedWorkspaceSession();
    expect(hasPaidDashboardCreateContextActive()).toBe(false);
    expect(isDashboardPaidCreateRouteActive()).toBe(false);
    // This is the branch that emits [fatal-paid-dashboard-create-marker-missing].
    expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(true);
  });

  it("AFTER bootstrap: direct entry sets the marker and matches the dashboard-created route", () => {
    onAppCreatePath();
    markAuthenticatedWorkspaceSession();

    const result = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
    expect(result.bootstrapped).toBe(true);
    expect(result.reason).toBe("direct_entry_bootstrapped");

    // Marker now present → same route posture as Dashboard → Create.
    expect(hasPaidDashboardCreateContextActive()).toBe(true);
    expect(isDashboardPaidCreateRouteActive()).toBe(true);
    // Fatal marker-missing branch no longer taken (no more continuous fatal logs).
    expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(false);
    // Provisional paid posture preserved.
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);
  });

  it("is idempotent — running twice does not re-bootstrap once the marker exists", () => {
    onAppCreatePath();
    markAuthenticatedWorkspaceSession();
    expect(bootstrapDirectAuthenticatedCreateEntryIfNeeded().bootstrapped).toBe(true);
    const second = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
    expect(second.bootstrapped).toBe(false);
    expect(second.reason).toBe("marker_present");
  });

  it("no-op when Dashboard → Create already set the marker", () => {
    onAppCreatePath();
    markAuthenticatedWorkspaceSession();
    markPaidDashboardCreateContextForTests("dashboard_new_agreement");
    const result = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
    expect(result.bootstrapped).toBe(false);
    expect(result.reason).toBe("marker_present");
  });

  it("no-op for anonymous / non-authenticated workspace (keeps free-starter flow)", () => {
    onAppCreatePath();
    // No markAuthenticatedWorkspaceSession()
    const result = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
    expect(result.bootstrapped).toBe(false);
    expect(result.reason).toBe("not_authenticated_workspace");
    expect(hasPaidDashboardCreateContextActive()).toBe(false);
  });

  it("no-op when not on /app/create", () => {
    vi.stubGlobal("location", { ...window.location, pathname: "/app" });
    markAuthenticatedWorkspaceSession();
    const result = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
    expect(result.bootstrapped).toBe(false);
    expect(result.reason).toBe("not_app_create");
  });

  it("no-op for an in-progress resume/edit (never wipes resumed work)", () => {
    onAppCreatePath();
    markAuthenticatedWorkspaceSession();
    writeCreateReviewAgreementResumeId("agreement-in-progress-123");
    const result = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
    expect(result.bootstrapped).toBe(false);
    expect(result.reason).toBe("resume_active");
    // Marker not force-set, so we did not hijack an in-progress resume.
    expect(hasPaidDashboardCreateContextActive()).toBe(false);
  });
});
