/** @vitest-environment jsdom */
/**
 * TEST547 — anonymous homepage hero handoff must not resurrect paid-dashboard create context.
 *
 * Staging failure: after [home-create-submit] target starter_review, /app/create mount logged
 * [paid-dashboard-create-context] active:true source:dashboard_paid_create orgId:local-org, forcing
 * paid_pro before Starter review/payment. TEST546 blocked provisional entitlement from the workspace
 * session marker alone but did not guard the paid-dashboard marker write/restore path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCachedAccessToken, setCachedAccessToken } from "../auth/authAccessTokenCache";
import { writeCachedSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
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
  clearPaidDashboardCreateContext,
  clearPaidDashboardCreateContextForTests,
  DASHBOARD_PAID_CREATE_ROUTE_SOURCE,
  evaluatePaidDashboardCreateContextWrite,
  hasPaidDashboardCreateContextActive,
  isAuthenticatedWorkspacePath,
  isHeroFromHomeCreateEntry,
  logPaidDashboardCreateContextOnMount,
  markDashboardPaidCreateRoute,
  markPaidDashboardCreateContext,
  markPaidDashboardCreateContextForTests,
  readPaidDashboardCreateContext,
} from "./paidDashboardCreateContext";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  resolveCreateFlowReviewShellTransitionReason,
} from "../components/agreements/authoritativeCreateFlowReviewShell";
import { resolveProvisionalWorkspaceProEntitledForCreate } from "../components/agreements/returningPaidCreateBootstrap";
import { bootstrapDirectAuthenticatedCreateEntryIfNeeded } from "./newAgreementSessionReset";
import { parseLawdogQaPaymentBypassEnabled, resolveQaPaymentBypassState } from "./devPaymentBypass";

const TWO_PARTY_CONSULTING_INTAKE =
  "Consulting agreement between Acme Corp, a Delaware corporation with offices at 100 Main St, San Francisco, CA 94105, and Jane Consultant, an individual with address 200 Oak Ave, Oakland, CA 94607. Acme engages Jane to provide software consulting services for six months starting January 1, 2026 at $150/hour.";

/** Mirrors LaunchNavContext navigate("/app/create") paid-dashboard branch for hero handoff. */
function simulateLaunchNavHeroCreateNavigation(intake: string): void {
  vi.stubGlobal("location", { ...window.location, pathname: "/" });
  clearPaidDashboardCreateContext("hero_from_home");
  const state = {
    clawHeroIntake: intake,
    clawHeroFromHome: true,
    clawHeroAutoGenerate: true,
  };
  window.history.pushState(state, "", "/app/create");
  vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
  markAuthenticatedWorkspaceSession();
}

/** Mirrors LaunchNavContext navigate("/app/create") for authenticated dashboard create. */
function simulateLaunchNavDashboardPaidCreateNavigation(
  originPath = "/app",
  source = "dashboard_new_agreement",
): boolean {
  vi.stubGlobal("location", { ...window.location, pathname: originPath });
  return markPaidDashboardCreateContext(source, {
    originPath,
    destinationPath: "/app/create",
  });
}

/** Mirrors LaunchHomePage.startDrafting pre-navigation sequence. */
function simulateHomepageSubmitPreclear(): void {
  clearPaidDashboardCreateContext("home_create_submit");
}

