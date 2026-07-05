/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
  markWorkspaceProEntitlementResolvedForTests,
} from "../../agreement/agreementProFunnelGate";
import { markAuthenticatedWorkspaceSession } from "../../launch/completedAgreementViewContext";
import {
  clearPaidDashboardCreateContextForTests,
  markPaidDashboardCreateContextForTests,
} from "../../launch/paidDashboardCreateContext";
import {
  resolveCreateFlowAuthoritativeReviewPlain,
  resolveAuthoritativeCreateFlowReviewShell,
  shouldSuppressFreeStarterCreateFlowConversionUi,
} from "./authoritativeCreateFlowReviewShell";
import { resolveIsFreeStreamlineDraftReview } from "./freeStreamlineDraftReview";
import { CreateUiStage } from "./createUiStage";
import { resolveSkipFreeStarterCreateSubmit } from "./paidProCreateFlowRouting";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionFreeStarterIntent,
} from "./paidProSessionEligibility";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markPaidReviewSessionPremiumGeneration,
  resetPaidReviewSessionCorpusInvariantForTests,
} from "./paidProReviewSessionCorpusInvariant";
import {
  resolvePaidCreateFlowFullDraftAccess,
  resolveReturningPaidCreateEligible,
} from "./returningPaidCreateBootstrap";
import {
  PRO_CTA_CONTINUE,
  PRO_UPGRADE_CARD_HEADING,
} from "../../launch/simpleProduct/proConversionCopy";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

const SERVER_PAID_BODY = `IMPLEMENTATION AGREEMENT between Summit Ridge Advisory Group LLC and Delta Integration Services LLC. ${"Substantive paid clause. ".repeat(90)}`;
const STARTER_PREVIEW = "Starter preview only. ".repeat(20);

function test511Draft(body = ""): ParsedDraftShape {
  return {
    title: "Implementation Agreement",
    jurisdiction: "Delaware",
    parties: [
      { name: "Summit Ridge Advisory Group LLC", role: "Client" },
      { name: "Delta Integration Services LLC", role: "Service Provider" },
    ],
    purpose: body || STARTER_PREVIEW,
    payment_terms: "$240,000",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
    premium_server_full_document_text: body,
  };
}

