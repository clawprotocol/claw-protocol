/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  buildTest519MalformedProfessionalServerBody,
  TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
  test519Draft,
} from "./paidProTest519Fixtures";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { hasPaidCreateFlowPipelineAcceptance } from "./paidCreateFlowPipelineAcceptanceProbe";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProPipelineAcceptedCorpusHashForTests,
  markPaidProPipelineAcceptedCorpusHash,
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import {
  hasAcceptedPipelineReviewCorpusForRender,
  readAcceptedPipelineReviewCorpusPlain,
} from "./paidProAcceptedPipelineReviewCorpus";
import {
  resolvePaidProReviewAuthority,
  resolveValidatedPaidProReviewCorpus,
} from "./paidProReviewAuthority";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { computeCreateFlowPaidProReviewContentReady } from "./authoritativeCreateFlowReviewShell";
import { CreateUiStage } from "./createUiStage";
import { clearCurrentSessionProEntitlementMarkers } from "./paidProSessionEligibility";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";

const malformed = buildTest519MalformedProfessionalServerBody();

describe("TEST522 — single Paid Pro review authority", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
  });

  it("hash alone without validation is NOT pipeline acceptance", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    expect(readPaidProPipelineAcceptedCorpusHash()).not.toBeNull();
    expect(hasPaidCreateFlowPipelineAcceptance()).toBe(false);
    expect(readAcceptedPipelineReviewCorpusPlain()).toBe("");
    expect(hasAcceptedPipelineReviewCorpusForRender()).toBe(false);
  });

  it("validation rejection leaves no renderable corpus despite ~2k server body", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    const validation = validatePaidProOutput({
      text: malformed,
      rawIntake: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
      intentContract: resolveAgreementIntentContract(TEST519_PRODUCTION_QUAD_PARTY_INTAKE),
      draft: test519Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(false);
    expect(resolveValidatedPaidProReviewCorpus().len).toBe(0);
    const corpus = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: malformed,
      finalReviewAuthorityOnly: true,
      pipelineWinningPlain: malformed,
    });
    expect(corpus.plainText).toBe("");
    expect(corpus.corpusBlocked).toBe(true);
  });

  it("authority snapshot is consistent — no Agreement ready without validated corpus", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    const authority = resolvePaidProReviewAuthority({
      workspaceProEntitled: true,
      simpleProductFlow: true,
      liveWorkspaceTwoPane: true,
      paidProAuthoritative: true,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: "review",
      createFlowPhase: "draft_ready_for_review",
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: false,
      premiumGenerationInFlight: false,
      premiumCorpusValidationFailed: true,
      proFullDraftQualityRetry: true,
    });
    expect(authority).not.toBeNull();
    expect(authority!.contentReady).toBe(false);
    expect(authority!.renderAllowed).toBe(false);
    expect(authority!.shellTitle).not.toBe("Agreement ready");
    expect(authority!.reviewState).toBe("FAILED_PREMIUM_CORPUS");
    expect(
      computeCreateFlowPaidProReviewContentReady({
        simpleProductFlow: true,
        liveWorkspaceTwoPane: true,
        paidProAuthoritative: true,
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "review",
        workspaceProEntitled: true,
        proFullDraftQualityRetry: true,
      }),
    ).toBe(false);
  });

  it("validated acceptance unlocks render consistently across gates", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    markPaidProPipelineValidationPassed({ text: malformed, source: "server_full_draft" });
    expect(hasPaidCreateFlowPipelineAcceptance()).toBe(true);
    expect(readAcceptedPipelineReviewCorpusPlain().length).toBeGreaterThan(1500);
    const validated = resolveValidatedPaidProReviewCorpus();
    expect(validated.len).toBeGreaterThan(1500);
    const authority = resolvePaidProReviewAuthority({
      workspaceProEntitled: true,
      simpleProductFlow: true,
      liveWorkspaceTwoPane: true,
      paidProAuthoritative: true,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: "review",
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: true,
      premiumGenerationInFlight: false,
      premiumCorpusValidationFailed: false,
    });
    expect(authority!.contentReady).toBe(true);
    expect(authority!.renderAllowed).toBe(true);
    expect(authority!.shellTitle).toBe("Agreement ready");
  });
});
