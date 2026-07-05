/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  resolveCanonicalPaidCreateFlowReviewCorpusLen,
} from "./authoritativeCreateFlowReviewShell";
import { resolveCreateFlowAcceptedPipelineCorpusPlain } from "./paidProAcceptanceRouting";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { resolveSimpleProFinalReviewActive } from "./simpleProFinalReviewPhase";
import { mapPaidProStickyCtaToPrimaryCta, resolvePaidProStickyCta } from "./paidProStickyCta";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  formatDraftCreateHttpUserMessage,
  readDraftCreateHttpErrorDetail,
} from "./draftCreateHttpError";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  mergeDraftForPaidCreateFlowPersist,
  shouldRecoverPaidCreateFlowFromPersistFailure,
  shouldSuppressPremiumNetworkRecoverableForPaidCreateFlow,
  shouldUsePaidCreateFlowReviewFirstPersist,
} from "./paidProCreateFlowReviewHandoff";
import { shouldAutoPersistReviewAgreementRow } from "./paidProCreateFlowRouting";

const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

const STARTER_PREVIEW = "Starter preview between Red Mesa and Harbor Peak. ".repeat(12);
const ACCEPTED_PAID_BODY = `PROFESSIONAL SERVICES AGREEMENT between Red Mesa Logistics LLC and Harbor Peak Automation LLC. ${"Substantive paid clause. ".repeat(95)}`;

function test499Draft(starterBody: string, paidBody: string): ParsedDraftShape {
  return {
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: starterBody,
    premium_server_full_document_text: paidBody,
    premium_full_document_text: paidBody,
    server_full_document_text: starterBody,
  } as unknown as ParsedDraftShape;
}

