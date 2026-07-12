/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCachedAccessToken, clearCachedAccessToken } from "../auth/authAccessTokenCache";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../agreement/agreementProFunnelGate";
import { markAuthenticatedWorkspaceSession } from "./completedAgreementViewContext";
import { getOrgId, setOrgId } from "./orgContext";
import {
  clearPaidDashboardCreateContextForTests,
  hasPaidDashboardCreateContextActive,
  isAuthenticatedWorkspacePath,
  isDashboardPaidCreateRouteActive,
  markPaidDashboardCreateContext,
  markPaidDashboardCreateContextForTests,
  readPaidDashboardCreateContext,
} from "./paidDashboardCreateContext";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  shouldUsePaidProCreateFlowReviewShell,
} from "../components/agreements/authoritativeCreateFlowReviewShell";
import {
  assessStarterComplexityGate,
  buildMultiPartyProGateTitle,
} from "../components/agreements/starterMultiPartyProGate";
import {
  resolvePaidCreateGateBypassDecision,
  resolveProvisionalWorkspaceProEntitledForCreate,
  shouldBypassStarterMultiPartyProGateForPaidCreate,
} from "../components/agreements/returningPaidCreateBootstrap";
import { resolveAuthoritativeSignerCount } from "../components/agreements/signerCountAuthority";
import {
  TEST507_FOUR_PARTY_INTAKE,
  TEST507_FOUR_PARTY_LEGAL,
} from "../components/agreements/paidProTest507Fixtures";

const intakeSrc = readFileSync(
  join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
  "utf8",
);
const appShellSrc = readFileSync(join(__dirname, "AppShell.tsx"), "utf8");
const navSrc = readFileSync(join(__dirname, "LaunchNavContext.tsx"), "utf8");

function seedSignedInDashboardUser(orgId = "user-test-dashboard"): void {
  setOrgId(orgId);
  markAuthenticatedWorkspaceSession();
  setCachedAccessToken("test-dashboard-token");
}

