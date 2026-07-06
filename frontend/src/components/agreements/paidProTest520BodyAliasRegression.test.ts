/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { rejectPremiumDegradedFiller } from "./premiumFullDraftClientAcceptance";
import {
  extractPremiumApiServerCorpusText,
  logPremiumApiResultFromWire,
  premiumApiResultHasAuthoritativeServerCorpus,
} from "./premiumApiHandoff";
import {
  normalizePremiumFullDraftResponsePayload,
  resolvePremiumFullDraftAuthoritativeBody,
} from "./premiumFullDraftResponseNormalization";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { shouldTreatEntitledRewritePipelineResultAsGenerationFailure } from "./paidProEntitledRewriteLaunch";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import * as deterministicFallback from "./deterministicQuadPartyProFallback";
import {
  buildTest520DegradedJsonParseDocumentTextOnlyWire,
  buildTest520SubstantiveDegradedDocumentBody,
  TEST520_INTAKE,
  TEST520_TARGET_DOCUMENT_LEN,
  test520Draft,
} from "./paidProTest520Fixtures";

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
    postPremiumFullDraftOnce: () => Promise.reject(new Error("test520_no_second_post")),
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

describe("TEST520 — degraded json_parse document_text authority regression", () => {
  it("repeated good-faith filler heuristics do not reject substantive degraded wire body", () => {
    const body = buildTest520SubstantiveDegradedDocumentBody();
    expect(body.length).toBeGreaterThanOrEqual(TEST520_TARGET_DOCUMENT_LEN - 5);
    expect(rejectPremiumDegradedFiller(body).ok).toBe(false);

    const resolved = resolvePremiumFullDraftAuthoritativeBody(
      buildTest520DegradedJsonParseDocumentTextOnlyWire(),
    );
    expect(resolved.hasAuthoritativeServerDocument).toBe(true);
    expect(resolved.sourceField).toBe("document_text");
    expect(resolved.text.length).toBeGreaterThanOrEqual(TEST520_TARGET_DOCUMENT_LEN - 5);
  });

  it("normalizePremiumFullDraftResponsePayload promotes document_text into server_full_document_text", () => {
    const normalized = normalizePremiumFullDraftResponsePayload(
      buildTest520DegradedJsonParseDocumentTextOnlyWire(),
    );
    expect(String(normalized.wire.server_full_document_text ?? "").length).toBeGreaterThanOrEqual(
      TEST520_TARGET_DOCUMENT_LEN - 5,
    );
    expect(premiumApiResultHasAuthoritativeServerCorpus(normalized.wire)).toBe(true);
    expect(extractPremiumApiServerCorpusText(normalized.wire).length).toBeGreaterThanOrEqual(
      TEST520_TARGET_DOCUMENT_LEN - 5,
    );
  });

  it("premium-api-result logs authoritative server corpus for degraded json_parse wire", () => {
    const normalized = normalizePremiumFullDraftResponsePayload(
      buildTest520DegradedJsonParseDocumentTextOnlyWire(),
    );
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("MODE", "development");
    logPremiumApiResultFromWire({ ok: true, status: 200, wire: normalized.wire });
    const apiResult = logSpy.mock.calls.find((call) => call[0] === "[premium-api-result]")?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(apiResult?.hasAuthoritativeServerDocument).toBe(true);
    expect(apiResult?.hasServerFullDocumentText).toBe(true);
    expect(Number(apiResult?.serverLen)).toBeGreaterThanOrEqual(TEST520_TARGET_DOCUMENT_LEN - 5);
    expect(Number(apiResult?.normalizedLen)).toBeGreaterThanOrEqual(TEST520_TARGET_DOCUMENT_LEN - 5);
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  it("does not trigger deterministic fallback or no_server_authority for substantive degraded wire", async () => {
    premiumApiMock.mockResponses = [buildTest520DegradedJsonParseDocumentTextOnlyWire()];
    const fallbackSpy = vi.spyOn(deterministicFallback, "logDeterministicProFallbackDecision");

    const out = await runPremiumCompletion({
      intakeText: TEST520_INTAKE,
      originalUserIntakeRawForMerge: TEST520_INTAKE,
      structuredDraft: test520Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test520-body-alias",
      premiumRequestIntakeFingerprint: "fp-test520",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test520Draft(),
    });

    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(
      TEST520_TARGET_DOCUMENT_LEN - 500,
    );
    expect(out.premiumRenderSource).toMatch(/server_full_draft/);
    expect(shouldTreatEntitledRewritePipelineResultAsGenerationFailure(out)).toBe(false);

    const jsonParseFallback = fallbackSpy.mock.calls.find(
      (call) => call[0] === "server_degraded_json_parse",
    );
    expect(jsonParseFallback).toBeUndefined();
    const acceptedFallback = fallbackSpy.mock.calls.find(
      (call) => call[0] === "deterministic_pro_fallback_accepted",
    );
    expect(acceptedFallback).toBeUndefined();
  });
});