function simulateAppCreateMountSequence(): void {
  logPaidDashboardCreateContextOnMount();
  bootstrapDirectAuthenticatedCreateEntryIfNeeded();
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
  window.history.replaceState(null, "", "/");
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

describe("TEST547 — anonymous homepage paid-dashboard context resurrection", () => {
  describe("Scenario A — fresh anonymous homepage submission", () => {
    it("full handoff: marker cleared, not recreated on mount, stays free_starter", () => {
      simulateHomepageSubmitPreclear();
      simulateLaunchNavHeroCreateNavigation(TWO_PARTY_CONSULTING_INTAKE);

      expect(isHeroFromHomeCreateEntry()).toBe(true);
      expect(evaluatePaidDashboardCreateContextWrite(DASHBOARD_PAID_CREATE_ROUTE_SOURCE).allowed).toBe(
        false,
      );
      expect(evaluatePaidDashboardCreateContextWrite(DASHBOARD_PAID_CREATE_ROUTE_SOURCE).reason).toBe(
        "hero_from_home_starter",
      );

      simulateAppCreateMountSequence();

      expect(hasPaidDashboardCreateContextActive()).toBe(false);
      expect(readPaidDashboardCreateContext()).toBeNull();
      expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
      expect(
        resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: false, tier: "free" }),
      ).toBe("free_starter");
      expect(
        resolveCreateFlowReviewShellTransitionReason({ workspaceProEntitled: false, tier: "free" }),
      ).toBe("free_starter");
    });

    it("direct-entry bootstrap is a no-op for hero-from-home (does not write dashboard_paid_create)", () => {
      simulateLaunchNavHeroCreateNavigation(TWO_PARTY_CONSULTING_INTAKE);
      const result = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
      expect(result.bootstrapped).toBe(false);
      expect(result.reason).toBe("hero_from_home");
      expect(markDashboardPaidCreateRoute()).toBe(false);
      expect(hasPaidDashboardCreateContextActive()).toBe(false);
    });

    it("LaunchNav authenticated-workspace branch cannot mark when hero-from-home", () => {
      vi.stubGlobal("location", { ...window.location, pathname: "/" });
      expect(isAuthenticatedWorkspacePath("/app/create")).toBe(true);
      simulateLaunchNavHeroCreateNavigation(TWO_PARTY_CONSULTING_INTAKE);
      const marked = markPaidDashboardCreateContext("workspace_nav_create", {
        originPath: "/app/create",
        destinationPath: "/app/create",
      });
      expect(marked).toBe(false);
      expect(hasPaidDashboardCreateContextActive()).toBe(false);
    });

    it("anonymous local-org cannot accept dashboard_paid_create write even without hero state", () => {
      vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
      markAuthenticatedWorkspaceSession();
      expect(
        markPaidDashboardCreateContext(DASHBOARD_PAID_CREATE_ROUTE_SOURCE, {
          originPath: "/app",
          destinationPath: "/app/create",
        }),
      ).toBe(false);
      expect(hasPaidDashboardCreateContextActive()).toBe(false);
    });
  });

  describe("Scenario B — stale anonymous paid-dashboard marker", () => {
    it("rejects and clears stale local-org marker on read during hero handoff", () => {
      sessionStorage.setItem(
        "claw_paid_dashboard_create_context_v1",
        JSON.stringify({
          v: 1,
          orgId: "local-org",
          source: DASHBOARD_PAID_CREATE_ROUTE_SOURCE,
          markedAt: Date.now(),
        }),
      );
      simulateLaunchNavHeroCreateNavigation(TWO_PARTY_CONSULTING_INTAKE);
      simulateAppCreateMountSequence();
      expect(hasPaidDashboardCreateContextActive()).toBe(false);
      expect(sessionStorage.getItem("claw_paid_dashboard_create_context_v1")).toBeNull();
      expect(
        resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: false, tier: "free" }),
      ).toBe("free_starter");
    });

    it("rejects stale anon-* marker seeded before homepage entry", () => {
      setOrgId("anon-staging-deadbeef");
      writeCachedSubscriptionEntitlement(null, "anon-staging-deadbeef");
      sessionStorage.setItem(
        "claw_paid_dashboard_create_context_v1",
        JSON.stringify({
          v: 1,
          orgId: "anon-staging-deadbeef",
          source: DASHBOARD_PAID_CREATE_ROUTE_SOURCE,
          markedAt: Date.now(),
        }),
      );
      simulateHomepageSubmitPreclear();
      simulateLaunchNavHeroCreateNavigation(TWO_PARTY_CONSULTING_INTAKE);
      expect(hasPaidDashboardCreateContextActive()).toBe(false);
    });
  });

  describe("Scenario C — legitimate authenticated paid dashboard create", () => {
    beforeEach(() => {
      setOrgId("user-test-547");
      setCachedAccessToken("test-token-547");
      markAuthenticatedWorkspaceSession();
    });

    it("explicit dashboard create still marks and resolves paid_pro", () => {
      const marked = simulateLaunchNavDashboardPaidCreateNavigation("/app", "dashboard_new_agreement");
      expect(marked).toBe(true);
      vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
      expect(hasPaidDashboardCreateContextActive()).toBe(true);
      expect(readPaidDashboardCreateContext()?.source).toBe(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
      expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);
      expect(resolveAuthoritativeCreateFlowReviewShell({ tier: "free" })).toBe("paid_pro");
    });

    it("direct-entry bootstrap still sets marker for signed-in user without hero handoff", () => {
      vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
      window.history.replaceState(null, "", "/app/create");
      const result = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
      expect(result.bootstrapped).toBe(true);
      expect(result.reason).toBe("direct_entry_bootstrapped");
      expect(hasPaidDashboardCreateContextActive()).toBe(true);
    });

    it("ForTests helper preserves dashboard parity for signed-in fixtures", () => {
      markPaidDashboardCreateContextForTests("dashboard_new_agreement", "user-test-547");
      vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
      expect(hasPaidDashboardCreateContextActive()).toBe(true);
    });
  });

  describe("Scenario D — payment bypass parsing", () => {
    it("parseLawdogQaPaymentBypassEnabled treats only 1 as enabled", () => {
      expect(parseLawdogQaPaymentBypassEnabled(undefined)).toBe(false);
      expect(parseLawdogQaPaymentBypassEnabled("")).toBe(false);
      expect(parseLawdogQaPaymentBypassEnabled("0")).toBe(false);
      expect(parseLawdogQaPaymentBypassEnabled("false")).toBe(false);
      expect(parseLawdogQaPaymentBypassEnabled("true")).toBe(false);
      expect(parseLawdogQaPaymentBypassEnabled("1")).toBe(true);
    });

    it("resolveQaPaymentBypassState keeps staging-realistic 0/false disabled on QA hosts", () => {
      vi.stubGlobal("window", { location: { origin: "https://claw-bot-pr-99.up.railway.app" } });
      for (const envValue of [undefined, "", "0", "false"] as const) {
        expect(
          resolveQaPaymentBypassState({
            PROD: true,
            DEV: false,
            MODE: "production",
            VITE_LAWDOG_QA_PAYMENT_BYPASS: envValue,
          }).enabled,
        ).toBe(false);
      }
      expect(
        resolveQaPaymentBypassState({
          PROD: true,
          DEV: false,
          MODE: "production",
          VITE_LAWDOG_QA_PAYMENT_BYPASS: "1",
        }).enabled,
      ).toBe(true);
    });
  });
});