describe("TEST510 — /founder top nav Create sets paid-dashboard marker before submit", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearCachedAccessToken();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    seedSignedInDashboardUser();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearCachedAccessToken();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    vi.restoreAllMocks();
  });

  it("treats /founder as authenticated workspace origin", () => {
    expect(isAuthenticatedWorkspacePath("/founder")).toBe(true);
    expect(isAuthenticatedWorkspacePath("/app/admin")).toBe(true);
    expect(isAuthenticatedWorkspacePath("/")).toBe(false);
  });

  it("markPaidDashboardCreateContext normalizes founder entry to dashboard_paid_create", () => {
    vi.stubGlobal("location", { ...window.location, pathname: "/founder" });
    const marked = markPaidDashboardCreateContext("founder_top_nav_create");
    expect(marked).toBe(true);
    vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
    expect(hasPaidDashboardCreateContextActive()).toBe(true);
    expect(readPaidDashboardCreateContext()?.source).toBe("dashboard_paid_create");
    expect(isDashboardPaidCreateRouteActive()).toBe(true);
  });

  it("founder nav Create → 4-party guided_continue bypasses with paid_dashboard_create_context", () => {
    vi.stubGlobal("location", { ...window.location, pathname: "/founder" });
    markPaidDashboardCreateContext("founder_top_nav_create");
    vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });

    const gate = assessStarterComplexityGate(TEST507_FOUR_PARTY_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.partyCount).toBeGreaterThanOrEqual(4);

    const decision = resolvePaidCreateGateBypassDecision({
      tier: "free",
      workspaceProEntitled: false,
      partyCount: gate.partyCount,
    });
    expect(decision.bypass).toBe(true);
    expect(decision.reason).toBe("dashboard_paid_create_route");
    expect(decision.provisionalPaid).toBe(true);
    expect(decision.workspaceProEntitled).toBe(false);
    expect(decision.workspaceProCached).toBe(false);
    expect(shouldBypassStarterMultiPartyProGateForPaidCreate({ tier: "free", workspaceProEntitled: false })).toBe(
      true,
    );
    expect(
      resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: false, tier: "free" }),
    ).toBe("paid_pro");
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST507_FOUR_PARTY_INTAKE,
        draftPartyNames: [...TEST507_FOUR_PARTY_LEGAL],
      }).count,
    ).toBe(4);
  });

  it("AppShell top nav Create uses dashboard_paid_create canonical route", () => {
    expect(appShellSrc).toContain("dashboard_paid_create");
    expect(appShellSrc).toContain("navigateToPaidWorkspaceCreate");
  });

  it("LaunchNavContext marks (not clears) when origin is /founder", () => {
    expect(navSrc).toContain("isAuthenticatedWorkspacePath(originPathname)");
    expect(navSrc).toContain("logPaidDashboardCreateNavigation");
    expect(navSrc).not.toMatch(/isWorkspaceNavOrigin\(window\.location\.pathname\)[\s\S]*clearPaidDashboardCreateContext/);
  });

  it("intake centralizes gate bypass and logs paid-dashboard context on mount", () => {
    expect(intakeSrc).toContain("logPaidDashboardCreateContextOnMount");
    const gateIdx = intakeSrc.indexOf("const commitStarterMultiPartyProGate = React.useCallback(");
    const gateBlock = intakeSrc.slice(gateIdx, gateIdx + 3500);
    expect(gateBlock).toContain("resolvePaidCreateGateBypassContext");
  });

  it("public homepage 4-party without marker still requires Pro gate", () => {
    vi.stubGlobal("location", { ...window.location, pathname: "/" });
    expect(hasPaidDashboardCreateContextActive()).toBe(false);
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
    expect(
      shouldBypassStarterMultiPartyProGateForPaidCreate({
        tier: "free",
        workspaceProEntitled: false,
      }),
    ).toBe(false);
    const gate = assessStarterComplexityGate(TEST507_FOUR_PARTY_INTAKE);
    expect(buildMultiPartyProGateTitle(gate)).toMatch(/requires Pro/i);
  });

  it("marker org scoping prevents cross-org bleed", () => {
    markPaidDashboardCreateContextForTests("founder_top_nav_create", "org-a");
    vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
    expect(hasPaidDashboardCreateContextActive()).toBe(false);
    markPaidDashboardCreateContextForTests("founder_top_nav_create", getOrgId().trim() || "user-test-dashboard");
    expect(hasPaidDashboardCreateContextActive()).toBe(true);
  });
});

describe("TEST509 — paid Dashboard → Create context bypasses public 4-party Pro gate", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearCachedAccessToken();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    seedSignedInDashboardUser("user-test-509");
    vi.stubGlobal("location", {
      ...window.location,
      pathname: "/app/create",
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearCachedAccessToken();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    vi.restoreAllMocks();
  });

  it("paid dashboard create marker makes provisional paid true with all billing probes false", () => {
    markPaidDashboardCreateContextForTests("dashboard_new_agreement", "user-test-509");
    expect(hasPaidDashboardCreateContextActive()).toBe(true);
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);
    const decision = resolvePaidCreateGateBypassDecision({
      tier: "free",
      workspaceProEntitled: false,
      partyCount: 4,
    });
    expect(decision.bypass).toBe(true);
    expect(decision.reason).toBe("dashboard_paid_create_route");
    expect(decision.provisionalPaid).toBe(true);
  });

  it("authoritative review shell resolves paid_pro from dashboard create marker on /app/create", () => {
    markPaidDashboardCreateContextForTests("dashboard_new_agreement", "user-test-509");
    expect(
      resolveAuthoritativeCreateFlowReviewShell({
        workspaceProEntitled: false,
        tier: "free",
      }),
    ).toBe("paid_pro");
    expect(
      shouldUsePaidProCreateFlowReviewShell({
        workspaceProEntitled: false,
        tier: "free",
      }),
    ).toBe(true);
  });
});