describe("TEST511 — paid create skips legacy upgrade shell and renders canonical server corpus", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    invalidateWorkspaceProEntitlementCache();
    clearPaidDashboardCreateContextForTests();
    resetPaidReviewSessionCorpusInvariantForTests();
    markAuthenticatedWorkspaceSession();
    getOrInitSessionAgreementGenerationId();
    vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProPostAcceptanceValidatorCache();
    invalidateWorkspaceProEntitlementCache();
    markWorkspaceProEntitlementResolvedForTests(null);
    clearPaidDashboardCreateContextForTests();
    resetPaidReviewSessionCorpusInvariantForTests();
    vi.restoreAllMocks();
  });

  it("1 — paid dashboard / workspace pro grants full-draft access without checkout interstitial", () => {
    markPaidDashboardCreateContextForTests("founder_top_nav_create");
    expect(
      resolvePaidCreateFlowFullDraftAccess({ tier: "free", workspaceProEntitled: false }),
    ).toBe(true);
    markWorkspaceProEntitlementResolvedForTests(true);
    clearPaidDashboardCreateContextForTests();
    expect(
      resolvePaidCreateFlowFullDraftAccess({ tier: "free", workspaceProEntitled: true }),
    ).toBe(true);
    expect(
      resolveReturningPaidCreateEligible({ tier: "free", workspaceProEntitled: true }),
    ).toBe(true);
  });

  it("2 — public free user keeps starter conversion surfaces eligible", () => {
    vi.stubGlobal("location", { ...window.location, pathname: "/" });
    markCurrentSessionFreeStarterIntent();
    markWorkspaceProEntitlementResolvedForTests(false);
    expect(
      resolvePaidCreateFlowFullDraftAccess({ tier: "free", workspaceProEntitled: false }),
    ).toBe(false);
    expect(
      resolveSkipFreeStarterCreateSubmit({ tier: "free", proAgreementEntitled: false }),
    ).toBe(false);
    expect(shouldSuppressFreeStarterCreateFlowConversionUi({ tier: "free" })).toBe(false);
    expect(
      resolveIsFreeStreamlineDraftReview({
        simpleProductFlow: true,
        liveWorkspaceTwoPane: true,
        createProductionTwoPane: true,
        createUiStage: CreateUiStage.DRAFT,
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        paidProAuthoritative: false,
        premiumPaidDocumentSurface: false,
        premiumPersistedFlowActive: false,
        premiumSendPathUnlocked: false,
        hasPaidPremiumCompletionSession: () => false,
        showUpgradeToFullDraftOnReview: true,
      }),
    ).toBe(true);
  });

  it("3 — intake routes Generate Full Agreement to entitled rewrite for paid create (not upgrade lock)", () => {
    expect(intake).toContain("resolvePaidCreateFlowFullDraftAccess");
    expect(intake).toContain("handleUpgradeToFullDraft");
    const upgradeIdx = intake.indexOf("const handleUpgradeToFullDraft = React.useCallback");
    const upgradeBlock = intake.slice(upgradeIdx, upgradeIdx + 2200);
    expect(upgradeBlock).toContain("resolvePaidCreateFlowFullDraftAccess");
    expect(upgradeBlock).toContain("runEntitledPremiumImprovementRewrite");
    expect(upgradeBlock.indexOf("runEntitledPremiumImprovementRewrite")).toBeLessThan(
      upgradeBlock.indexOf("setUpgradeIntentDetected(true)"),
    );
    expect(intake).toContain("!resolvePaidCreateFlowFullDraftAccess");
    expect(intake).toContain("ProConversionComparisonCard");
    expect(PRO_UPGRADE_CARD_HEADING).toBe("Ready to move this from draft to deal?");
    expect(PRO_CTA_CONTINUE).toBe("Continue with Pro");
  });

  it("4 — auto-rewrite fires when paid_pro shell active and starter review is latched", () => {
    const effectIdx = intake.indexOf("paidCreateFlowAutoRewriteGenRef.current = gen");
    const effectBlock = intake.slice(effectIdx - 900, effectIdx + 400);
    expect(effectBlock).toContain("shouldUsePaidProCreateFlowReviewShell(authoritativeCreateFlowReviewShellInput)");
    expect(effectBlock).not.toContain("if (shouldUsePaidProCreateFlowReviewShell(authoritativeCreateFlowReviewShellInput)) return;");
    expect(effectBlock).toContain("resolveProvisionalWorkspaceProEntitledForCreate()");
    expect(effectBlock).toContain("runEntitledPremiumImprovementRewrite");
  });

  it("5 — stageA submit bootstraps returning paid generation before local parse", () => {
    const stageAIdx = intake.indexOf('handoffSource: freshSimpleCreateUx ? "starter_create_submit" : "stageA_baseline"');
    const stageABlock = intake.slice(stageAIdx - 1200, stageAIdx + 200);
    expect(stageABlock).toContain("planReturningPaidCreateSubmitBootstrap");
    expect(stageABlock).toContain("beginReturningPaidProCreateGeneration");
  });

  it("6 — paid generation uses premium model class (GPT-5.5 server path)", () => {
    const rewriteIdx = intake.indexOf("const runEntitledPremiumImprovementRewrite = React.useCallback");
    const rewriteBlock = intake.slice(rewriteIdx, rewriteIdx + 3500);
    expect(rewriteBlock).toContain('aiModelClass: "premium"');
    expect(rewriteBlock).toContain("ensurePremiumCompletion");
    expect(rewriteBlock).toContain('premiumGenerationCallReason: "entitled_rewrite"');
  });

  it("7 — after freeze, authoritative review plain prefers server corpus over starter preview", () => {
    markPaidDashboardCreateContextForTests("founder_top_nav_create");
    markPaidProPipelineValidationPassed({ text: SERVER_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(SERVER_PAID_BODY);
    markPaidReviewSessionPremiumGeneration(getOrInitSessionAgreementGenerationId(), "ensure_premium_completion");
    establishPaidProSourceOfTruth({ text: SERVER_PAID_BODY, source: "server_full_draft" });

    const plain = resolveCreateFlowAuthoritativeReviewPlain({
      agreementDocumentText: STARTER_PREVIEW,
      draft: test511Draft(SERVER_PAID_BODY),
    });
    expect(plain.length).toBeGreaterThan(1500);
    expect(plain).toContain("IMPLEMENTATION AGREEMENT");
    expect(plain).not.toContain("Starter preview only");

    expect(
      resolveAuthoritativeCreateFlowReviewShell({ tier: "free", workspaceProEntitled: false }),
    ).toBe("paid_pro");
  });

  it("8 — paid accepted without SoT does not fall back to starter agreementDocumentText", () => {
    markPaidProPipelineValidationPassed({ text: SERVER_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(SERVER_PAID_BODY);
    const plain = resolveCreateFlowAuthoritativeReviewPlain({
      agreementDocumentText: STARTER_PREVIEW,
      draft: test511Draft(SERVER_PAID_BODY),
      pipelineWinningBody: SERVER_PAID_BODY,
    });
    expect(plain.length).toBeGreaterThan(1500);
    expect(plain).not.toBe(STARTER_PREVIEW.trim());
  });

  it("9 — simplified-advanced upgrade banner suppressed on paid Pro review shell", () => {
    markPaidDashboardCreateContextForTests("founder_top_nav_create");
    const bannerIdx = intake.indexOf(
      "reviewShowsSimplifiedAdvancedDraft &&\n                          createUiStage === CreateUiStage.DRAFT &&\n                          !suppressFreeStarterCreateFlowConversionUi",
    );
    expect(bannerIdx).toBeGreaterThan(0);
    const bannerBlock = intake.slice(bannerIdx, bannerIdx + 280);
    expect(bannerBlock).toContain("!suppressFreeStarterCreateFlowConversionUi");
    expect(bannerBlock).toContain("!paidProReviewReady");
  });
});
