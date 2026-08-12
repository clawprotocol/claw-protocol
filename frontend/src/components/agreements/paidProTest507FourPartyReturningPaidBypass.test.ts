/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../../agreement/agreementProFunnelGate";
import {
  clearCachedSubscriptionEntitlement,
  writeCachedSubscriptionEntitlement,
} from "../../access/subscriptionEntitlementCache";
import { getOrgId, setOrgId } from "../../launch/orgContext";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  shouldUsePaidProCreateFlowReviewShell,
} from "./authoritativeCreateFlowReviewShell";
import {
  assessStarterComplexityGate,
  buildMultiPartyProGateTitle,
  shouldHideStarterReviewCtaForCreateFlowPhase,
} from "./starterMultiPartyProGate";
import {
  planReturningPaidCreateSubmitBootstrap,
  resolveProvisionalWorkspaceProEntitledForCreate,
  resolveReturningPaidCreateEligible,
  shouldBypassStarterMultiPartyProGateForPaidCreate,
  STARTER_MULTI_PARTY_PRO_GATE_PAID_BYPASS_HELPER,
} from "./returningPaidCreateBootstrap";
import {
  planEnterCanonicalPaidProReviewFlow,
  shouldMountSimpleProFinalReviewForCanonicalEntry,
} from "./enterCanonicalPaidProReviewFlow";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { clearCurrentSessionProEntitlementMarkers } from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  TEST507_FOUR_PARTY_INTAKE,
  TEST507_FOUR_PARTY_LEGAL,
} from "./paidProTest507Fixtures";

const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

const TEST507_PAID_ORG = "test-org-507-paid";

function seedPaidWorkspaceEntitlement(): void {
  setOrgId(TEST507_PAID_ORG);
  markWorkspaceProEntitlementResolvedForTests(true);
  const orgId = getOrgId().trim() || TEST507_PAID_ORG;
  writeCachedSubscriptionEntitlement(
    { plan_code: "pro", status: "active", org_id: orgId },
    orgId,
  );
}

describe("TEST507 — returning paid 4-party create bypasses free multi-party Pro gate", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setOrgId(TEST507_PAID_ORG);
    invalidateWorkspaceProEntitlementCache();
    clearCachedSubscriptionEntitlement();
    clearCurrentSessionProEntitlementMarkers();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearCachedSubscriptionEntitlement();
    vi.restoreAllMocks();
  });

  it("detects 4 parties and 4 signers from Evergreen production QA prompt", () => {
    const gate = assessStarterComplexityGate(TEST507_FOUR_PARTY_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.partyCount).toBeGreaterThanOrEqual(4);
    expect(gate.parties.length).toBeGreaterThanOrEqual(4);
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST507_FOUR_PARTY_INTAKE,
        draftPartyNames: [...TEST507_FOUR_PARTY_LEGAL],
      }).count,
    ).toBe(4);
    expect(buildMultiPartyProGateTitle(gate)).toContain("4 parties");
  });

  it("paid returning user bypasses multi-party gate and enters paid bootstrap", () => {
    seedPaidWorkspaceEntitlement();
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);
    expect(
      shouldBypassStarterMultiPartyProGateForPaidCreate({
        tier: "free",
        workspaceProEntitled: true,
      }),
    ).toBe(true);
    expect(
      resolveReturningPaidCreateEligible({
        tier: "free",
        workspaceProEntitled: true,
      }),
    ).toBe(true);
    const bootstrap = planReturningPaidCreateSubmitBootstrap({
      tier: "free",
      workspaceProEntitled: true,
    });
    expect(bootstrap?.createFlowPhase).toBe("generating_draft");
    expect(bootstrap?.premiumPostCheckoutPhase).toBe("processing");
    expect(
      resolveAuthoritativeCreateFlowReviewShell({ workspaceProEntitled: true }),
    ).toBe("paid_pro");
    expect(shouldHideStarterReviewCtaForCreateFlowPhase("multi_party_pro_required")).toBe(true);
    expect(
      shouldBypassStarterMultiPartyProGateForPaidCreate({
        tier: "free",
        workspaceProEntitled: true,
      }),
    ).toBe(true);
  });

  it("anonymous/free 4-party prompt still requires the public Pro gate", () => {
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
    expect(
      shouldBypassStarterMultiPartyProGateForPaidCreate({
        tier: "free",
        workspaceProEntitled: false,
      }),
    ).toBe(false);
    const gate = assessStarterComplexityGate(TEST507_FOUR_PARTY_INTAKE);
    expect(gate.required).toBe(true);
    expect(buildMultiPartyProGateTitle(gate)).toMatch(/requires Pro/i);
  });

  it("intake wires paid bypass before starter complexity gate on submit", () => {
    expect(intakeSrc).toContain(STARTER_MULTI_PARTY_PRO_GATE_PAID_BYPASS_HELPER);
    expect(intakeSrc).toContain("shouldBypassStarterMultiPartyProGateForPaidCreate");
    expect(intakeSrc).toContain("resolveProvisionalWorkspaceProEntitledForCreate");
    expect(intakeSrc).toContain("paidMultiPartyGateBypass");
    const parseIdx = intakeSrc.indexOf("const runProductionLocalDraftParse = React.useCallback(");
    const parseBlock = intakeSrc.slice(parseIdx, parseIdx + 14000);
    expect(parseBlock.indexOf("shouldBypassStarterMultiPartyProGateForPaidCreate")).toBeLessThan(
      parseBlock.indexOf("commitStarterMultiPartyProGate"),
    );
    expect(parseBlock).toContain("beginReturningPaidProCreateGeneration");
    expect(parseBlock).toContain("runEntitledPremiumImprovementRewrite");
  });

  it("paid 4-party path shares canonical review entry with post-checkout Pro", () => {
    seedPaidWorkspaceEntitlement();
    expect(shouldUsePaidProCreateFlowReviewShell({ workspaceProEntitled: true })).toBe(true);
    expect(
      shouldMountSimpleProFinalReviewForCanonicalEntry({
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "draft_ready_for_review",
        guidedCompletionPhase: "applied",
        canonicalCreateFlowFirstReviewActive: true,
        finalReviewExplicitlyOpened: true,
        paidProAuthoritative: true,
      }),
    ).toBe(true);
    const corpusPlain = "x".repeat(2600);
    // Returning paid-create requires a latched pipeline acceptance (TEST515) before canonical entry.
    markPaidProPipelineValidationPassed({ text: corpusPlain, source: "server_full_draft" });
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      corpusPlain,
      pipelineSource: "server_full_draft",
      draft: {
        parties: TEST507_FOUR_PARTY_LEGAL.map((name, i) => ({
          name,
          role: i === 0 ? "Brand Owner" : "Party",
        })),
      } as never,
      intakeText: TEST507_FOUR_PARTY_INTAKE,
      recipientCandidates: TEST507_FOUR_PARTY_LEGAL.map((name, i) => ({
        name,
        email: `party${i}@example.test`,
      })),
      respectAlreadyOpened: false,
    });
    expect(plan.shouldApply).toBe(true);
    expect(plan.signerHandoff?.partyLegalNames.length).toBeGreaterThanOrEqual(2);
  });
});
