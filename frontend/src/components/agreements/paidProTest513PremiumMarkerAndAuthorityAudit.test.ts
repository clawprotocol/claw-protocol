/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId, shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  assertPaidReviewSessionPremiumGenerationBeforeCanonicalFreeze,
  readPaidReviewSessionCorpusInvariant,
  resetPaidReviewSessionCorpusInvariantForTests,
} from "./paidProReviewSessionCorpusInvariant";
import { ensurePremiumCompletion } from "./premiumCompletionEnsure";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { persistPremiumCompletionSnapshot } from "./premiumCompletionStorage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { authoritativePremiumPipelineResultForUiApply } from "./premiumPostCheckoutApplyEligible";
import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";

const SERVER_PAID_BODY = `IMPLEMENTATION AGREEMENT between Summit Ridge Advisory Group LLC and Delta Integration Services LLC. ${"Substantive paid operative clause. ".repeat(95)}`;
const TEST513_INTAKE = "Implementation agreement between Summit Ridge and Delta Integration";

const premiumApiMock = vi.hoisted(() => ({
  mockResponses: [] as PremiumFullDraftResult[],
  callIndex: 0,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      const r =
        premiumApiMock.mockResponses[premiumApiMock.callIndex] ??
        premiumApiMock.mockResponses[premiumApiMock.mockResponses.length - 1];
      premiumApiMock.callIndex += 1;
      return r
        ? Promise.resolve({ ok: true as const, result: r })
        : Promise.resolve({
            ok: false as const,
            failure_kind: "http" as const,
            retryable: false,
            error_code: "test_mode_skipped",
            document_text: "" as const,
            attemptCount: 0,
          });
    },
    postPremiumFullDraftOnce: () => {
      const r =
        premiumApiMock.mockResponses[premiumApiMock.callIndex] ??
        premiumApiMock.mockResponses[premiumApiMock.mockResponses.length - 1];
      premiumApiMock.callIndex += 1;
      return r ? Promise.resolve(r) : Promise.reject(new Error("no_mock"));
    },
  };
});

function test513Draft(body = SERVER_PAID_BODY): ParsedDraftShape {
  return {
    title: "Implementation Agreement",
    jurisdiction: "Delaware",
    parties: [
      { name: "Summit Ridge Advisory Group LLC", role: "Client" },
      { name: "Delta Integration Services LLC", role: "Service Provider" },
    ],
    purpose: body,
    payment_terms: "$240,000",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: true },
    premium_server_full_document_text: body,
  };
}

