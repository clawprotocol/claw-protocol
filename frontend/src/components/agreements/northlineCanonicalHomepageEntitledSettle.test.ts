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
  CREATE_FLOW_GENERATING_WITHOUT_PIPELINE_FAILSAFE_MS,
  CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
  isCommerciallyUsableCreateReviewCorpus,
  planHardDismissPremiumProcessingOverlaysOnFailsafe,
  planPostGenerateCreateReviewSettleOrFailClosed,
  shouldDismissCreateOverlaysAfterRejectOrGate,
  shouldFailClosedCreateAfterRejectOrGate,
  shouldFailClosedPremiumProcessingWithoutPfd,
  shouldInvokePremiumGenerateAfterPartyPrepCreate,
  shouldSkipPartyPrepForOrdinaryNamedTwoParty,
  shouldSettleProReviewAfterPremiumFullDraft,
  withCreatePipelineVs01CorpusGate,
} from "./multiPartyCreateReviewSettle";
import {
  getLastCommerciallyUsableAuthorityCandidate,
  guardPaidProAcceptedServerFullDraftCommit,
  resetPremiumAuthorityShorterThanAcceptedChurn,
} from "./paidProAcceptedServerFullDraftCommitGuard";
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

  it("entitled paid-shell after pfd/gate-blocked settles usable corpus; fail-closes without one", () => {
    // Live #211 path: pfd 200 + leftover in_progress + shorter-than-accepted.
    // Retryable source must still settle when the body is commercially usable.
    const retryableNoAccepted = withCreatePipelineVs01CorpusGate(
      {
        winningPremiumBodyText: USABLE_SERVICES_CORPUS,
        premiumRenderSource: "premium_generation_retryable" as const,
        staleIntakeOrGeneration: false,
      },
      {
        allowed: false,
        blockReason: "premium_corpus_in_progress",
        premiumInProgress: true,
        premiumComplete: false,
        corpus: USABLE_SERVICES_CORPUS,
      },
    );
    const settledOnPaidShell = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: true,
      vs01GateBlockedWithoutSelectedFinal: true,
      vs01SelectedFinal: false,
      shorterThanAcceptedChurn: true,
      winningPremiumBodyText: retryableNoAccepted.winningPremiumBodyText,
      premiumRenderSource: retryableNoAccepted.premiumRenderSource,
    });
    expect(settledOnPaidShell.settleReview).toBe(true);
    expect(settledOnPaidShell.failClosed).toBe(false);
    expect(settledOnPaidShell.dismissOverlays).toBe(true);
    expect(settledOnPaidShell.corpus).toBe(USABLE_SERVICES_CORPUS);
    expect(
      shouldDismissCreateOverlaysAfterRejectOrGate({
        rejectOrGateBlocked: true,
        corpusCommerciallyUsable: settledOnPaidShell.settleReview,
      }),
    ).toBe(true);

    // too_much / money_vibe: no usable corpus after pfd/churn — fail-closed even
    // before generateComplete latches (shorter-than-accepted is the live signal).
    const emptyPlan = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: false,
      vs01GateBlockedWithoutSelectedFinal: true,
      vs01SelectedFinal: false,
      shorterThanAcceptedChurn: true,
      winningPremiumBodyText: "",
      premiumRenderSource: "premium_generation_retryable",
    });
    expect(emptyPlan.failClosed).toBe(true);
    expect(emptyPlan.settleReview).toBe(false);
    expect(emptyPlan.dismissOverlays).toBe(true);
    expect(
      shouldDismissCreateOverlaysAfterRejectOrGate({
        rejectOrGateBlocked: true,
        corpusCommerciallyUsable: false,
      }),
    ).toBe(true);

    resetPremiumAuthorityShorterThanAcceptedChurn();
    const guarded = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: USABLE_SERVICES_CORPUS,
      candidateSource: "server_full_draft",
      renderSource: "server_full_draft",
      reason: "entitled_paid_shell_pfd",
    });
    expect(getLastCommerciallyUsableAuthorityCandidate()).toBe(USABLE_SERVICES_CORPUS);
    expect(guarded.candidateLen).toBe(USABLE_SERVICES_CORPUS.length);
    resetPremiumAuthorityShorterThanAcceptedChurn();
  });

  it("intake applies settle/fail-closed on the live entitled rewrite path after pfd", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const vs01AttachIdx = intake.indexOf("withCreatePipelineVs01CorpusGate(");
    const entitledPlanIdx = intake.indexOf("const entitledPaidShellPlan = planPostGenerateCreateReviewSettleOrFailClosed(");
    const prepareIdx = intake.indexOf("prepareCommercialReviewSnapshotAuthority({");
    expect(vs01AttachIdx).toBeGreaterThan(-1);
    expect(entitledPlanIdx).toBeGreaterThan(vs01AttachIdx);
    expect(prepareIdx).toBeGreaterThan(entitledPlanIdx);
    const planBlock = intake.slice(entitledPlanIdx, entitledPlanIdx + 4200);
    expect(planBlock).toContain("getLastCommerciallyUsableAuthorityCandidate");
    expect(planBlock).toContain("lastCommerciallyUsableCandidate");
    expect(planBlock).toContain("ordinaryNamedTwoPartyReady");
    expect(planBlock).not.toContain("currentDumpOrdinaryNamedTwoPartyReady");
    expect(planBlock).toContain("setPremiumPostCheckoutPhase(null)");
    expect(planBlock).toContain("setDisplayPhase(\"review\")");
    expect(planBlock).toContain("entitledPaidShellPlan.failClosed");
    expect(planBlock).toContain("CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE");
    expect(intake).toContain("subscribePremiumAuthorityShorterThanAcceptedChurn");
    expect(intake).toContain("postGenerateCreateReviewSettlePlan.settleReview");
    expect(intake).toContain("postGenerateCreateReviewSettlePlan.failClosed");
    expect(intake).toContain("ordinaryNamedTwoPartyReadyForSettle");
    expect(intake).toContain("shouldFailClosedPremiumProcessingWithoutPfd");
    expect(intake).toContain("premiumProcessingWithoutPfdFailClosed");
    expect(intake).toContain("planHardDismissPremiumProcessingOverlaysOnFailsafe");
    expect(intake).toContain("premiumProcessingFailsafeOverlayDismiss");
    expect(intake).toContain("ordinaryNamedTwoPartyReady: ordinaryNamedTwoPartyReadyForSettle");
    expect(intake).toContain("ordinaryNamedTwoPartyReady: currentDumpIntakeOnlyNamedTwoPartyReady");
    expect(intake).not.toContain("shouldFailClosedJunkPfdHangOrEmptyAfterChurn");
    expect(intake).not.toContain("currentDumpOrdinaryNamedTwoPartyReady");
    expect(intake).toContain(
      "!plan.failClosed &&\n      !premiumProcessingWithoutPfdFailClosed &&\n      !postGenerateAuthorityChurn.failClosed",
    );
    const intakeOnlyReadyIdx = intake.indexOf(
      "const currentDumpIntakeOnlyNamedTwoPartyReady = shouldSkipPartyPrepForOrdinaryNamedTwoParty({",
    );
    expect(intakeOnlyReadyIdx).toBeGreaterThan(-1);
    const intakeOnlyReadyBlock = intake.slice(intakeOnlyReadyIdx, intakeOnlyReadyIdx + 240);
    expect(intakeOnlyReadyBlock).toContain("intakeCombined || readOriginalUserIntakeRaw()");
    expect(intakeOnlyReadyBlock).not.toContain("partyRows");
    expect(intakeOnlyReadyBlock).not.toContain("intakePartyEditorRows");
    const failsafeTimerIdx = intake.indexOf("premiumProcessingFailsafeStartedAtRef.current = null;");
    const failsafeTimerBlock = intake.slice(
      intake.lastIndexOf("if (", failsafeTimerIdx),
      failsafeTimerIdx,
    );
    expect(failsafeTimerBlock).toContain("premiumGenerateCompleted");
    expect(failsafeTimerBlock).not.toContain("currentDumpIntakeOnlyNamedTwoPartyReady");
    expect(failsafeTimerBlock).not.toContain("ordinaryNamedTwoPartyReadyForSettle");
    expect(failsafeTimerBlock).not.toContain("postGenerateCreateReviewSettlePlan.settleReview");
    expect(intake).not.toContain("isCoherentOrdinaryNamedTwoPartyForFailsafe");
    expect(intake).not.toContain("looksOverSpecifiedOrComplexityIntake");
    expect(intake).not.toContain("hasOrdinaryNamedTwoPartyCommercialCoherence");
    expect(intake).toContain("planHardDismissPremiumProcessingOverlaysOnFailsafe");
    expect(intake).toContain("setPremiumPostCheckoutPhase(premiumProcessingFailsafeOverlayDismiss.premiumPostCheckoutPhase)");
    expect(intake).toContain("setDisplayPhase(premiumProcessingFailsafeOverlayDismiss.displayPhase)");
    expect(intake).toContain("setPremiumAuthoritativeRequestInFlight(false)");
    const settleIdx = intake.indexOf("const settle =");
    const settleBlock = intake.slice(settleIdx, settleIdx + 280);
    expect(settleBlock).toContain("!premiumProcessingWithoutPfdFailClosed &&");
    expect(settleBlock).toContain("Boolean(plan.corpus)");
    const plannerGenerateCompleteSites = [
      intake.slice(
        intake.indexOf("const postGenerateCreateReviewSettlePlan = planPostGenerateCreateReviewSettleOrFailClosed("),
        intake.indexOf("const postGenerateCreateReviewSettlePlan = planPostGenerateCreateReviewSettleOrFailClosed(") + 900,
      ),
      intake.slice(
        intake.indexOf("const plan = planPostGenerateCreateReviewSettleOrFailClosed({"),
        intake.indexOf("const plan = planPostGenerateCreateReviewSettleOrFailClosed({") + 900,
      ),
    ];
    for (const site of plannerGenerateCompleteSites) {
      expect(site).toContain("generateComplete: premiumGenerateCompleted");
      expect(site).not.toContain("authorityChurnActive && !ordinaryNamedTwoPartyReadyForSettle");
    }
    const ensureIdx = intake.indexOf("let result = await ensurePremiumCompletion({");
    const ensureBlock = intake.slice(ensureIdx, ensureIdx + 3200);
    expect(ensureBlock).toContain("onPremiumFullDraftHttpComplete");
    expect(ensureBlock).toContain("setPremiumGenerateCompleted(true)");
    expect(ensureBlock).toContain("entitled_rewrite_pfd_http");
    expect(ensureBlock).toContain("pickCreateReviewSettleCorpus");
    const rewriteIdx = intake.indexOf("const runEntitledPremiumImprovementRewrite = React.useCallback");
    const rewriteHead = intake.slice(rewriteIdx, rewriteIdx + 3600);
    const latchCheck = rewriteHead.indexOf("if (entitledPremiumRewriteInFlightRef.current) return;");
    const processLatch = rewriteHead.indexOf("tryBeginEntitledPremiumRewriteProcessInFlight");
    const latchSet = rewriteHead.indexOf("entitledPremiumRewriteInFlightRef.current = true;");
    const skipCheck = rewriteHead.indexOf("shouldSkipEntitledRewriteForMatchingAcceptedSnapshot");
    expect(latchCheck).toBeGreaterThan(-1);
    expect(processLatch).toBeGreaterThan(latchCheck);
    expect(latchSet).toBeGreaterThan(processLatch);
    expect(latchSet).toBeLessThan(skipCheck);
    expect(rewriteHead).toContain("releasePremiumGenerateInvokeForNewGeneration");
    expect(rewriteHead).toContain("releaseEntitledPremiumRewriteInFlightLatch");
    const namedSettleIdx = intake.indexOf(
      "const ordinaryNamedTwoPartyReadyForSettle = shouldSkipPartyPrepForOrdinaryNamedTwoParty({",
    );
    const namedSettleBlock = intake.slice(namedSettleIdx, namedSettleIdx + 260);
    expect(namedSettleBlock).toContain("intakeCombined || readOriginalUserIntakeRaw()");
    expect(namedSettleBlock).not.toContain("lastPremiumWinningCorpusRef");
    const pipeline = readFileSync(join(__dirname, "premiumCompletionPipeline.ts"), "utf8");
    expect(pipeline).toContain("onPremiumFullDraftHttpComplete");
    expect(pipeline).toContain("notifyPremiumFullDraftHttpComplete");
    expect(pipeline).toContain("if (!genCall.duplicateBlocked)");
    const overlayMount = intake.indexOf(
      'premiumPostCheckoutPhase !== "premium_network_recoverable" && !dismissCreateOverlaysAfterRejectOrGate',
    );
    expect(overlayMount).toBeGreaterThan(-1);
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

  it("named 2p waits through authority churn / vs01-blocked until generate; remounts last usable", () => {
    const northlineServices = [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Northline Robotics LLC (Jordan Lee) and Cedar Peak Analytics Inc (Sam Okonkwo).",
      "Northline delivers robotics integration; Cedar Peak provides analytics.",
      "Fee $12,500. Term 6 months. Governing law Texas.",
      `${"The parties agree to the commercial terms set out in this Agreement. ".repeat(40)}`,
    ].join("\n").trim();
    expect(isCommerciallyUsableCreateReviewCorpus(northlineServices)).toBe(true);

    // Live #212 miss: churn + vs01-blocked + empty winning BEFORE pfd returns.
    const waitForPfd = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: false,
      vs01GateBlockedWithoutSelectedFinal: true,
      vs01SelectedFinal: false,
      shorterThanAcceptedChurn: true,
      winningPremiumBodyText: "",
      premiumRenderSource: "premium_generation_retryable",
      ordinaryNamedTwoPartyReady: true,
    });
    expect(waitForPfd.failClosed).toBe(false);
    expect(waitForPfd.settleReview).toBe(false);
    expect(waitForPfd.dismissOverlays).toBe(false);

    const remountLastUsable = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: false,
      vs01GateBlockedWithoutSelectedFinal: true,
      vs01SelectedFinal: false,
      shorterThanAcceptedChurn: true,
      winningPremiumBodyText: "Short preview stub",
      lastCommerciallyUsableCandidate: northlineServices,
      premiumRenderSource: "rejected_paid_corpus",
      ordinaryNamedTwoPartyReady: true,
    });
    expect(remountLastUsable.settleReview).toBe(true);
    expect(remountLastUsable.failClosed).toBe(false);
    expect(remountLastUsable.corpus).toBe(northlineServices);

    const retryableServerDraft = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: true,
      vs01GateBlockedWithoutSelectedFinal: true,
      vs01SelectedFinal: false,
      shorterThanAcceptedChurn: true,
      winningPremiumBodyText: northlineServices,
      premiumRenderSource: "premium_generation_retryable",
      ordinaryNamedTwoPartyReady: true,
    });
    expect(retryableServerDraft.settleReview).toBe(true);
    expect(retryableServerDraft.failClosed).toBe(false);
    expect(retryableServerDraft.corpus).toBe(northlineServices);

    const tooMuchStillFails = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: false,
      vs01GateBlockedWithoutSelectedFinal: true,
      vs01SelectedFinal: false,
      shorterThanAcceptedChurn: true,
      winningPremiumBodyText: "",
      ordinaryNamedTwoPartyReady: false,
    });
    expect(tooMuchStillFails.failClosed).toBe(true);
    expect(tooMuchStillFails.settleReview).toBe(false);
    expect(tooMuchStillFails.dismissOverlays).toBe(true);

    // Live #213 miss: pfd HTTP 200 completed but leftover vs01 in_progress was
    // non-terminal, so too_much / money_vibe stayed on Generating.
    const tooMuchAfterPfdHttp = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: true,
      vs01GateBlockedWithoutSelectedFinal: false,
      vs01SelectedFinal: false,
      shorterThanAcceptedChurn: true,
      winningPremiumBodyText: "",
      ordinaryNamedTwoPartyReady: false,
    });
    expect(tooMuchAfterPfdHttp.failClosed).toBe(true);
    expect(tooMuchAfterPfdHttp.settleReview).toBe(false);
    expect(tooMuchAfterPfdHttp.dismissOverlays).toBe(true);

    const namedAfterPfdWithUsable = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: true,
      vs01GateBlockedWithoutSelectedFinal: true,
      vs01SelectedFinal: false,
      shorterThanAcceptedChurn: true,
      winningPremiumBodyText: "Short preview stub",
      lastCommerciallyUsableCandidate: northlineServices,
      premiumRenderSource: "rejected_paid_corpus",
      ordinaryNamedTwoPartyReady: true,
    });
    expect(namedAfterPfdWithUsable.settleReview).toBe(true);
    expect(namedAfterPfdWithUsable.failClosed).toBe(false);
    expect(namedAfterPfdWithUsable.dismissOverlays).toBe(true);
    expect(namedAfterPfdWithUsable.corpus).toBe(northlineServices);
  });

  it("premium processing failsafe waits on Northline and fail-closes junk without pfd", () => {
    const hang = {
      premiumPostCheckoutProcessing: true,
      preparingOrGenerating: true,
      pfdHttpCompleted: false,
      hasAuthoritativeReviewBody: false,
      preparingStartedAtMs: 1_000,
      nowMs: 1_000 + CREATE_FLOW_GENERATING_WITHOUT_PIPELINE_FAILSAFE_MS,
    } as const;
    expect(shouldSkipPartyPrepForOrdinaryNamedTwoParty({ intakeText: NORTHLINE_CANONICAL })).toBe(
      true,
    );
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ...hang,
        ordinaryNamedTwoPartyReady: shouldSkipPartyPrepForOrdinaryNamedTwoParty({
          intakeText: NORTHLINE_CANONICAL,
        }),
      }),
    ).toBe(false);
    const leftoverNorthlineRows = ["Northline Robotics LLC", "Cedar Peak Analytics Inc"];
    const tooMuch =
      "Need a deal with way too much exclusivity forever, 40% equity, revenue share, every affiliate signs, and no legal names.";
    expect(
      shouldSkipPartyPrepForOrdinaryNamedTwoParty({
        intakeText: tooMuch,
        partyRows: leftoverNorthlineRows,
      }),
    ).toBe(true);
    expect(shouldSkipPartyPrepForOrdinaryNamedTwoParty({ intakeText: tooMuch })).toBe(false);
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ...hang,
        ordinaryNamedTwoPartyReady: shouldSkipPartyPrepForOrdinaryNamedTwoParty({
          intakeText: tooMuch,
        }),
      }),
    ).toBe(true);
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ...hang,
        ordinaryNamedTwoPartyReady: shouldSkipPartyPrepForOrdinaryNamedTwoParty({
          intakeText: "money vibe only, exclusivity forever, 40 percent equity, no parties named.",
        }),
      }),
    ).toBe(true);
    expect(
      shouldDismissCreateOverlaysAfterRejectOrGate({
        rejectOrGateBlocked: true,
        corpusCommerciallyUsable: false,
      }),
    ).toBe(true);
    const junkDismiss = planHardDismissPremiumProcessingOverlaysOnFailsafe({
      failClosed: shouldFailClosedPremiumProcessingWithoutPfd({
        ...hang,
        ordinaryNamedTwoPartyReady: shouldSkipPartyPrepForOrdinaryNamedTwoParty({
          intakeText: tooMuch,
        }),
      }),
    });
    expect(junkDismiss.dismissOverlays).toBe(true);
    if (junkDismiss.dismissOverlays) {
      expect(junkDismiss.premiumPostCheckoutPhase).toBe(null);
      expect(junkDismiss.displayPhase).toBe("intake");
      expect(junkDismiss.clearInFlightFlags).toBe(true);
    }
    expect(
      planHardDismissPremiumProcessingOverlaysOnFailsafe({
        failClosed: shouldFailClosedPremiumProcessingWithoutPfd({
          ...hang,
          ordinaryNamedTwoPartyReady: shouldSkipPartyPrepForOrdinaryNamedTwoParty({
            intakeText: NORTHLINE_CANONICAL,
          }),
        }),
      }).dismissOverlays,
    ).toBe(false);
    expect(CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE).toMatch(/Try again/);

    const usable = planPostGenerateCreateReviewSettleOrFailClosed({
      generateComplete: true,
      vs01SelectedFinal: false,
      winningPremiumBodyText: USABLE_SERVICES_CORPUS,
      premiumRenderSource: "server_full_draft",
      lastCommerciallyUsableCandidate: USABLE_SERVICES_CORPUS,
      ordinaryNamedTwoPartyReady: true,
    });
    expect(usable.settleReview).toBe(true);
    expect(usable.failClosed).toBe(false);
    expect(usable.corpus).toBe(USABLE_SERVICES_CORPUS);
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ...hang,
        ordinaryNamedTwoPartyReady: true,
        hasAuthoritativeReviewBody: usable.settleReview,
      }),
    ).toBe(false);

    const namedTooMuch =
      "Services agreement between Acme Robotics LLC and Cedar Peak Analytics Inc. Exclusive forever, 40% equity, every affiliate signs, revenue share, perpetual assignment, no termination.";
    expect(shouldSkipPartyPrepForOrdinaryNamedTwoParty({ intakeText: namedTooMuch })).toBe(true);
    // (a) named-2p + no pfd + elapsed ≥ absolute bound → failsafe + hard-dismiss.
    const namedAbsoluteHang = {
      ...hang,
      nowMs: 1_000 + CREATE_FLOW_NAMED_TWO_PARTY_WITHOUT_PFD_FAILSAFE_MS,
    };
    const namedNoPfd = shouldFailClosedPremiumProcessingWithoutPfd({
      ...namedAbsoluteHang,
      ordinaryNamedTwoPartyReady: true,
      pfdHttpCompleted: false,
    });
    expect(namedNoPfd).toBe(true);
    const namedDismiss = planHardDismissPremiumProcessingOverlaysOnFailsafe({
      failClosed: namedNoPfd,
    });
    expect(namedDismiss.dismissOverlays).toBe(true);
    if (namedDismiss.dismissOverlays) {
      expect(namedDismiss.premiumPostCheckoutPhase).toBe(null);
      expect(namedDismiss.clearInFlightFlags).toBe(true);
    }
    // (b) named-2p + pfdHttpCompleted → still wait / settle (KEEP Northline).
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ...namedAbsoluteHang,
        ordinaryNamedTwoPartyReady: true,
        pfdHttpCompleted: true,
      }),
    ).toBe(false);
    // 15s named-2p without pfd still waits (do not collapse to junk bound).
    expect(
      shouldFailClosedPremiumProcessingWithoutPfd({
        ...hang,
        ordinaryNamedTwoPartyReady: shouldSkipPartyPrepForOrdinaryNamedTwoParty({
          intakeText: NORTHLINE_CANONICAL,
        }),
        pfdHttpCompleted: false,
      }),
    ).toBe(false);
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

  it("fail-open snapshot / canonical / SoT still remounts usable pfd corpus on the live rewrite path", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("latchEntitledRewriteFailOpenReviewAuthority");
    expect(intake).toContain("planEntitledRewriteFailOpenReviewMount");
    const failOpenIdx = intake.indexOf("entitled_rewrite_canonical_blocked_fail_open_mount");
    const failOpenBlock = intake.slice(failOpenIdx, failOpenIdx + 2400);
    expect(failOpenBlock.indexOf("setAgreementDocumentText(")).toBeLessThan(
      failOpenBlock.indexOf("establishPaidProSourceOfTruth("),
    );
    const sotFail = failOpenBlock.slice(failOpenBlock.indexOf("entitled_rewrite_canonical_fail_open_sot_failed"));
    expect(sotFail).not.toContain("setProFullDraftQualityRetry(true)");
  });
});
