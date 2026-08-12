/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  markPaidDashboardCreateContextForTests,
  clearPaidDashboardCreateContextForTests,
} from "../../launch/paidDashboardCreateContext";
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
} from "./paidProPipelineAcceptedCorpus";
import {
  resolvePaidProReviewAuthority,
  resolveValidatedPaidProReviewCorpus,
} from "./paidProReviewAuthority";
import { resolveGuidedCompletionRenderDocument } from "./guidedDealCompletion/guidedCompletionRenderAuthority";
import {
  resetGuidedFinalReviewAuthoritativeBodyLogDedupeForTests,
  resolveGuidedFinalReviewAuthoritativeBody,
} from "./guidedDealCompletion/guidedFinalReviewAuthoritativeBody";
import {
  resolveCreateFlowAuthoritativeReviewPlain,
} from "./authoritativeCreateFlowReviewShell";
import {
  resolveCreateFlowPaidAcceptedCorpusPlain,
  shouldUsePaidCreateFlowReviewFirstPersist,
} from "./paidProCreateFlowReviewHandoff";
import { resolveCreateFlowAcceptedPipelineCorpusPlain } from "./paidProAcceptanceRouting";
import { CreateUiStage } from "./createUiStage";
import { clearCurrentSessionProEntitlementMarkers } from "./paidProSessionEligibility";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { invalidateWorkspaceProEntitlementCache } from "../../agreement/agreementProFunnelGate";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";

const malformed = buildTest519MalformedProfessionalServerBody();
const STARTER_PREVIEW = "Starter preview fragment. ".repeat(54); // ~1286 chars
const ACCEPTED_PAID_BODY = `PROFESSIONAL SERVICES AGREEMENT. ${"Substantive validated clause. ".repeat(95)}`;

describe("TEST523 — returning paid create bypasses removed after validation rejection", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearPaidDashboardCreateContextForTests();
    resetGuidedFinalReviewAuthoritativeBodyLogDedupeForTests();
    invalidateWorkspaceProEntitlementCache();
    getOrInitSessionAgreementGenerationId();
    markPaidDashboardCreateContextForTests("founder_top_nav_create");
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearPaidDashboardCreateContextForTests();
    clearCurrentSessionProEntitlementMarkers();
    invalidateWorkspaceProEntitlementCache();
  });

  it("validation rejects malformed ~2.3k server draft — hash alone is not acceptance", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    const validation = validatePaidProOutput({
      text: malformed,
      rawIntake: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
      intentContract: resolveAgreementIntentContract(TEST519_PRODUCTION_QUAD_PARTY_INTAKE),
      draft: test519Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(false);
    expect(malformed.length).toBeGreaterThan(2000);
    expect(hasPaidCreateFlowPipelineAcceptance()).toBe(false);
    expect(resolveValidatedPaidProReviewCorpus().len).toBe(0);
  });

  it("guided render authority does NOT choose picker_authoritative without validated corpus", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    const draft = test519Draft();
    draft.premium_server_full_document_text = malformed;
    draft.premium_full_document_text = malformed;

    const render = resolveGuidedCompletionRenderDocument({
      guidedCompletionActive: false,
      postGuidedAuthoritativeReview: true,
      paidProCreateFlowReviewGate: true,
      validatedCorpusPlain: "",
      authoritativeHydratedPlain: malformed,
      pickerPlain: malformed.slice(0, 1286),
      pickerSource: "server_full_document_text",
      agreementDocumentPlain: malformed,
      renderedPreviewPlain: STARTER_PREVIEW,
      lastKnownGoodPlain: malformed.slice(0, 1948),
    });
    expect(render.source).not.toBe("picker_authoritative");
    expect(render.source).toBe("none");
    expect(render.plainText).toBe("");
  });

  it("review-first persist does NOT fire on session entitlement alone", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    const draft = test519Draft();
    expect(
      shouldUsePaidCreateFlowReviewFirstPersist({
        draft,
        agreementDocumentText: malformed,
        pipelineWinningBody: malformed,
        hydratedPremiumBody: malformed,
      }),
    ).toBe(false);
    expect(
      resolveCreateFlowAcceptedPipelineCorpusPlain({
        draft,
        agreementDocumentText: malformed,
        pipelineWinningBody: malformed,
      }).length,
    ).toBe(0);
    expect(
      resolveCreateFlowPaidAcceptedCorpusPlain({
        draft,
        agreementDocumentText: malformed,
        pipelineWinningBody: malformed,
        premiumDeliverablePlain: malformed,
      }).length,
    ).toBe(0);
  });

  it("authoritative review plain rejects unvalidated draft field fragments", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    const draft = test519Draft();
    draft.premium_server_full_document_text = malformed;
    expect(
      resolveCreateFlowAuthoritativeReviewPlain({
        draft,
        agreementDocumentText: STARTER_PREVIEW,
        pipelineWinningBody: malformed,
        hydratedPremiumBody: malformed.slice(0, 1948),
      }),
    ).toBe("");
  });

  it("guided final review authoritative body is none without validated pipeline", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    const resolution = resolveGuidedFinalReviewAuthoritativeBody({
      candidates: [
        { source: "picker_authoritative", body: malformed.slice(0, 1286) },
        { source: "server_full_document_text", body: malformed },
        { source: "agreement_document", body: STARTER_PREVIEW },
      ],
      minLen: GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN,
    });
    expect(resolution.source).toBe("none");
    expect(resolution.len).toBe(0);
  });

  it("paidProReviewAuthority is sole shell decision — no Agreement ready after rejection", () => {
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
    expect(authority!.validatedCorpus.len).toBe(0);
  });

  it("validated first-time-paid path remains green after validation success", () => {
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    expect(hasPaidCreateFlowPipelineAcceptance()).toBe(true);
    expect(resolveValidatedPaidProReviewCorpus().len).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);

    const render = resolveGuidedCompletionRenderDocument({
      guidedCompletionActive: false,
      postGuidedAuthoritativeReview: true,
      paidProCreateFlowReviewGate: true,
      validatedCorpusPlain: ACCEPTED_PAID_BODY,
      pickerPlain: STARTER_PREVIEW,
      pickerSource: "preview_premium_deliverable",
    });
    expect(render.source).toBe("authoritative_hydrated_premium");
    expect(render.plainText.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);

    expect(
      shouldUsePaidCreateFlowReviewFirstPersist({
        pipelineWinningBody: ACCEPTED_PAID_BODY,
      }),
    ).toBe(true);

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
    // Product copy contract: paid Pro review shell uses "Agreement draft ready"
    // (see PAID_PRO_REVIEW_SHELL_TITLE / paidProReviewUxCopy).
    expect(authority!.shellTitle).toBe("Draft created—review recommended");
  });
});
