/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
import {
  extractPremiumApiServerCorpusText,
  logPremiumApiResultFromWire,
  premiumApiResultHasAuthoritativeServerCorpus,
} from "./premiumApiHandoff";
import {
  normalizePremiumFullDraftResponsePayload,
  premiumWireServerFullPromotionInvariantViolated,
  promoteSubstantiveDegradedJsonParseWireToServerFull,
} from "./premiumFullDraftResponseNormalization";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { shouldTreatEntitledRewritePipelineResultAsGenerationFailure } from "./paidProEntitledRewriteLaunch";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import * as deterministicFallback from "./deterministicQuadPartyProFallback";
import {
  buildTest521DegradedJsonParseDocumentTextOnlyWire,
  buildTest521SubstantiveDegradedDocumentBody,
  TEST521_INTAKE,
  TEST521_TARGET_DOCUMENT_LEN,
  test521Draft,
} from "./paidProTest521Fixtures";

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
    postPremiumFullDraftOnce: () => Promise.reject(new Error("test521_no_second_post")),
  };
});

beforeEach(() => {
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumParseSessionGuard();
  clearPremiumGenerationCallAudit();
  premiumApiMock.mockResponses = [];
  premiumApiMock.callIndex = 0;
  vi.restoreAllMocks();
});

describe("TEST521 — degraded json_parse promotes document_text to server_full", () => {
  it("normalizePremiumFullDraftResponsePayload sets server_full_document_text and camelCase alias", () => {
    const wire = buildTest521DegradedJsonParseDocumentTextOnlyWire();
    const normalized = normalizePremiumFullDraftResponsePayload(wire);
    expect(String(normalized.wire.server_full_document_text ?? "").length).toBeGreaterThanOrEqual(
      TEST521_TARGET_DOCUMENT_LEN - 5,
    );
    expect(String((normalized.wire as Record<string, unknown>).serverFullDocumentText ?? "").length).toBeGreaterThanOrEqual(
      TEST521_TARGET_DOCUMENT_LEN - 5,
    );
    expect(premiumApiResultHasAuthoritativeServerCorpus(normalized.wire)).toBe(true);
    expect(premiumWireServerFullPromotionInvariantViolated(normalized.wire)).toBe(false);
  });

  it("premium-api-result reflects post-normalization serverLen ~10528", () => {
    const normalized = normalizePremiumFullDraftResponsePayload(
      buildTest521DegradedJsonParseDocumentTextOnlyWire(),
    );
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("MODE", "development");
    logPremiumApiResultFromWire({ ok: true, status: 200, wire: normalized.wire });
    const apiResult = logSpy.mock.calls.find((call) => call[0] === "[premium-api-result]")?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(apiResult?.hasAuthoritativeServerDocument).toBe(true);
    expect(apiResult?.hasServerFullDocumentText).toBe(true);
    expect(Number(apiResult?.serverLen)).toBeGreaterThanOrEqual(TEST521_TARGET_DOCUMENT_LEN - 5);
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  it("promoteSubstantiveDegradedJsonParseWireToServerFull yields extractable server corpus", () => {
    const promotion = promoteSubstantiveDegradedJsonParseWireToServerFull(
      buildTest521DegradedJsonParseDocumentTextOnlyWire(),
    );
    expect(promotion.promoted).toBe(true);
    expect(promotion.body.length).toBeGreaterThanOrEqual(TEST521_TARGET_DOCUMENT_LEN - 5);
    expect(extractPremiumApiServerCorpusText(promotion.wire).length).toBeGreaterThanOrEqual(
      TEST521_TARGET_DOCUMENT_LEN - 5,
    );
  });

  it("pipeline keeps substantive freeze candidate and avoids thin fallback", async () => {
    premiumApiMock.mockResponses = [buildTest521DegradedJsonParseDocumentTextOnlyWire()];
    const fallbackSpy = vi.spyOn(deterministicFallback, "logDeterministicProFallbackDecision");

    const out = await runPremiumCompletion({
      intakeText: TEST521_INTAKE,
      originalUserIntakeRawForMerge: TEST521_INTAKE,
      structuredDraft: test521Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test521-server-full-promotion",
      premiumRequestIntakeFingerprint: "fp-test521",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test521Draft(),
    });

    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(
      TEST521_TARGET_DOCUMENT_LEN - 500,
    );
    expect(out.premiumRenderSource).toMatch(/server_full_draft/);
    expect(shouldTreatEntitledRewritePipelineResultAsGenerationFailure(out)).toBe(false);
    expect(out.premiumDraft.premium_server_full_document_text?.trim().length ?? 0).toBeGreaterThanOrEqual(
      TEST521_TARGET_DOCUMENT_LEN - 500,
    );

    const freeze = buildPaidProFreezeCandidate({
      text: out.winningPremiumBodyText,
      draft: test521Draft(),
      intakeText: TEST521_INTAKE,
      source: "server_full_draft",
      surface: "test521_freeze_candidate",
    });
    expect(freeze.text.length).toBeGreaterThanOrEqual(TEST521_TARGET_DOCUMENT_LEN - 2000);

    expect(
      fallbackSpy.mock.calls.some((call) => call[0] === "deterministic_pro_fallback_accepted"),
    ).toBe(false);
  });

  it("buildTest521 body matches production target length", () => {
    expect(buildTest521SubstantiveDegradedDocumentBody().length).toBe(TEST521_TARGET_DOCUMENT_LEN);
  });
});
