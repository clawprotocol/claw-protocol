/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateWorkspaceProEntitlementCache,
} from "../../agreement/agreementProFunnelGate";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { clearCurrentSessionProEntitlementMarkers } from "./paidProSessionEligibility";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { CreateUiStage } from "./createUiStage";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { markPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  isCanonicalPaidCreateFlowFirstReviewActive,
  isCreateFlowPaidAcceptedOrAuthoritativeActive,
  shouldBlockLaunchProCheckoutForPaidCreateFlowReview,
} from "./authoritativeCreateFlowReviewShell";
import { shouldOpenCanonicalPaidCreateFlowFirstReview } from "./paidProAcceptanceRouting";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { resolveSimpleProFinalReviewActive } from "./simpleProFinalReviewPhase";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import { mapPaidProStickyCtaToPrimaryCta } from "./paidProStickyCta";
import { resolvePaidProStickyCta } from "./paidProStickyCta";

const TEST497_INTAKE = `
Draft a Professional Services Agreement between Red Mesa Logistics LLC (Client) and Harbor Peak Automation LLC (Service Provider).
Total fee: $96,000. Term: 12 months. Governing law: Delaware.
Authorized signers:
* Sarah Mitchell, CEO, Red Mesa Logistics LLC
* Michael Torres, President, Harbor Peak Automation LLC
`.trim();

const ACCEPTED_PAID_BODY = `SERVICES AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"Substantive paid clause. ".repeat(90)}`;

describe("TEST497 — returning paid create converges to post-checkout first Pro review workflow", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    invalidateWorkspaceProEntitlementCache();
    getOrInitSessionAgreementGenerationId();
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
    vi.restoreAllMocks();
  });

  it("post-acceptance routing opens canonical first review for pipeline-accepted returning paid body", () => {
    expect(
      shouldOpenCanonicalPaidCreateFlowFirstReview({
        premiumRenderSource: "server_full_draft",
        acceptedBodyLen: ACCEPTED_PAID_BODY.length,
      }),
    ).toBe(true);
    expect(
      resolveSimpleProFinalReviewActive({
        paidProAuthoritative: false,
        premiumPaidDocumentSurface: true,
        premiumRecipientUxActive: false,
        createFlowPhase: "draft_ready_for_review",
        guidedCompletionPhase: "applied",
        canonicalCreateFlowFirstReviewActive: true,
        finalReviewExplicitlyOpened: true,
      }),
    ).toBe(true);
  });

  it("authority-only final review uses validated picker corpus when hydrated authoritative plain is empty", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    const res = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      pickerPlain: ACCEPTED_PAID_BODY,
      finalReviewAuthorityOnly: true,
      appliedAnswerCount: 0,
    });
    expect(res.plainText.length).toBeGreaterThan(1500);
    expect(res.source).toBe("picker_authoritative");
    expect(res.corpusBlocked).toBeFalsy();
  });

  it("returning paid accepted generation blocks checkout and degraded continue_to_recipients CTA", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    const shellInput = { workspaceProEntitled: false };
    expect(isCreateFlowPaidAcceptedOrAuthoritativeActive(shellInput)).toBe(true);
    const firstReviewActive = isCanonicalPaidCreateFlowFirstReviewActive({
      shellInput,
      productionDraftPrimaryReviewSurface: true,
      createUiStage: CreateUiStage.DRAFT,
      createFlowPhase: "draft_ready_for_review",
      hasDraft: true,
      pipelineWinningBody: ACCEPTED_PAID_BODY,
      premiumRenderSource: "server_full_draft",
    });
    expect(firstReviewActive).toBe(true);
    expect(
      shouldBlockLaunchProCheckoutForPaidCreateFlowReview({
        shellInput,
        canonicalFirstReviewActive: firstReviewActive,
      }),
    ).toBe(true);
    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(mapPaidProStickyCtaToPrimaryCta(sticky).action).not.toBe("launch_pro_checkout");
    expect(sticky.phase).toBe("review_decision");
  });

  it("signer metadata seed hydrates Sarah Mitchell and Michael Torres from intake", () => {
    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test497_intake",
      legalEntities: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      intakeText: TEST497_INTAKE,
      corpusText: ACCEPTED_PAID_BODY,
      authoritativePartyCount: 2,
    });
    expect(seed.names[0]).toMatch(/Sarah Mitchell/i);
    expect(seed.titles[0]).toMatch(/CEO/i);
    expect(seed.names[1]).toMatch(/Michael Torres/i);
    expect(seed.titles[1]).toMatch(/President/i);
  });
});
