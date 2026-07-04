/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateWorkspaceProEntitlementCache } from "../../agreement/agreementProFunnelGate";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { clearCurrentSessionProEntitlementMarkers, markCurrentSessionFreeStarterIntent } from "./paidProSessionEligibility";
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
  resolveCanonicalPaidCreateFlowReviewCorpusLen,
} from "./authoritativeCreateFlowReviewShell";
import {
  commitPaidProAcceptanceStorageHygiene,
  resolveCreateFlowAcceptedPipelineCorpusPlain,
  shouldApplyCreateFlowPaidFirstReviewRouting,
  shouldOpenCanonicalPaidCreateFlowFirstReview,
} from "./paidProAcceptanceRouting";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { resolveSimpleProFinalReviewActive } from "./simpleProFinalReviewPhase";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import { resolveFreeStarterReviewShellActive } from "./freeStarterReviewShell";
import { shouldShowCreateFlowStarterProRefineUpsell } from "./authoritativeCreateFlowReviewShell";
import { hasPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import { mapPaidProStickyCtaToPrimaryCta, resolvePaidProStickyCta } from "./paidProStickyCta";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const TEST498_INTAKE = `
Draft a Professional Services Agreement between Red Mesa Logistics LLC (Client) and Harbor Peak Automation LLC (Service Provider).
Total fee: $96,000. Term: 12 months. Governing law: Delaware.
Authorized signers:
* Sarah Mitchell, CEO, Red Mesa Logistics LLC
* Michael Torres, President, Harbor Peak Automation LLC
`.trim();

const STARTER_PREVIEW = "Starter preview between Red Mesa and Harbor Peak. ".repeat(12);
const ACCEPTED_PAID_BODY = `PROFESSIONAL SERVICES AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"Substantive paid clause. ".repeat(95)}`;

function test498Draft(starterBody: string, paidBody: string): ParsedDraftShape {
  return {
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    premium_server_full_document_text: paidBody,
    premium_full_document_text: paidBody,
    server_full_document_text: starterBody,
  } as unknown as ParsedDraftShape;
}

describe("TEST498 — returning paid /app/create mounts first-time post-checkout Pro review UX", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    invalidateWorkspaceProEntitlementCache();
    getOrInitSessionAgreementGenerationId();
    markCurrentSessionFreeStarterIntent();
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

  it("after accepted pipeline, shouldApplyCreateFlowPaidFirstReviewRouting opens canonical first review", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    expect(
      shouldApplyCreateFlowPaidFirstReviewRouting({
        alreadyOpened: false,
        premiumRenderSource: "server_full_draft",
        pipelineWinningBody: ACCEPTED_PAID_BODY,
        agreementDocumentText: STARTER_PREVIEW,
        draft: test498Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY),
      }),
    ).toBe(true);
    expect(shouldOpenCanonicalPaidCreateFlowFirstReview({
      premiumRenderSource: "server_full_draft",
      acceptedBodyLen: ACCEPTED_PAID_BODY.length,
    })).toBe(true);
  });

  it("authority-only final review uses pipeline corpus when hydrated authoritative body is empty", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    const res = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      pickerPlain: STARTER_PREVIEW,
      pipelineWinningPlain: ACCEPTED_PAID_BODY,
      finalReviewAuthorityOnly: true,
      appliedAnswerCount: 0,
    });
    expect(res.plainText.length).toBeGreaterThan(1500);
    expect(res.corpusBlocked).toBeFalsy();
    expect(res.source).toBe("picker_authoritative");
  });

  it("pipeline-accepted create flow blocks starter shell and conversion UI", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    const shellInput = { workspaceProEntitled: false };
    expect(isCreateFlowPaidAcceptedOrAuthoritativeActive(shellInput)).toBe(true);
    expect(
      resolveFreeStarterReviewShellActive({
        ...shellInput,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: true,
        paidProAuthoritative: false,
        draft: test498Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY),
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(false);
    expect(
      shouldShowCreateFlowStarterProRefineUpsell({
        shellInput,
        hasPaidPremiumCompletionSession,
        authoritativePremiumUiCommitted: false,
        paidProAuthoritative: false,
        suppressIntakePremiumUpsell: false,
        proAgreementEntitled: false,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        belowDocumentRefineSectionParentEligible: true,
        premiumPaidDocumentSurface: true,
        showStarterProRefineUpsellCardEligible: true,
      }),
    ).toBe(false);
  });

  it("canonical first review active with pipeline corpus and applied guided phase", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    const draft = test498Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY);
    const corpusLen = resolveCanonicalPaidCreateFlowReviewCorpusLen({
      draft,
      agreementDocumentText: STARTER_PREVIEW,
      premiumRenderSource: "server_full_draft",
      pipelineWinningBody: ACCEPTED_PAID_BODY,
    });
    expect(corpusLen).toBeGreaterThan(PAID_PRO_AUTHORITY_MIN_LEN);
    expect(
      isCanonicalPaidCreateFlowFirstReviewActive({
        shellInput: { workspaceProEntitled: false },
        productionDraftPrimaryReviewSurface: true,
        createUiStage: CreateUiStage.DRAFT,
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        draft,
        agreementDocumentText: STARTER_PREVIEW,
        premiumRenderSource: "server_full_draft",
        pipelineWinningBody: ACCEPTED_PAID_BODY,
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

  it("review_decision sticky CTA exposes prepare/sign path after pipeline acceptance", () => {
    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(sticky.phase).toBe("review_decision");
    expect(mapPaidProStickyCtaToPrimaryCta(sticky).action).not.toBe("launch_pro_checkout");
  });

  it("authorized signer bullets hydrate Sarah Mitchell and Michael Torres", () => {
    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test498_intake",
      legalEntities: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
      intakeText: TEST498_INTAKE,
      corpusText: ACCEPTED_PAID_BODY,
      authoritativePartyCount: 2,
    });
    expect(seed.names[0]).toMatch(/Sarah Mitchell/i);
    expect(seed.titles[0]).toMatch(/CEO/i);
    expect(seed.names[1]).toMatch(/Michael Torres/i);
    expect(seed.titles[1]).toMatch(/President/i);
  });

  it("resolveCreateFlowAcceptedPipelineCorpusPlain prefers pipeline over starter preview", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    const plain = resolveCreateFlowAcceptedPipelineCorpusPlain({
      agreementDocumentText: STARTER_PREVIEW,
      draft: test498Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY),
      pipelineWinningBody: ACCEPTED_PAID_BODY,
    });
    expect(plain.length).toBeGreaterThan(1600);
    expect(plain).not.toBe(STARTER_PREVIEW.trim());
    commitPaidProAcceptanceStorageHygiene();
  });
});
