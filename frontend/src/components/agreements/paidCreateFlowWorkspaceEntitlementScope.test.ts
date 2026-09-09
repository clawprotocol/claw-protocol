/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
  readCachedWorkspaceProEntitlement,
  readExplicitWorkspaceProBillingResolution,
} from "../../agreement/agreementProFunnelGate";
import { clearLawdogUserSessionState } from "../../auth/userSessionState";
import { getOrgId, setOrgId } from "../../launch/orgContext";
import { resolveCreateFlowWorkspaceProEntitled } from "./paidCreateFlowWorkspaceEntitlementProbe";
import { resolveSkipFreeStarterCreateSubmit } from "./paidProCreateFlowRouting";
import { resolveAuthoritativeCreateFlowReviewShell } from "./authoritativeCreateFlowReviewShell";

describe("workspace Pro resolution is scoped to the current org", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
  });

  it("paid account logout leaves local-org free", () => {
    setOrgId("user-scope-paid-one");
    markWorkspaceProEntitlementResolvedForTests(true);
    expect(readExplicitWorkspaceProBillingResolution()).toBe(true);
    expect(resolveSkipFreeStarterCreateSubmit({ tier: "free", proAgreementEntitled: false })).toBe(true);

    clearLawdogUserSessionState();

    expect(getOrgId()).toBe("local-org");
    expect(readExplicitWorkspaceProBillingResolution()).toBe(false);
    expect(readCachedWorkspaceProEntitlement()).toBe(false);
    expect(resolveCreateFlowWorkspaceProEntitled()).toBe(false);
    expect(resolveSkipFreeStarterCreateSubmit({ tier: "free", proAgreementEntitled: false })).toBe(false);
    expect(resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: true, tier: "free" })).toBe(
      "free_starter",
    );
  });

  it("paid org switch to a different unpaid org is free until that org resolves", () => {
    setOrgId("user-scope-paid-one");
    markWorkspaceProEntitlementResolvedForTests(true);
    expect(readExplicitWorkspaceProBillingResolution()).toBe(true);

    setOrgId("user-scope-unpaid-two");

    expect(readExplicitWorkspaceProBillingResolution()).toBe(false);
    expect(readCachedWorkspaceProEntitlement()).toBe(false);
    expect(resolveCreateFlowWorkspaceProEntitled()).toBe(false);
    expect(resolveSkipFreeStarterCreateSubmit({ tier: "free", proAgreementEntitled: false })).toBe(false);
    expect(resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: true, tier: "free" })).toBe(
      "free_starter",
    );

    markWorkspaceProEntitlementResolvedForTests(true);
    expect(readExplicitWorkspaceProBillingResolution()).toBe(true);
    expect(resolveSkipFreeStarterCreateSubmit({ tier: "free", proAgreementEntitled: false })).toBe(true);
  });

  it("a server-resolved paid org still bypasses stale React tier free", () => {
    setOrgId("user-scope-paid-one");
    markWorkspaceProEntitlementResolvedForTests(true);
    expect(
      resolveSkipFreeStarterCreateSubmit({
        tier: "free",
        proAgreementEntitled: false,
      }),
    ).toBe(true);
    expect(resolveAuthoritativeCreateFlowReviewShell({ tier: "free" })).toBe("paid_pro");
  });
});
