/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
  markPersistedWorkspaceUsageTierForTests,
  markWorkspaceProEntitlementResolvedForTests,
} from "../../agreement/agreementProFunnelGate";
import {
  clearCachedSubscriptionEntitlement,
  writeCachedSubscriptionEntitlement,
} from "../../access/subscriptionEntitlementCache";
import { getOrgId, setOrgId } from "../../launch/orgContext";
import {
  assessStarterComplexityGate,
  buildMultiPartyProGateTitle,
} from "./starterMultiPartyProGate";
import {
  ensurePaidCreateEntitlementResolvedForSubmit,
  isAppCreatePath,
  planReturningPaidCreateSubmitBootstrap,
  resolvePaidCreateGateBypassDecision,
  resolveProvisionalWorkspaceProEntitledForCreate,
  shouldBypassStarterMultiPartyProGateForPaidCreate,
} from "./returningPaidCreateBootstrap";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { clearCurrentSessionProEntitlementMarkers } from "./paidProSessionEligibility";
import {
  TEST507_FOUR_PARTY_INTAKE,
  TEST507_FOUR_PARTY_LEGAL,
} from "./paidProTest507Fixtures";

const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
const TEST508_RETURNING_PAID_ORG = "user-test-508-returning-paid";

function seedProvisionalPaidMarkerWithoutWorkspaceState(): void {
  setOrgId(TEST508_RETURNING_PAID_ORG);
  const orgId = getOrgId().trim() || TEST508_RETURNING_PAID_ORG;
  markPersistedWorkspaceUsageTierForTests("paid", orgId);
}

describe("TEST508 — guided_continue /app/create bypasses starter gate for provisional paid", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setOrgId(TEST508_RETURNING_PAID_ORG);
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearCachedSubscriptionEntitlement();
    clearCurrentSessionProEntitlementMarkers();
    vi.stubGlobal("location", {
      ...window.location,
      pathname: "/app/create",
    });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setOrgId("local-org");
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    markPersistedWorkspaceUsageTierForTests(null);
    clearCachedSubscriptionEntitlement();
    vi.restoreAllMocks();
  });

  it("4-party prompt still triggers complexity assessment for free users", () => {
    const gate = assessStarterComplexityGate(TEST507_FOUR_PARTY_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.partyCount).toBeGreaterThanOrEqual(4);
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST507_FOUR_PARTY_INTAKE,
        draftPartyNames: [...TEST507_FOUR_PARTY_LEGAL],
      }).count,
    ).toBe(4);
  });

  it("provisional paid marker bypasses gate when workspaceProEntitled is initially false", () => {
    seedProvisionalPaidMarkerWithoutWorkspaceState();
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);
    const decision = resolvePaidCreateGateBypassDecision({
      tier: "free",
      workspaceProEntitled: false,
      partyCount: 4,
    });
    expect(decision.bypass).toBe(true);
    expect(decision.workspaceProEntitled).toBe(false);
    expect(decision.provisionalPaid).toBe(true);
    expect(decision.reasonCodes).toContain("workspace_usage_tier_persisted_paid");
    expect(
      shouldBypassStarterMultiPartyProGateForPaidCreate({
        tier: "free",
        workspaceProEntitled: false,
      }),
    ).toBe(true);
    const bootstrap = planReturningPaidCreateSubmitBootstrap({
      tier: "free",
      workspaceProEntitled: false,
    });
    expect(bootstrap?.createFlowPhase).toBe("generating_draft");
  });

  it("anonymous/free 4-party path still requires public Pro gate", () => {
    vi.stubGlobal("location", {
      ...window.location,
      pathname: "/",
    });
    expect(isAppCreatePath()).toBe(false);
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

  it("2-party paid create does not require multi-party gate", () => {
    seedProvisionalPaidMarkerWithoutWorkspaceState();
    const twoParty = "Agreement between Acme LLC and Beta Inc. Term 12 months.";
    const gate = assessStarterComplexityGate(twoParty);
    expect(gate.required).toBe(false);
    expect(
      shouldBypassStarterMultiPartyProGateForPaidCreate({
        tier: "free",
        workspaceProEntitled: false,
      }),
    ).toBe(true);
  });

  it("intake centralizes paid bypass inside commitStarterMultiPartyProGate", () => {
    const gateIdx = intakeSrc.indexOf("const commitStarterMultiPartyProGate = React.useCallback(");
    const gateBlock = intakeSrc.slice(gateIdx, gateIdx + 3500);
    expect(gateBlock).toContain("resolvePaidCreateGateBypassContext");
    expect(gateBlock).toContain("logReturningPaidCreateGateBypassDecision");
    expect(gateBlock).toContain("logStarterComplexityGateSkippedForPaidCreate");
    expect(gateBlock.indexOf("resolvePaidCreateGateBypassContext")).toBeLessThan(
      gateBlock.indexOf("setCreateFlowPhase(\"multi_party_pro_required\")"),
    );
  });

  it("guided_continue stageA path awaits entitlement resolve before starter gate", () => {
    expect(intakeSrc).toContain("await resolvePaidCreateSubmitEntitlement()");
    expect(intakeSrc).toContain("executePrimaryCta_stageA");
    const stageAIdx = intakeSrc.indexOf("executePrimaryCta_stageA");
    const stageABlock = intakeSrc.slice(stageAIdx - 800, stageAIdx + 1200);
    expect(stageABlock.indexOf("await resolvePaidCreateSubmitEntitlement()")).toBeLessThan(
      stageABlock.indexOf("commitStarterMultiPartyProGate"),
    );
  });

  it("bypass decision includes skipped_for_paid_create instrumentation fields", () => {
    seedProvisionalPaidMarkerWithoutWorkspaceState();
    const assessment = assessStarterComplexityGate(TEST507_FOUR_PARTY_INTAKE);
    const decision = resolvePaidCreateGateBypassDecision({
      tier: "free",
      workspaceProEntitled: false,
      partyCount: assessment.partyCount,
    });
    expect(decision.bypass).toBe(true);
    expect(decision.isAppCreate).toBe(true);
    expect(decision.partyCount).toBeGreaterThanOrEqual(4);
    const bootstrapSrc = readFileSync(join(__dirname, "returningPaidCreateBootstrap.ts"), "utf8");
    expect(bootstrapSrc).toContain("skipped_for_paid_create: true");
  });

  it("ensurePaidCreateEntitlementResolvedForSubmit uses persisted tier on /app/create", async () => {
    seedProvisionalPaidMarkerWithoutWorkspaceState();
    const entitled = await ensurePaidCreateEntitlementResolvedForSubmit({
      tier: "free",
      workspaceProEntitled: false,
    });
    expect(entitled).toBe(true);
  });

  it("subscription cache alone enables bypass without react workspace state", () => {
    setOrgId(TEST508_RETURNING_PAID_ORG);
    const orgId = getOrgId().trim() || TEST508_RETURNING_PAID_ORG;
    writeCachedSubscriptionEntitlement(
      { plan_code: "pro", status: "active", org_id: orgId },
      orgId,
    );
    markPersistedWorkspaceUsageTierForTests(null);
    expect(
      resolvePaidCreateGateBypassDecision({
        tier: "free",
        workspaceProEntitled: false,
        partyCount: 4,
      }).bypass,
    ).toBe(true);
  });
});
