/** @vitest-environment jsdom */
/**
 * Live path: entitled signed-in Pro ordinary named 2-party homepage dump → /app/create
 * must take the paid Review shell (not party-prep / couldn't-create toast).
 *
 * #210 remapped generate salvage helpers, but homepage always marked anonymous
 * starter origin and forced free_starter even when workspace Pro was confirmed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractListedSigningPartyNames } from "./agreementIntakeClarification";
import { evaluateIntentionalCreateDraftSubmit } from "./agreementIntakeCapabilityGate";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import {
  CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE,
  isCommerciallyUsableCreateReviewCorpus,
  planPostGenerateCreateReviewSettleOrFailClosed,
  shouldFailClosedCreateAfterRejectOrGate,
  shouldInvokePremiumGenerateAfterPartyPrepCreate,
  shouldSkipPartyPrepForOrdinaryNamedTwoParty,
  shouldSettleProReviewAfterPremiumFullDraft,
  withCreatePipelineVs01CorpusGate,
} from "./multiPartyCreateReviewSettle";
import { setOrgId } from "../../launch/orgContext";
import { setCachedAccessToken, clearCachedAccessToken } from "../../auth/authAccessTokenCache";
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
  markHomeAnonymousCreateOrigin,
  clearHomeAnonymousCreateOrigin,
  isHomeAnonymousStarterAuthorityActive,
} from "../../launch/homeAnonymousCreateOrigin";
import {
  markCurrentSessionFreeStarterIntent,
  clearCurrentSessionProEntitlementMarkers,
} from "./paidProSessionEligibility";
import {
  resolveAuthoritativeCreateFlowReviewShell,
  resolveCreateFlowReviewShellTransitionReason,
  shouldUsePaidProCreateFlowReviewShell,
} from "./authoritativeCreateFlowReviewShell";
import {
  planReturningPaidCreateSubmitBootstrap,
  resolvePaidCreateGateBypassDecision,
  resolveProvisionalWorkspaceProEntitledForCreate,
  resolveReturningPaidCreateEligible,
} from "./returningPaidCreateBootstrap";
import { resolveSkipFreeStarterCreateSubmit } from "./paidProCreateFlowRouting";
import { shouldTreatEntitledRewritePipelineResultAsGenerationFailure } from "./paidProEntitledRewriteLaunch";

const NORTHLINE_CANONICAL =
  "Services agreement between Northline Robotics LLC (Jordan Lee) and Cedar Peak Analytics Inc (Sam Okonkwo). Northline delivers robotics integration; Cedar Peak provides analytics. Fee $12,500. Term 6 months. Governing law Texas.";

const USABLE_SERVICES_CORPUS = `${"Section 1. Parties.\n".repeat(80)}IN WITNESS WHEREOF the parties execute this Agreement.`;

function simulateEntitledHomepageDump(): void {
  setOrgId("user-entitled-pro");
  setCachedAccessToken("tok");
  markAuthenticatedWorkspaceSession();
  markWorkspaceProEntitlementResolvedForTests(true);
  writeCachedSubscriptionEntitlement(
    { org_id: "user-entitled-pro", status: "active", plan_code: "pro" },
    "user-entitled-pro",
  );
  vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
  markHomeAnonymousCreateOrigin();
  markCurrentSessionFreeStarterIntent();
  window.history.replaceState(
    { clawHeroFromHome: true, clawHeroAutoGenerate: true, clawHeroIntake: NORTHLINE_CANONICAL },
    "",
    "/app/create",
  );
}

function simulateAnonymousHomepageDump(): void {
  setOrgId("local-org");
  writeCachedSubscriptionEntitlement(null, "local-org");
  vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
  markHomeAnonymousCreateOrigin();
  markCurrentSessionFreeStarterIntent();
  window.history.replaceState(
    { clawHeroFromHome: true, clawHeroAutoGenerate: true, clawHeroIntake: NORTHLINE_CANONICAL },
    "",
    "/app/create",
  );
}

describe("canonical Northline homepage dump → entitled Pro Review", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearCachedAccessToken();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearAuthenticatedWorkspaceSession();
    clearHomeAnonymousCreateOrigin();
    clearCurrentSessionProEntitlementMarkers();
    setOrgId("");
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearCachedAccessToken();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearAuthenticatedWorkspaceSession();
    clearHomeAnonymousCreateOrigin();
    clearCurrentSessionProEntitlementMarkers();
    vi.unstubAllGlobals();
  });

  it("canonical named 2p dump is commercially complete and skips party-prep immediately", () => {
    expect(extractListedSigningPartyNames(NORTHLINE_CANONICAL)).toEqual([
      "Northline Robotics LLC",
      "Cedar Peak Analytics Inc",
    ]);
    expect(evaluateIntentionalCreateDraftSubmit(NORTHLINE_CANONICAL).action).toBe("proceed");
    expect(assessStarterComplexityGate(NORTHLINE_CANONICAL).required).toBe(false);
    expect(
      shouldInvokePremiumGenerateAfterPartyPrepCreate({
        mergedIntake: NORTHLINE_CANONICAL,
        partyRows: ["", ""],
      }),
    ).toBe(true);
    expect(
      shouldSkipPartyPrepForOrdinaryNamedTwoParty({
        intakeText: NORTHLINE_CANONICAL,
        partyRows: ["", ""],
        generateComplete: false,
      }),
    ).toBe(true);
  });

  it("entitled Pro homepage dump takes paid Review shell — not free_starter / party-prep", () => {
    simulateEntitledHomepageDump();
    expect(isHomeAnonymousStarterAuthorityActive()).toBe(true);
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(true);
    expect(
      resolveAuthoritativeCreateFlowReviewShell({
        workspaceProEntitled: true,
        tier: "premium",
      }),
    ).toBe("paid_pro");
    expect(
      resolveCreateFlowReviewShellTransitionReason({
        workspaceProEntitled: true,
        tier: "premium",
      }),
    ).toBe("workspace_pro_entitled");
    expect(
      shouldUsePaidProCreateFlowReviewShell({
        workspaceProEntitled: true,
        tier: "premium",
      }),
    ).toBe(true);
    expect(
      resolveSkipFreeStarterCreateSubmit({
        tier: "premium",
        proAgreementEntitled: true,
      }),
    ).toBe(true);
    expect(
      resolveReturningPaidCreateEligible({
        workspaceProEntitled: true,
        tier: "premium",
      }),
    ).toBe(true);
    expect(
      planReturningPaidCreateSubmitBootstrap({
        workspaceProEntitled: true,
        tier: "premium",
      }),
    ).not.toBeNull();
    expect(
      resolvePaidCreateGateBypassDecision({
        workspaceProEntitled: true,
        tier: "premium",
        partyCount: 2,
      }).bypass,
    ).toBe(true);
  });

  it("anonymous homepage dump stays free_starter (TEST547/549 keep)", () => {
    simulateAnonymousHomepageDump();
    expect(resolveProvisionalWorkspaceProEntitledForCreate()).toBe(false);
    expect(
      resolveAuthoritativeCreateFlowReviewShell({
        workspaceProEntitled: false,
        tier: "free",
      }),
    ).toBe("free_starter");
    expect(
      resolveCreateFlowReviewShellTransitionReason({
        workspaceProEntitled: false,
        tier: "free",
      }),
    ).toBe("free_starter");
  });

  it("usable Northline corpus settles Review; too_much still fail-closes", () => {
    expect(isCommerciallyUsableCreateReviewCorpus(USABLE_SERVICES_CORPUS)).toBe(true);
    const retryable = withCreatePipelineVs01CorpusGate(
      {
        winningPremiumBodyText: USABLE_SERVICES_CORPUS,
        premiumRenderSource: "premium_generation_retryable" as const,
        acceptedAuthoritativePlain: USABLE_SERVICES_CORPUS,
        staleIntakeOrGeneration: false,
      },
      {
        allowed: false,
        blockReason: "premium_corpus_in_progress",
        premiumInProgress: false,
        premiumComplete: true,
        corpus: USABLE_SERVICES_CORPUS,
      },
    );
    expect(shouldSettleProReviewAfterPremiumFullDraft(retryable)).toBe(true);
    expect(shouldFailClosedCreateAfterRejectOrGate(retryable)).toBe(false);
    expect(
      shouldTreatEntitledRewritePipelineResultAsGenerationFailure({
        premiumDraft: { parties: [] } as never,
        premiumParties: [],
        recipientCandidates: [],
        winningPremiumBodyText: USABLE_SERVICES_CORPUS,
        premiumRenderSource: "server_full_draft_degraded",
        premiumReview: null,
        premiumFinalizeAudit: null,
        premiumReviewRoute: null,
        staleIntakeOrGeneration: false,
        premiumGenerationRetryable: false,
      }),
    ).toBe(false);
    const settled = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: true,
      vs01GateBlockedWithoutSelectedFinal: true,
      vs01SelectedFinal: false,
      shorterThanAcceptedChurn: true,
      winningPremiumBodyText: USABLE_SERVICES_CORPUS,
      premiumRenderSource: "premium_generation_retryable",
      acceptedAuthoritativePlain: USABLE_SERVICES_CORPUS,
    });
    expect(settled.settleReview).toBe(true);
    expect(settled.failClosed).toBe(false);
    expect(settled.corpus).toBe(USABLE_SERVICES_CORPUS);

    const empty = withCreatePipelineVs01CorpusGate(
      {
        winningPremiumBodyText: "",
        premiumRenderSource: "premium_generation_retryable" as const,
      },
      {
        allowed: false,
        blockReason: "premium_corpus_in_progress",
        premiumInProgress: false,
        premiumComplete: true,
      },
    );
    expect(shouldFailClosedCreateAfterRejectOrGate(empty)).toBe(true);
    const failPlan = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: true,
      vs01GateBlockedWithoutSelectedFinal: true,
      vs01SelectedFinal: false,
      shorterThanAcceptedChurn: true,
      winningPremiumBodyText: "",
      premiumRenderSource: "premium_generation_retryable",
    });
    expect(failPlan.failClosed).toBe(true);
    expect(failPlan.settleReview).toBe(false);
    expect(CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE).toMatch(/Try again/);
  });

  it("intake live path no longer re-latches free starter after entitled homepage resolve", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const parseResetIdx = intake.indexOf("if (fromHomeHandoff) {");
    const parseResetBlock = intake.slice(parseResetIdx, parseResetIdx + 700);
    expect(parseResetBlock).toContain("skipFreeStarterLatch: skipFreeStarterCreateSubmit");
    expect(parseResetBlock).not.toMatch(
      /skipFreeStarterCreateSubmit\s*&&\s*!isHeroFromHomeCreateEntry\(\)/,
    );
    expect(intake).toContain(
      "(hasCurrentSessionFreeStarterIntent() || isHeroFromHomeCreateEntry()) &&",
    );
  });
});
