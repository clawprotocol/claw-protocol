/** @vitest-environment jsdom */
/**
 * TEST546 — anonymous homepage → /app/create must stay on free Starter flow.
 *
 * Root cause: LaunchNavContext marks claw_authenticated_workspace_session on any /app/create visit.
 * shouldFailClosedBypassForAuthenticatedWorkspaceCreate() treated that marker alone as "authenticated
 * workspace", forcing paid_pro before submit (resolveProvisionalWorkspaceProEntitledForCreate →
 * setWorkspaceProEntitled(true) at mount).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCachedAccessToken, clearCachedAccessToken } from "../auth/authAccessTokenCache";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../agreement/agreementProFunnelGate";
import { writeCachedSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import {
  markAuthenticatedWorkspaceSession,
  clearAuthenticatedWorkspaceSession,
} from "./completedAgreementViewContext";
import { setOrgId } from "./orgContext";
import {
  clearPaidDashboardCreateContextForTests,
  shouldFailClosedBypassForAuthenticatedWorkspaceCreate,
} from "./paidDashboardCreateContext";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  resolveCreateFlowReviewShellTransitionReason,
} from "../components/agreements/authoritativeCreateFlowReviewShell";
import { resolveProvisionalWorkspaceProEntitledForCreate } from "../components/agreements/returningPaidCreateBootstrap";
import { bootstrapDirectAuthenticatedCreateEntryIfNeeded } from "./newAgreementSessionReset";

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
  setOrgId("local-org");
  writeCachedSubscriptionEntitlement(null, "local-org");
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

describe("TEST546 — anonymous homepage create stays free starter", () => {
  it("fresh anonymous incognito: workspace session marker alone does NOT fail-closed to paid", () => {
    onAppCreatePath();
    markAuthenticatedWorkspaceSession();
    expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(false);
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
    expect(
      resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: false, tier: "free" }),
    ).toBe("free_starter");
    expect(
      resolveCreateFlowReviewShellTransitionReason({ workspaceProEntitled: false, tier: "free" }),
    ).toBe("free_starter");
  });

  it("anonymous anon-* org after bootstrap still stays free starter", () => {
    onAppCreatePath();
    markAuthenticatedWorkspaceSession();
    setOrgId("anon-staging-abc123");
    writeCachedSubscriptionEntitlement(null, "anon-staging-abc123");
    expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(false);
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
    expect(resolveAuthoritativeCreateFlowReviewShell({ tier: "free" })).toBe("free_starter");
  });

  it("direct-entry bootstrap no-op for anonymous (no paid-dashboard marker)", () => {
    onAppCreatePath();
    markAuthenticatedWorkspaceSession();
    const result = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
    expect(result.bootstrapped).toBe(false);
    expect(result.reason).toBe("not_authenticated_workspace");
  });

  it("signed-in user-* org on /app/create without marker still fail-closes to paid", () => {
    onAppCreatePath();
    markAuthenticatedWorkspaceSession();
    setOrgId("user-staging-546");
    setCachedAccessToken("staging-test-token");
    expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(true);
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);
    expect(resolveAuthoritativeCreateFlowReviewShell({ tier: "free" })).toBe("paid_pro");
    expect(resolveCreateFlowReviewShellTransitionReason({ tier: "free" })).toBe(
      "authenticated_workspace_session_fallback",
    );
  });
});
