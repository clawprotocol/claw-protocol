/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../agreement/agreementProFunnelGate";
import { markAuthenticatedWorkspaceSession } from "./completedAgreementViewContext";
import { getOrgId } from "./orgContext";
import {
  clearPaidDashboardCreateContextForTests,
  hasPaidDashboardCreateContextActive,
  markPaidDashboardCreateContextForTests,
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

describe("TEST509 — paid Dashboard → Create context bypasses public 4-party Pro gate", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    markAuthenticatedWorkspaceSession();
    vi.stubGlobal("location", {
      ...window.location,
      pathname: "/app/create",
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    vi.restoreAllMocks();
  });

  it("paid dashboard create marker makes provisional paid true with all billing probes false", () => {
    markPaidDashboardCreateContextForTests("dashboard_new_agreement");
    expect(hasPaidDashboardCreateContextActive()).toBe(true);
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);
    const decision = resolvePaidCreateGateBypassDecision({
      tier: "free",
      workspaceProEntitled: false,
      partyCount: 4,
    });
    expect(decision.bypass).toBe(true);
    expect(decision.reason).toBe("paid_dashboard_create_context");
    expect(decision.provisionalPaid).toBe(true);
    expect(decision.workspaceProEntitled).toBe(false);
    expect(decision.workspaceProCached).toBe(false);
    expect(decision.reasonCodes).toContain("paid_dashboard_create_context");
  });

  it("authoritative review shell resolves paid_pro from dashboard create marker on /app/create", () => {
    markPaidDashboardCreateContextForTests("dashboard_new_agreement");
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

  it("stageA guided_continue path awaits entitlement and centralizes gate bypass", () => {
    expect(intakeSrc).toContain("await resolvePaidCreateSubmitEntitlement()");
    const stageAIdx = intakeSrc.indexOf("executePrimaryCta_stageA");
    const stageABlock = intakeSrc.slice(stageAIdx - 800, stageAIdx + 1200);
    expect(stageABlock.indexOf("await resolvePaidCreateSubmitEntitlement()")).toBeLessThan(
      stageABlock.indexOf("commitStarterMultiPartyProGate"),
    );
    const gateIdx = intakeSrc.indexOf("const commitStarterMultiPartyProGate = React.useCallback(");
    const gateBlock = intakeSrc.slice(gateIdx, gateIdx + 3500);
    expect(gateBlock).toContain("resolvePaidCreateGateBypassContext");
  });

  it("4-party prompt with dashboard marker bypasses gate; party/signer counts stay 4/4", () => {
    markPaidDashboardCreateContextForTests("dashboard_new_agreement");
    const gate = assessStarterComplexityGate(TEST507_FOUR_PARTY_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.partyCount).toBeGreaterThanOrEqual(4);
    expect(
      shouldBypassStarterMultiPartyProGateForPaidCreate({
        tier: "free",
        workspaceProEntitled: false,
      }),
    ).toBe(true);
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST507_FOUR_PARTY_INTAKE,
        draftPartyNames: [...TEST507_FOUR_PARTY_LEGAL],
      }).count,
    ).toBe(4);
  });

  it("public/homepage 4-party path without dashboard marker still requires Pro gate", () => {
    vi.stubGlobal("location", {
      ...window.location,
      pathname: "/",
    });
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

  it("LaunchNavContext wires paidDashboardCreate option for dashboard navigation", () => {
    const navSrc = readFileSync(join(__dirname, "LaunchNavContext.tsx"), "utf8");
    expect(navSrc).toContain("paidDashboardCreate");
    expect(navSrc).toContain("markPaidDashboardCreateContext");
    expect(navSrc).toContain("clearPaidDashboardCreateContext");
  });

  it("dashboard marker is scoped to org id", () => {
    markPaidDashboardCreateContextForTests("dashboard_new_agreement", "org-a");
    expect(hasPaidDashboardCreateContextActive()).toBe(false);
    markPaidDashboardCreateContextForTests("dashboard_new_agreement", getOrgId().trim() || "test-org");
    expect(hasPaidDashboardCreateContextActive()).toBe(true);
  });
});
