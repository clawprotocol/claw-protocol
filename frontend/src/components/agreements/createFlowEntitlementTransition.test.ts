/** @vitest-environment jsdom */
/**
 * #240 — create-flow entitlement transition must not remount / re-submit or
 * abort an in-flight homepage dump pfd. Live #239: home-create-submit×2 →
 * create-flow-entitlement-transition → entitled_rewrite_start → OPTIONS-only.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setOrgId } from "../../launch/orgContext";
import { writeCachedSubscriptionEntitlement } from "../../access/subscriptionEntitlementCache";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../../agreement/agreementProFunnelGate";
import {
  markAuthenticatedWorkspaceSession,
  clearAuthenticatedWorkspaceSession,
} from "../../launch/completedAgreementViewContext";
import {
  clearPremiumGenerationCallAudit,
  releaseEntitledPremiumRewriteProcessInFlight,
  tryBeginEntitledPremiumRewriteProcessInFlight,
} from "./paidProPremiumGenerationCallAudit";
import {
  resolveCreateFlowEntitlementSyncForSubmit,
  shouldAwaitNetworkEntitlementOnCreateSubmit,
  shouldStartRewriteFromEntitlementTransition,
} from "./createFlowEntitlementTransition";

describe("create-flow entitlement transition (#240)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearPremiumGenerationCallAudit();
    invalidateWorkspaceProEntitlementCache();
    setOrgId("user-entitled-pro");
    markAuthenticatedWorkspaceSession();
    markWorkspaceProEntitlementResolvedForTests(true);
    writeCachedSubscriptionEntitlement(
      { org_id: "user-entitled-pro", status: "active", plan_code: "pro" },
      "user-entitled-pro",
    );
  });

  afterEach(() => {
    releaseEntitledPremiumRewriteProcessInFlight();
    clearAuthenticatedWorkspaceSession();
    invalidateWorkspaceProEntitlementCache();
  });

  it("home dump never awaits network entitlement (closes remount yield)", () => {
    expect(
      shouldAwaitNetworkEntitlementOnCreateSubmit({
        fromHomeHandoff: true,
        generateInFlight: false,
      }),
    ).toBe(false);
    expect(
      shouldAwaitNetworkEntitlementOnCreateSubmit({
        fromHomeHandoff: false,
        generateInFlight: false,
      }),
    ).toBe(true);
    expect(
      shouldAwaitNetworkEntitlementOnCreateSubmit({
        fromHomeHandoff: false,
        generateInFlight: true,
      }),
    ).toBe(false);
  });

  it("entitlement flip does not start a second rewrite once generate is committed or in flight", () => {
    expect(
      shouldStartRewriteFromEntitlementTransition({
        generateInFlight: false,
        paidGenerateAlreadyCommitted: false,
      }),
    ).toBe(true);
    expect(
      shouldStartRewriteFromEntitlementTransition({
        generateInFlight: true,
        paidGenerateAlreadyCommitted: false,
      }),
    ).toBe(false);
    expect(
      shouldStartRewriteFromEntitlementTransition({
        generateInFlight: false,
        paidGenerateAlreadyCommitted: true,
      }),
    ).toBe(false);
    expect(tryBeginEntitledPremiumRewriteProcessInFlight({ agreementGenerationId: "gen-pfd" })).toBe(
      true,
    );
    expect(
      shouldStartRewriteFromEntitlementTransition({
        paidGenerateAlreadyCommitted: false,
      }),
    ).toBe(false);
  });

  it("sync submit entitlement uses workspace / subscription cache (no network)", () => {
    expect(
      resolveCreateFlowEntitlementSyncForSubmit({
        workspaceProEntitledState: false,
        tier: "free",
      }),
    ).toBe(true);
    expect(
      resolveCreateFlowEntitlementSyncForSubmit({
        workspaceProEntitledState: true,
        tier: "free",
      }),
    ).toBe(true);
  });

  it("intake uses overlay-only entitlement on home dump and does not re-land dump-intent", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("shouldAwaitNetworkEntitlementOnCreateSubmit");
    expect(intake).toContain("resolveCreateFlowEntitlementSyncForSubmit");
    expect(intake).toContain("shouldStartRewriteFromEntitlementTransition");
    expect(intake).toContain("fromHomeHandoff");
    const parseIdx = intake.indexOf("const awaitNetworkEntitlement = shouldAwaitNetworkEntitlementOnCreateSubmit");
    expect(parseIdx).toBeGreaterThan(-1);
    const parseBlock = intake.slice(parseIdx, parseIdx + 900);
    expect(parseBlock).toContain("fromHomeHandoff");
    expect(parseBlock).toContain("await fetchWorkspaceProEntitlement()");
    expect(parseBlock).toContain("awaitNetworkEntitlement ? await fetchWorkspaceProEntitlement()");
    expect(intake).toContain("if (awaitNetworkEntitlement) {\n      await resolvePaidCreateSubmitEntitlement()");
    expect(intake).not.toContain("homeCreateDumpIntent");
    expect(intake).not.toContain("shouldJoinHomeCreateDumpSubmit");
    expect(intake).not.toContain("shouldSkipSecondHomeCreateSubmit");
  });
});