describe("TEST499 — returning paid create survives draft-limit 403 with accepted corpus", () => {
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

  it("1 — paid pipeline validation accepted after generation", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    expect(
      shouldUsePaidCreateFlowReviewFirstPersist({
        draft: test499Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY),
        pipelineWinningBody: ACCEPTED_PAID_BODY,
      }),
    ).toBe(true);
  });

  it("2 — intake suppresses Retry Pro draft dead-end when pipeline accepted", () => {
    expect(intake).toContain("shouldSuppressPremiumNetworkRecoverableForPaidCreateFlow");
    const panelIdx = intake.indexOf("const showPremiumNetworkRecoverablePanel = Boolean(");
    const panelBlock = intake.slice(panelIdx, panelIdx + 900);
    expect(panelBlock).toContain("shouldSuppressPremiumNetworkRecoverableForPaidCreateFlow");
    expect(intake).toContain("setPremiumPostCheckoutPhase(null)");
    expect(intake).toContain("setProFullDraftCustomGateMessage(null)");
  });

  it("3 — paid accepted create routes persist through review-first handoff (not free draft cap)", () => {
    const ensureIdx = intake.indexOf("const ensureReviewAgreementWorkspaceId = React.useCallback");
    const ensureBlock = intake.slice(ensureIdx, ensureIdx + 2800);
    expect(ensureBlock).toContain("shouldUsePaidCreateFlowReviewFirstPersist");
    expect(ensureBlock).toContain("mergeDraftForPaidCreateFlowPersist");
    expect(ensureBlock).toContain("reviewFirstHandoffPersist: useReviewFirstPersist");
    expect(intake).toContain("REVIEW_FIRST_PERSIST_REQUEST_HEADER");
  });

  it("4 — mergeDraftForPaidCreateFlowPersist promotes accepted corpus for agreement row", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    const merged = mergeDraftForPaidCreateFlowPersist(
      test499Draft(STARTER_PREVIEW, ""),
      ACCEPTED_PAID_BODY,
    );
    expect(String(merged.purpose ?? "").length).toBeGreaterThan(PAID_PRO_AUTHORITY_MIN_LEN);
    expect(String(merged.premium_server_full_document_text ?? "").length).toBeGreaterThan(1600);
    expect(
      shouldRecoverPaidCreateFlowFromPersistFailure({
        corpusPlain: ACCEPTED_PAID_BODY,
      }),
    ).toBe(true);
  });

  it("5 — final review authoritative body uses accepted corpus >1600", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    const draft = test499Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY);
    const corpusLen = resolveCanonicalPaidCreateFlowReviewCorpusLen({
      draft,
      agreementDocumentText: STARTER_PREVIEW,
      premiumRenderSource: "server_full_draft",
      pipelineWinningBody: ACCEPTED_PAID_BODY,
    });
    expect(corpusLen).toBeGreaterThan(1600);
    const res = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      pickerPlain: STARTER_PREVIEW,
      pipelineWinningPlain: ACCEPTED_PAID_BODY,
      finalReviewAuthorityOnly: true,
      appliedAnswerCount: 0,
    });
    expect(res.plainText.length).toBeGreaterThan(1600);
    expect(res.corpusBlocked).toBeFalsy();
  });

  it("6 — SimpleProFinalReviewScreen path active with review/sign CTAs", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
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
    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    expect(mapPaidProStickyCtaToPrimaryCta(sticky).action).not.toBe("launch_pro_checkout");
    expect(
      isCanonicalPaidCreateFlowFirstReviewActive({
        shellInput: { workspaceProEntitled: false },
        productionDraftPrimaryReviewSurface: true,
        createUiStage: CreateUiStage.DRAFT,
        createFlowPhase: "draft_ready_for_review",
        hasDraft: true,
        draft: test499Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY),
        agreementDocumentText: STARTER_PREVIEW,
        premiumRenderSource: "server_full_draft",
        pipelineWinningBody: ACCEPTED_PAID_BODY,
      }),
    ).toBe(true);
  });

  it("7 — pipeline corpus preferred over starter preview (no empty authoritative body)", () => {
    markPaidProPipelineValidationPassed({ text: ACCEPTED_PAID_BODY, source: "server_full_draft" });
    markPaidProPipelineAcceptedCorpusHash(ACCEPTED_PAID_BODY);
    const plain = resolveCreateFlowAcceptedPipelineCorpusPlain({
      agreementDocumentText: STARTER_PREVIEW,
      draft: test499Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY),
      pipelineWinningBody: ACCEPTED_PAID_BODY,
    });
    expect(plain.length).toBeGreaterThan(1600);
    expect(plain.length).toBeGreaterThan(STARTER_PREVIEW.length);
    expect(
      shouldSuppressPremiumNetworkRecoverableForPaidCreateFlow({
        draft: test499Draft(STARTER_PREVIEW, ACCEPTED_PAID_BODY),
        pipelineWinningBody: ACCEPTED_PAID_BODY,
      }),
    ).toBe(true);
  });

  it("8 — first-time post-checkout and returning create share canonical review entry", () => {
    expect(intake).toContain("establishPaidProSourceOfTruth");
    expect(intake).toContain("enterCanonicalPaidProReviewFlow");
    expect(intake).toContain('source: "post_checkout_apply_success"');
    expect(intake).toContain('source: "returning_paid_create"');
    expect(intake).toContain("commitPostCheckoutCanonicalReviewEntry");
  });

  it("9 — true free users still surface draft_limit_reached on POST /draft; paid dashboard skips persist without corpus", () => {
    markCurrentSessionFreeStarterIntent();
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: true,
        qualityRetryActive: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoPersistReviewAgreementRow({
        hasReviewAgreementId: false,
        skipFreeStarterCreateSubmit: true,
        draft: test499Draft(STARTER_PREVIEW, STARTER_PREVIEW),
        pipelineWinningBody: STARTER_PREVIEW,
      }),
    ).toBe(false);
    expect(
      shouldUsePaidCreateFlowReviewFirstPersist({
        draft: test499Draft(STARTER_PREVIEW, STARTER_PREVIEW),
        pipelineWinningBody: STARTER_PREVIEW,
      }),
    ).toBe(false);
    const msg = formatDraftCreateHttpUserMessage({
      httpStatus: 403,
      httpDetail: "draft_limit_reached: Free workspaces can have up to 2 active drafts.",
      responseBody: {
        detail: {
          code: "draft_limit_reached",
          message: "Free workspaces can have up to 2 active drafts. Finish or upgrade to add another.",
        },
      },
    });
    expect(msg).toMatch(/active drafts/i);
    expect(readDraftCreateHttpErrorDetail({
      httpStatus: 403,
      responseBody: { detail: { code: "draft_limit_reached" } },
    })?.code).toBe("draft_limit_reached");
  });
});
