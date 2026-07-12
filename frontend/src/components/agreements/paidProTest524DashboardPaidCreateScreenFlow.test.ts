/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markCurrentSessionProEntitlementComplete,
  clearCurrentSessionProEntitlementMarkers,
} from "./paidProSessionEligibility";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProPipelineAcceptedCorpusHashForTests,
  markPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { setCachedAccessToken, clearCachedAccessToken } from "../../auth/authAccessTokenCache";
import { markAuthenticatedWorkspaceSession } from "../../launch/completedAgreementViewContext";
import { setOrgId } from "../../launch/orgContext";
import {
  clearPaidDashboardCreateContextForTests,
  DASHBOARD_PAID_CREATE_ROUTE_SOURCE,
  markDashboardPaidCreateRoute,
  markPaidDashboardCreateContextForTests,
  readPaidDashboardCreateContext,
} from "../../launch/paidDashboardCreateContext";
import {
  computeCreateFlowPaidProReviewReady,
  computeCreateFlowPaidProReviewContentReady,
} from "./authoritativeCreateFlowReviewShell";
import { CreateUiStage } from "./createUiStage";
import {
  DASHBOARD_PAID_CREATE_SCREEN_SEQUENCE,
  computeDashboardPaidCreateReviewShellReady,
  hasDashboardPaidCreateValidatedReviewCorpus,
  isDashboardPaidCreateRouteActive,
  planDashboardPaidCreateSubmitBootstrap,
  planDashboardPaidCreateValidationFailureTerminal,
  resolveDashboardPaidCreateScreen,
  simulateDashboardPaidCreateScreenSequence,
} from "./dashboardPaidCreateRoute";
import { planEnterCanonicalPaidProReviewFlow } from "./enterCanonicalPaidProReviewFlow";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolvePaidProReviewAuthority } from "./paidProReviewAuthority";
import {
  TEST501_ACCEPTED_PAID_BODY,
  TEST501_INTAKE,
  TEST501_STARTER_PREVIEW,
  test501Draft,
} from "./paidProTest501Fixtures";
import { TEST518_PRODUCTION_QUAD_PARTY_INTAKE } from "./paidProTest518Fixtures";
import {
  buildTest519MalformedProfessionalServerBody,
  test519Draft,
} from "./paidProTest519Fixtures";
import { planReturningPaidCreateSubmitBootstrap } from "./returningPaidCreateBootstrap";

const ACCEPTED_PAID_BODY = TEST501_ACCEPTED_PAID_BODY;
const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