describe("TEST513 — premium marker timing + canonical freeze gate", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    resetPaidReviewSessionCorpusInvariantForTests();
    premiumApiMock.mockResponses = [];
    premiumApiMock.callIndex = 0;
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearFrozenPremiumSessionBodiesForTests();
    resetPaidReviewSessionCorpusInvariantForTests();
    vi.restoreAllMocks();
  });

  it("1 — stale / invalid premium completion does not latch premium generation marker", async () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    const result = await ensurePremiumCompletion({
      intakeText: TEST513_INTAKE,
      structuredDraft: test513Draft(),
      agreementFamily: "services_agreement",
      guidedFlowId: null,
      simpleProductFlow: true,
      partyRoleLabels: { relationship: "unset", label1: "Party 1", label2: "Party 2" },
      parseDraft: async (raw) => ({
        ...test513Draft(raw),
        premium_server_full_document_text: SERVER_PAID_BODY,
      }),
      userGapAnswers: null,
      gapResolverSkippedWithDefaults: true,
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: "test513-stale",
      isPremiumRequestStillValid: () => false,
      premiumGenerationCallReason: "entitled_rewrite",
    });
    expect(authoritativePremiumPipelineResultForUiApply(result)).toBe(false);
    expect(readPaidReviewSessionCorpusInvariant(generationId)?.premiumGenerationMarked).not.toBe(true);
  });

  it("2 — authoritative pipeline success latches marker after completion, not before entry", async () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    premiumApiMock.mockResponses = [
      {
        title: "Implementation Agreement",
        agreement_family: "services_agreement",
        document_text: SERVER_PAID_BODY.slice(0, 600),
        server_full_document_text: SERVER_PAID_BODY,
        key_terms_found: ["payment"],
        missing_material_info: [],
        generation_outcome: "ok",
      },
    ];
    expect(readPaidReviewSessionCorpusInvariant(generationId)?.premiumGenerationMarked).not.toBe(true);

    const result = await ensurePremiumCompletion({
      intakeText: TEST513_INTAKE,
      structuredDraft: test513Draft(),
      agreementFamily: "services_agreement",
      guidedFlowId: null,
      simpleProductFlow: true,
      partyRoleLabels: { relationship: "unset", label1: "Party 1", label2: "Party 2" },
      parseDraft: async (raw) => ({
        ...test513Draft(raw),
        premium_server_full_document_text: SERVER_PAID_BODY,
      }),
      userGapAnswers: null,
      gapResolverSkippedWithDefaults: true,
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: shortIntakeFingerprint(TEST513_INTAKE),
      isPremiumRequestStillValid: () => true,
      premiumGenerationCallReason: "entitled_rewrite",
    });

    expect(authoritativePremiumPipelineResultForUiApply(result)).toBe(true);
    expect(readPaidReviewSessionCorpusInvariant(generationId)?.premiumGenerationMarked).toBe(true);
    expect(readPaidReviewSessionCorpusInvariant(generationId)?.premiumGenerationSource).toBe(
      "ensure_premium_completion",
    );
  });

  it("3 — accepted snapshot hydration latches marker only when snapshot is authoritative", async () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    persistPremiumCompletionSnapshot({
      premiumDraft: test513Draft(),
      premiumParties: test513Draft().parties!.map((p) => ({ name: p.name!, role: p.role! })),
      recipientCandidates: [],
      premiumWinningBodyText: SERVER_PAID_BODY,
      premiumReadonlyPlainText: SERVER_PAID_BODY,
      premiumAccepted: true,
      premiumPipelineRenderSource: "server_full_draft",
      agreementGenerationId: generationId,
      intakeTextFingerprint: shortIntakeFingerprint(TEST513_INTAKE),
    });

    await ensurePremiumCompletion({
      intakeText: TEST513_INTAKE,
      structuredDraft: test513Draft(),
      agreementFamily: "services_agreement",
      guidedFlowId: null,
      simpleProductFlow: true,
      partyRoleLabels: { relationship: "unset", label1: "Party 1", label2: "Party 2" },
      parseDraft: async (raw) => test513Draft(raw),
      userGapAnswers: null,
      gapResolverSkippedWithDefaults: true,
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: shortIntakeFingerprint(TEST513_INTAKE),
      isPremiumRequestStillValid: () => true,
      premiumGenerationCallReason: "entitled_rewrite",
    });

    expect(readPaidReviewSessionCorpusInvariant(generationId)?.premiumGenerationMarked).toBe(true);
    expect(readPaidReviewSessionCorpusInvariant(generationId)?.premiumGenerationSource).toBe(
      "ensure_premium_completion_snapshot",
    );
  });

  it("4 — recoverable network failure result does not satisfy canonical-freeze premium gate", () => {
    const generationId = getOrInitSessionAgreementGenerationId();
    const recoverable: PremiumCompletionResult = {
      premiumDraft: null,
      premiumParties: null,
      recipientCandidates: [],
      winningPremiumBodyText: SERVER_PAID_BODY,
      premiumRenderSource: "premium_network_retryable",
      premiumReview: null,
      premiumFinalizeAudit: null,
      premiumReviewRoute: null,
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: "test513",
      staleIntakeOrGeneration: false,
      founderDetailsGateMessage: null,
      proIntentGateMessage: null,
      serverGenerationDegraded: null,
      premiumNetworkRetryable: true,
    };
    expect(authoritativePremiumPipelineResultForUiApply(recoverable)).toBe(false);
    expect(() =>
      assertPaidReviewSessionPremiumGenerationBeforeCanonicalFreeze({
        reviewSessionId: generationId,
        source: "server_full_document_text",
        tier: "pro",
      }),
    ).toThrow(/ensurePremiumCompletion premium generation/);
  });
});
