/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
  buildTest519MalformedProfessionalServerBody,
  test519Draft,
} from "./paidProTest519Fixtures";
import { TEST518_PRODUCTION_QUAD_PARTY_INTAKE } from "./paidProTest518Fixtures";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProPipelineAcceptedCorpusHashForTests,
  markPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  evaluateFirstPaidCreatePipelineGate,
  gateFirstPaidCreateCanonicalReviewEntry,
  hasValidatedCorpusForFirstPaidCreateReview,
  planPaidProCreateValidationFailureTerminal,
} from "./paidProFirstPaidCreateFlowRoute";
import { planEnterCanonicalPaidProReviewFlow } from "./enterCanonicalPaidProReviewFlow";
import { resolvePaidProReviewAuthority, resolveValidatedPaidProReviewCorpus } from "./paidProReviewAuthority";
import { resolveGuidedCompletionRenderDocument } from "./guidedDealCompletion/guidedCompletionRenderAuthority";
import { shouldUsePaidCreateFlowReviewFirstPersist } from "./paidProCreateFlowReviewHandoff";
import { CreateUiStage } from "./createUiStage";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
import {
  markPaidDashboardCreateContextForTests,
  clearPaidDashboardCreateContextForTests,
} from "../../launch/paidDashboardCreateContext";

const malformed = buildTest519MalformedProfessionalServerBody();
const ACCEPTED_PAID_BODY = `PROFESSIONAL SERVICES AGREEMENT. ${"Substantive validated clause. ".repeat(95)}`;

describe("TEST515 — first paid create canonical route", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearPaidDashboardCreateContextForTests();
    getOrInitSessionAgreementGenerationId();
    markPaidDashboardCreateContextForTests("dashboard_paid_create");
  });

  afterEach(() => {
    sessionStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearPaidDashboardCreateContextForTests();
  });

  it("freeze prep ok + validation rejected — structural prep does not imply pipeline acceptance", () => {
    const freeze = buildPaidProFreezeCandidate({
      text: malformed,
      draft: test519Draft(),
      intakeText: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
      source: "server_full_draft",
    });
    expect(freeze.ok).toBe(true);
    expect(malformed.length).toBeGreaterThan(2000);

    const validation = validatePaidProOutput({
      text: malformed,
      rawIntake: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
      intentContract: resolveAgreementIntentContract(TEST519_PRODUCTION_QUAD_PARTY_INTAKE),
      draft: test519Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(false);
    expect(validation.reasons.some((r) => r.includes("professional_"))).toBe(true);
    expect(hasValidatedCorpusForFirstPaidCreateReview({
      corpusPlain: malformed,
      pipelineSource: "server_full_draft",
    })).toBe(false);
  });

  it("canonical review entry blocked when validation not latched (TEST515 empty recovery)", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    const plan = planEnterCanonicalPaidProReviewFlow({
      source: "returning_paid_create",
      corpusPlain: malformed,
      pipelineSource: "server_full_draft",
      draft: test519Draft(),
      intakeText: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    expect(plan.shouldApply).toBe(false);
    expect(plan.blockedReason).toBe("validation_not_latched_for_corpus");
  });

  it("evaluateFirstPaidCreatePipelineGate rejects malformed corpus — no canonical entry", () => {
    const gate = evaluateFirstPaidCreatePipelineGate({
      source: "returning_paid_create",
      corpusPlain: malformed,
      pipelineSource: "server_full_draft",
      intakeText: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
      draft: test519Draft(),
    });
    expect(gate.validationOk).toBe(false);
    expect(gate.canEnterCanonicalReview).toBe(false);
    expect(gate.blockedReason).toBe("professional_validation_rejected");
    expect(gate.canonicalPlan.shouldApply).toBe(false);
  });

  it("validated latch unlocks canonical entry for post-checkout source", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    expect(
      hasValidatedCorpusForFirstPaidCreateReview({
        corpusPlain: ACCEPTED_PAID_BODY,
        pipelineSource: "server_full_draft",
      }),
    ).toBe(true);
    const plan = gateFirstPaidCreateCanonicalReviewEntry({
      source: "post_checkout_apply_success",
      corpusPlain: ACCEPTED_PAID_BODY,
      pipelineSource: "server_full_draft",
      draft: test519Draft(),
      intakeText: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    expect(plan.shouldApply).toBe(true);
  });

  it("validation failure terminal does not imply content-ready review", () => {
    const terminal = planPaidProCreateValidationFailureTerminal();
    expect(terminal.proFullDraftQualityRetry).toBe(true);
    expect(terminal.agreementDocumentPlain).toBe("");
    const authority = resolvePaidProReviewAuthority({
      workspaceProEntitled: true,
      simpleProductFlow: true,
      liveWorkspaceTwoPane: true,
      paidProAuthoritative: true,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: "review",
      premiumPaidDocumentSurface: true,
      premiumCheckoutCompleted: false,
      premiumGenerationInFlight: false,
      premiumCorpusValidationFailed: true,
      proFullDraftQualityRetry: true,
    });
    expect(authority!.contentReady).toBe(false);
    expect(authority!.renderAllowed).toBe(false);
  });

  it("4-party intake signer count stays 4 through validation failure (no shrink to 2)", () => {
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: TEST518_PRODUCTION_QUAD_PARTY_INTAKE,
      draftParties: test519Draft().parties,
      corpusPlain: malformed,
    });
    expect(resolution.count).toBe(4);
  });

  it("no review render or persist from unvalidated freeze prep (TEST523 preserved)", () => {
    markPaidProPipelineAcceptedCorpusHash(malformed);
    expect(
      shouldUsePaidCreateFlowReviewFirstPersist({
        draft: test519Draft(),
        pipelineWinningBody: malformed,
      }),
    ).toBe(false);
    const render = resolveGuidedCompletionRenderDocument({
      guidedCompletionActive: false,
      postGuidedAuthoritativeReview: true,
      paidProCreateFlowReviewGate: true,
      validatedCorpusPlain: "",
      pickerPlain: malformed.slice(0, 1286),
      pickerSource: "server_full_document_text",
    });
    expect(render.source).not.toBe("picker_authoritative");
    expect(render.source).toBe("none");
    expect(resolveValidatedPaidProReviewCorpus().len).toBe(0);
  });
});
