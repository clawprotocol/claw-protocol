/** @vitest-environment jsdom */
/**
 * GTM blocker regression — anonymous Starter → Upgrade → Authenticated Pro authority.
 *
 * Cases A–H from the LawDog GTM Blocker repair: homepage origin authority, checkout ordering,
 * dashboard paid create, direct /app/create, production local-org guard, stale storage, sign-in.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCachedAccessToken, setCachedAccessToken } from "../auth/authAccessTokenCache";
import { writeCachedSubscriptionEntitlement } from "../access/subscriptionEntitlementCache";
import {
  fetchWorkspaceProEntitlement,
  invalidateWorkspaceProEntitlementCache,
  markPersistedWorkspaceUsageTierForTests,
  markWorkspaceProEntitlementResolvedForTests,
  readCachedWorkspaceProEntitlement,
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
  logPaidDashboardCreateContextOnMount,
  markPaidDashboardCreateContext,
  readPaidDashboardCreateContext,
  shouldFailClosedBypassForAuthenticatedWorkspaceCreate,
} from "./paidDashboardCreateContext";
import {
  clearHomeAnonymousCreateOrigin,
  hasHomeAnonymousCreateOrigin,
  HOME_ANONYMOUS_CREATE_ORIGIN,
  HOME_ANONYMOUS_INTENDED_SURFACE,
  markHomeAnonymousCreateOrigin,
  readHomeAnonymousCreateOrigin,
} from "./homeAnonymousCreateOrigin";
import {
  evaluateFallbackOrgPaidEntitlementBlock,
  mustBlockPaidEntitlementForLegacyFallbackOrg,
} from "./fallbackOrgPaidEntitlementGuard";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  resolveCreateFlowReviewShellTransitionReason,
} from "../components/agreements/authoritativeCreateFlowReviewShell";
import { resolveProvisionalWorkspaceProEntitledForCreate } from "../components/agreements/returningPaidCreateBootstrap";
import { bootstrapDirectAuthenticatedCreateEntryIfNeeded } from "./newAgreementSessionReset";
import { markCurrentSessionFreeStarterIntent } from "../components/agreements/paidProSessionEligibility";
import { peekAdvancedFullDraftCheckoutGrant, markAdvancedFullDraftCheckoutGranted } from "../components/agreements/agreementAdvancedDraftAccess";
import { logStarterUpgradeTransition } from "./simpleProduct/starterUpgradeTransition";

const REDWOOD_FIXTURE = `I need a professional services agreement.
Client:
Redwood Outdoor Equipment LLC
123 Summit Drive
Denver, Colorado 80202
Service Provider:
Blue Peak Digital LLC
810 Market Street
Tulsa, Oklahoma 74103
Project:
Blue Peak Digital will redesign Redwood's e-commerce website.`;

const homePageSrc = readFileSync(join(__dirname, "LaunchHomePage.tsx"), "utf8");
const signInSrc = readFileSync(join(__dirname, "SignInPage.tsx"), "utf8");

function onAppCreatePath(): void {
  vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
}

/** Mirrors LaunchHomePage.startDrafting → LaunchNav hero handoff. */
function simulateAnonymousHomepageSubmit(intake = REDWOOD_FIXTURE): void {
  clearPaidDashboardCreateContext("home_create_submit");
  markHomeAnonymousCreateOrigin();
  markCurrentSessionFreeStarterIntent();
  window.history.pushState(
    {
      clawHeroIntake: intake,
      clawHeroFromHome: true,
      clawHeroAutoGenerate: true,
    },
    "",
    "/app/create",
  );
  onAppCreatePath();
  markAuthenticatedWorkspaceSession();
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
  clearHomeAnonymousCreateOrigin();
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
  clearHomeAnonymousCreateOrigin();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GTM blocker — anonymous Starter → Upgrade → Pro", () => {
  describe("Case A — anonymous homepage simple agreement", () => {
    it("fresh storage: starter shell, no paid dashboard, no provisional entitlement", () => {
      simulateAnonymousHomepageSubmit();

      expect(hasHomeAnonymousCreateOrigin()).toBe(true);
      expect(readHomeAnonymousCreateOrigin()).toEqual(
        expect.objectContaining({
          origin: HOME_ANONYMOUS_CREATE_ORIGIN,
          intendedSurface: HOME_ANONYMOUS_INTENDED_SURFACE,
        }),
      );
      expect(hasPaidDashboardCreateContextActive()).toBe(false);
      expect(readPaidDashboardCreateContext()).toBeNull();
      expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
      expect(shouldFailClosedBypassForAuthenticatedWorkspaceCreate()).toBe(false);
      expect(
        resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: false, tier: "free" }),
      ).toBe("free_starter");
      expect(
        resolveCreateFlowReviewShellTransitionReason({ workspaceProEntitled: false, tier: "free" }),
      ).toBe("free_starter");
    });
  });

  describe("Case B — anonymous homepage upgrade leads to checkout", () => {
    it("upgrade transition logs checkout boundary without Pro entitlement", () => {
      simulateAnonymousHomepageSubmit();
      const spy = vi.spyOn(console, "info").mockImplementation(() => {});
      logStarterUpgradeTransition({
        source: "starter_review_bottom_cta",
        component: "unified_bottom_cta",
        nextStep: "checkout",
        paymentRequired: true,
        entitlementPresent: false,
        anonymous: true,
        orgId: "local-org",
      });
      expect(spy).toHaveBeenCalledWith(
        "[starter-upgrade-transition]",
        expect.objectContaining({
          nextStep: "checkout",
          paymentRequired: true,
          entitlementPresent: false,
        }),
      );
      expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
      expect(homePageSrc).toContain("markHomeAnonymousCreateOrigin");
      expect(homePageSrc).toContain("markCurrentSessionFreeStarterIntent");
      spy.mockRestore();
    });
  });

  describe("Case C — checkout then auth", () => {
    it("checkout grant unlocks provisional entitlement once; same origin cleared only by paid create", () => {
      simulateAnonymousHomepageSubmit();
      expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
      markAdvancedFullDraftCheckoutGranted();
      expect(peekAdvancedFullDraftCheckoutGrant()).toBe(true);
      expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);
      // Homepage origin still present until ownership/dashboard supersedes — shell stays starter
      // until session Pro entitlement or paid create marker is established.
      expect(hasHomeAnonymousCreateOrigin()).toBe(true);
      expect(
        resolveAuthoritativeCreateFlowReviewShell({
          workspaceProEntitled: false,
          premiumCheckoutCompleted: true,
        }),
      ).toBe("paid_pro");
    });
  });

  describe("Case D — authenticated paid dashboard create", () => {
    it("explicit dashboard entry allows paid_pro without Starter requirement", () => {
      clearHomeAnonymousCreateOrigin();
      setOrgId("user-gtm-dashboard");
      setCachedAccessToken("gtm-dashboard-token");
      markAuthenticatedWorkspaceSession();
      onAppCreatePath();
      expect(
        markPaidDashboardCreateContext(DASHBOARD_PAID_CREATE_ROUTE_SOURCE, {
          originPath: "/app",
          destinationPath: "/app/create",
        }),
      ).toBe(true);
      expect(hasHomeAnonymousCreateOrigin()).toBe(false);
      expect(hasPaidDashboardCreateContextActive()).toBe(true);
      expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);
      expect(resolveAuthoritativeCreateFlowReviewShell({ tier: "free" })).toBe("paid_pro");
    });
  });

  describe("Case E — anonymous direct /app/create", () => {
    it("does not infer dashboard_paid_create or workspaceProEntitled", () => {
      onAppCreatePath();
      window.history.replaceState(null, "", "/app/create");
      markAuthenticatedWorkspaceSession();
      const boot = bootstrapDirectAuthenticatedCreateEntryIfNeeded();
      expect(boot.bootstrapped).toBe(false);
      expect(hasPaidDashboardCreateContextActive()).toBe(false);
      expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
      expect(evaluatePaidDashboardCreateContextWrite(DASHBOARD_PAID_CREATE_ROUTE_SOURCE).allowed).toBe(
        false,
      );
    });
  });

  describe("Case F — production fallback guard", () => {
    it("local-org never entitles; paid shell rejected", async () => {
      setOrgId("local-org");
      onAppCreatePath();
      markWorkspaceProEntitlementResolvedForTests(true);
      markPersistedWorkspaceUsageTierForTests("paid", "local-org");
      expect(mustBlockPaidEntitlementForLegacyFallbackOrg("local-org")).toBe(true);
      expect(
        evaluateFallbackOrgPaidEntitlementBlock("local-org", {
          PROD: true,
          MODE: "production",
          hostname: "lawdog.me",
        }).blocked,
      ).toBe(true);
      expect(readCachedWorkspaceProEntitlement()).toBe(false);
      expect(await fetchWorkspaceProEntitlement()).toBe(false);
      expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
      expect(
        markPaidDashboardCreateContext(DASHBOARD_PAID_CREATE_ROUTE_SOURCE, {
          originPath: "/app",
          destinationPath: "/app/create",
        }),
      ).toBe(false);
      expect(resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: true, tier: "free" })).toBe(
        "free_starter",
      );
    });
  });

  describe("Case G — stale storage", () => {
    it("stale dashboard_paid_create cleared; Starter wins on homepage handoff", () => {
      sessionStorage.setItem(
        "claw_paid_dashboard_create_context_v1",
        JSON.stringify({
          v: 1,
          orgId: "local-org",
          source: DASHBOARD_PAID_CREATE_ROUTE_SOURCE,
          markedAt: Date.now(),
        }),
      );
      markWorkspaceProEntitlementResolvedForTests(true);
      simulateAnonymousHomepageSubmit();
      expect(hasPaidDashboardCreateContextActive()).toBe(false);
      expect(sessionStorage.getItem("claw_paid_dashboard_create_context_v1")).toBeNull();
      expect(resolveAuthoritativeCreateFlowReviewShell({ tier: "free" })).toBe("free_starter");
    });
  });

  describe("Case H — homepage sign-in", () => {
    it("Sign in is visible, routes to /app/sign-in, preserves pending intake, Dashboard when authed", () => {
      expect(homePageSrc).toContain('"Sign in"');
      expect(homePageSrc).toContain('navigate("/app/sign-in")');
      expect(homePageSrc).toContain("stashHeroIntakePrefill(pending");
      expect(homePageSrc).toContain('{user ? "Dashboard" : "Sign in"}');
      expect(homePageSrc).toMatch(/user\s*\?\s*[\s\S]*navigate\("\/app"\)/);
      expect(signInSrc).toContain("resolveSignInContinuationOpts");
      expect(signInSrc).toContain("Sign in to LawDog");
    });

    it("checkout continuation uses saved-draft copy and resumes the next destination", () => {
      expect(signInSrc).toContain("CHECKOUT_SIGN_IN_HEADING");
      expect(signInSrc).toContain("CHECKOUT_SIGN_IN_BODY");
      expect(signInSrc).toContain("resolveSignInNextDestination");
      expect(signInSrc).toContain("navigate(pinCheckoutPathToPreAuthAgreement(destinationPath))");
    });
  });
});
