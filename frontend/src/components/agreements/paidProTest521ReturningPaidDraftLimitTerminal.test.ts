/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markPaidDashboardCreateContextForTests,
  clearPaidDashboardCreateContextForTests,
} from "../../launch/paidDashboardCreateContext";
import { clearCurrentSessionProEntitlementMarkers } from "./paidProSessionEligibility";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { CreateUiStage } from "./createUiStage";
import {
  buildTest519MalformedProfessionalServerBody,
  TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
  test519Draft,
} from "./paidProTest519Fixtures";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { resolvePaidProReviewState } from "./paidProReviewStateMachine";
import {
  hasPaidCreateFlowPersistableCorpus,
  shouldAutoPersistReviewAgreementRow,
} from "./paidProCreateFlowRouting";
import {
  computeCreateFlowPaidProReviewContentReady,
  computeCreateFlowPaidProReviewReady,
} from "./authoritativeCreateFlowReviewShell";
import { resolveReviewShellChrome } from "./freeStarterReviewShell";
import {
  formatPaidCreateFlowDraftPersistFailureMessage,
  isDraftLimitReachedPersistError,
  PAID_CREATE_FLOW_DRAFT_LIMIT_BODY,
} from "./paidProCreateFlowPersistTerminal";
import { DRAFT_LOADING_STRUCTURING } from "../../launch/simpleProduct/proConversionCopy";
import {
  isPaidProGenerationProcessingDeadlock,
  resolvePaidProGenerationFailurePostCheckoutPhase,
} from "./paidProGenerationTerminalState";

const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

describe("TEST521 — returning paid create + validation fail + draft_limit_reached terminal recovery", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidDashboardCreateContextForTests();
    getOrInitSessionAgreementGenerationId();
    markPaidDashboardCreateContextForTests("founder_top_nav_create");
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidDashboardCreateContextForTests();
  });

  it("1 — professional validation rejects malformed server draft (TEST519 gate preserved)", () => {
    const body = buildTest519MalformedProfessionalServerBody();
    const contract = resolveAgreementIntentContract(TEST519_PRODUCTION_QUAD_PARTY_INTAKE);
    const validation = validatePaidProOutput({
      text: body,
      rawIntake: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
      intentContract: contract,
      draft: test519Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(false);
  });

  it("2 — paid dashboard create must not auto-persist without validated corpus", () => {
    const malformed = buildTest519MalformedProfessionalServerBody();
    const draft = test519Draft();
    expect(
      hasPaidCreateFlowPersistableCorpus({
        draft,
        agreementDocumentText: malformed,
        pipelineWinningBody: malformed,
      }),
    ).toBe(false);
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: true,
        qualityRetryActive: false,
        draft,
        agreementDocumentText: malformed,
        pipelineWinningBody: malformed,
      }),
    ).toBe(false);
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: true,
        qualityRetryActive: true,
        draft,
        agreementDocumentText: malformed,
        pipelineWinningBody: malformed,
      }),
    ).toBe(false);
  });

  it("3 — draft_limit_reached maps to terminal recoverable state machine + copy", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/app/create", replace: () => undefined },
      writable: true,
      configurable: true,
    });
    const err = {
      httpStatus: 403,
      httpDetail: "draft_limit_reached: Free workspaces can have up to 3 active drafts.",
      responseBody: {
        detail: {
          code: "draft_limit_reached",
          message:
            "draft_limit_reached: Free workspaces can have up to 3 active drafts. Finish or upgrade to add another.",
        },
      },
    };
    expect(isDraftLimitReachedPersistError(err)).toBe(true);
    expect(formatPaidCreateFlowDraftPersistFailureMessage(err)).toBe(PAID_CREATE_FLOW_DRAFT_LIMIT_BODY);

    expect(
      resolvePaidProReviewState({
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: false,
        premiumGenerationInFlight: false,
        hasValidAuthoritativeCorpus: true,
        premiumCorpusValidationFailed: false,
        proFullDraftQualityRetry: true,
        createFlowDraftPersistBlocked: true,
        authoritativeBodyLen: 0,
      }),
    ).toBe("FAILED_PREMIUM_CORPUS");
  });

  it("4 — Agreement ready title suppressed when quality retry armed without corpus", () => {
    const shell = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: false,
      isFreeStarterReviewSurface: false,
      premiumPaidDocumentSurface: true,
      paidProAuthoritative: true,
      paidProReviewReadyBase: true,
      guidedCompletionActive: false,
      workspaceProEntitled: true,
      simpleProductFlow: true,
      liveWorkspaceTwoPane: true,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: "review",
      createFlowPhase: "draft_ready_for_review",
      proFullDraftQualityRetry: true,
      createFlowDraftPersistBlocked: true,
      authoritativeBodyLen: 0,
    });
    expect(shell.paidProReviewReady).toBe(true);
    expect(shell.paidProReviewContentReady).toBe(false);
    expect(shell.title).not.toBe("Agreement ready");
    expect(
      computeCreateFlowPaidProReviewContentReady({
        simpleProductFlow: true,
        liveWorkspaceTwoPane: true,
        paidProAuthoritative: true,
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "review",
        createFlowPhase: "draft_ready_for_review",
        workspaceProEntitled: true,
        proFullDraftQualityRetry: true,
        createFlowDraftPersistBlocked: true,
        authoritativeBodyLen: 0,
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
        proFullDraftQualityRetry: true,
      }),
    ).toBe(true);
  });

  it("5 — processing modal exits; CTA must not stay on Structuring key terms", () => {
    expect(resolvePaidProGenerationFailurePostCheckoutPhase()).toBe(null);
    expect(
      isPaidProGenerationProcessingDeadlock({
        premiumPostCheckoutPhase: null,
        qualityRetryActive: true,
        authoritativeBodyLen: 0,
        validationAccepted: false,
      }),
    ).toBe(false);

    expect(intakeSrc).toContain("createFlowDraftPersistError");
    expect(intakeSrc).toContain("qualityRetryActive: proFullDraftQualityRetry");
    expect(intakeSrc).toContain("createFlowDraftPersistBlocked: Boolean(createFlowDraftPersistError");
    expect(intakeSrc).toContain("reviewShellChrome.title");
    expect(intakeSrc).not.toMatch(
      /if \(!paidProFirstReviewCorpusReady\) \{\s*return \{\s*label: resolveProductionTwoPaneLoadingUserCopy\(\)/,
    );
    expect(intakeSrc).toContain("failed_premium_corpus_recover");
    expect(intakeSrc).toContain("draft_limit_reached_recover");
    expect(DRAFT_LOADING_STRUCTURING.toLowerCase()).toContain("structuring");
  });

  it("6 — ensureReviewAgreementWorkspaceId surfaces draft_limit_reached without swallowing", () => {
    const ensureIdx = intakeSrc.indexOf("const ensureReviewAgreementWorkspaceId = React.useCallback");
    const ensureBlock = intakeSrc.slice(ensureIdx, ensureIdx + 3200);
    expect(ensureBlock).toContain("formatPaidCreateFlowDraftPersistFailureMessage");
    expect(ensureBlock).toContain("isDraftLimitReachedPersistError");
    expect(ensureBlock).toContain('reason: isDraftLimitReachedPersistError(e) ? "draft_limit_reached" : "draft_persist_failed"');
    expect(ensureBlock).toContain("setCreateFlowDraftPersistError");
    expect(ensureBlock).toContain("setProFullDraftQualityRetry(true)");
  });
});