describe("TEST524 — dashboard_paid_create canonical screen flow", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearPaidDashboardCreateContextForTests();
    markAuthenticatedWorkspaceSession();
    setOrgId("user-test-524");
    setCachedAccessToken("test-token-524");
    getOrInitSessionAgreementGenerationId();
    markCurrentSessionProEntitlementComplete({ source: "entitled_rewrite" });
    vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearPaidDashboardCreateContextForTests();
    clearCurrentSessionProEntitlementMarkers();
    vi.restoreAllMocks();
  });

  it("marks dashboard_paid_create from Dashboard → Create navigation", () => {
    markDashboardPaidCreateRoute();
    expect(readPaidDashboardCreateContext()?.source).toBe(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    expect(isDashboardPaidCreateRouteActive()).toBe(true);
  });

  it("legacy founder_top_nav_create normalizes to dashboard_paid_create route marker", () => {
    markPaidDashboardCreateContextForTests("founder_top_nav_create");
    expect(readPaidDashboardCreateContext()?.source).toBe(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    expect(isDashboardPaidCreateRouteActive()).toBe(true);
  });

  it("dashboard submit bootstrap — generating phase, not returning-paid mixed path", () => {
    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    const bootstrap = planDashboardPaidCreateSubmitBootstrap({
      tier: "premium",
      workspaceProEntitled: true,
    });
    expect(bootstrap).not.toBeNull();
    expect(bootstrap!.displayPhase).toBe("generating_draft");
    expect(bootstrap!.createFlowPhase).toBe("generating_draft");
    expect(planReturningPaidCreateSubmitBootstrap({ tier: "premium", workspaceProEntitled: true })).toEqual(
      bootstrap,
    );
  });

  it("review shell not content-ready until validated corpus latched", () => {
    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    expect(hasDashboardPaidCreateValidatedReviewCorpus()).toBe(false);
    expect(
      computeDashboardPaidCreateReviewShellReady({
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "review",
        createFlowPhase: "draft_ready_for_review",
      }),
    ).toBe(false);
    expect(
      computeCreateFlowPaidProReviewReady({
        simpleProductFlow: true,
        liveWorkspaceTwoPane: true,
        paidProAuthoritative: true,
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "review",
        createFlowPhase: "draft_ready_for_review",
        workspaceProEntitled: true,
      }),
    ).toBe(false);
    expect(
      computeCreateFlowPaidProReviewContentReady({
        simpleProductFlow: true,
        liveWorkspaceTwoPane: true,
        paidProAuthoritative: true,
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "review",
        createFlowPhase: "draft_ready_for_review",
        workspaceProEntitled: true,
      }),
    ).toBe(false);
  });

  it("generating modal shows before validated review on dashboard route", () => {
    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    expect(
      resolveDashboardPaidCreateScreen({
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "generating_draft",
        createFlowPhase: "generating_draft",
        premiumPostCheckoutPhase: "processing",
      }),
    ).toBe("generating");
    expect(
      computeDashboardPaidCreateReviewShellReady({
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "generating_draft",
        createFlowPhase: "generating_draft",
        premiumPostCheckoutPhase: "processing",
      }),
    ).toBe(true);
  });

  it("validation failure shows recovery before blank review document", () => {
    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    const terminal = planDashboardPaidCreateValidationFailureTerminal();
    expect(terminal.displayPhase).toBe("generating_draft");
    expect(terminal.agreementDocumentPlain).toBe("");
    const authority = resolvePaidProReviewAuthority({
      workspaceProEntitled: true,
      simpleProductFlow: true,
      liveWorkspaceTwoPane: true,
      paidProAuthoritative: true,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: terminal.displayPhase,
      createFlowPhase: terminal.createFlowPhase,
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: false,
      premiumGenerationInFlight: false,
      premiumCorpusValidationFailed: true,
      proFullDraftQualityRetry: true,
    });
    expect(authority!.contentReady).toBe(false);
    expect(authority!.renderAllowed).toBe(false);
    expect(
      resolveDashboardPaidCreateScreen({
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: terminal.displayPhase,
        createFlowPhase: terminal.createFlowPhase,
        proFullDraftQualityRetry: true,
      }),
    ).toBe("review_recovery");
  });

  it("full dashboard screen sequence through validated review and 4-party signer setup", () => {
    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    const draft = test501Draft(TEST501_STARTER_PREVIEW, ACCEPTED_PAID_BODY);
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "dashboard_paid_create",
      corpusPlain: ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft,
      intakeText: TEST501_INTAKE,
      respectAlreadyOpened: false,
    });
    expect(plan.shouldApply, plan.blockedReason).toBe(true);
    expect(plan.ui.displayPhase).toBe("review");
    expect(
      computeCreateFlowPaidProReviewReady({
        simpleProductFlow: true,
        liveWorkspaceTwoPane: true,
        paidProAuthoritative: true,
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "review",
        createFlowPhase: "draft_ready_for_review",
        workspaceProEntitled: true,
      }),
    ).toBe(true);

    const sequence = simulateDashboardPaidCreateScreenSequence({
      intakeText: TEST501_INTAKE,
      draft,
      acceptedCorpusPlain: ACCEPTED_PAID_BODY,
      recipientCandidates: [
        { name: "Party A", email: "a@test.com", role: "Party" },
        { name: "Party B", email: "b@test.com", role: "Party" },
      ],
    });
    expect(sequence).toEqual([...DASHBOARD_PAID_CREATE_SCREEN_SEQUENCE]);
    const quadDraft = test519Draft();
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST518_PRODUCTION_QUAD_PARTY_INTAKE,
        draftParties: quadDraft.parties,
        corpusPlain: ACCEPTED_PAID_BODY,
      }).count,
    ).toBe(4);
  });

  it("malformed corpus stops at review_recovery — never blank validated review", () => {
    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    const malformed = buildTest519MalformedProfessionalServerBody();
    const draft = test519Draft();
    const sequence = simulateDashboardPaidCreateScreenSequence({
      intakeText: TEST518_PRODUCTION_QUAD_PARTY_INTAKE,
      draft,
      acceptedCorpusPlain: malformed,
      recipientCandidates: [],
    });
    expect(sequence).toEqual(["dashboard", "create_intake", "generating", "review_recovery"]);
  });

  it("intake wires dashboard_paid_create route helper and blocks mixed returning bootstrap on dashboard", () => {
    expect(intakeSrc).toContain("DASHBOARD_PAID_CREATE_ROUTE_HELPER");
    expect(intakeSrc).toContain("planDashboardPaidCreateSubmitBootstrap");
    expect(intakeSrc).toContain("dashboard_paid_create");
    expect(intakeSrc).toContain("isDashboardPaidCreateRouteActive()");
    expect(intakeSrc).toContain("gateDashboardPaidCreateCanonicalReviewEntry");
  });
});
