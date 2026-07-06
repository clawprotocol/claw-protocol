/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import {
  extractPremiumApiServerCorpusText,
  logPremiumApiResultFromWire,
  premiumApiResultHasAuthoritativeServerCorpus,
} from "./premiumApiHandoff";
import { validateClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import * as paidProFreezeCandidateModule from "./paidProFreezeCandidate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { normalizePremiumFullDraftResponsePayload } from "./premiumFullDraftResponseNormalization";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import * as deterministicFallback from "./deterministicQuadPartyProFallback";
import * as localRecoveryModule from "./premiumNetworkRecoveryLocalDraft";
import {
  buildTest531DegradedJsonParseDocumentTextOnlyWire,
  buildTest531SubstantiveMissingExecutionBlockBody,
  buildTest531ThinLocalRecoveryCandidates,
  TEST531_INTAKE,
  TEST531_TARGET_DOCUMENT_LEN,
  test531Draft,
} from "./paidProTest531Fixtures";

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
    postPremiumFullDraftOnce: () => Promise.reject(new Error("test531_no_second_post")),
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

describe("TEST531 — full-doc rejection blocks late thin fallback", () => {
  it("promotes degraded json_parse document_text with failed agreement_validation", () => {
    const wire = buildTest531DegradedJsonParseDocumentTextOnlyWire();
    expect(wire.agreement_validation?.passed).toBe(false);
    const normalized = normalizePremiumFullDraftResponsePayload(wire);
    expect(normalized.authoritativeText.length).toBeGreaterThanOrEqual(
      TEST531_TARGET_DOCUMENT_LEN - 50,
    );
    expect(String(normalized.wire.server_full_document_text ?? "").length).toBeGreaterThanOrEqual(
      TEST531_TARGET_DOCUMENT_LEN - 50,
    );
    expect(premiumApiResultHasAuthoritativeServerCorpus(normalized.wire)).toBe(true);
    expect(extractPremiumApiServerCorpusText(normalized.wire).length).toBeGreaterThanOrEqual(
      TEST531_TARGET_DOCUMENT_LEN - 50,
    );
  });

  it("premium-api-result reflects promoted serverLen ~10580", () => {
    const normalized = normalizePremiumFullDraftResponsePayload(
      buildTest531DegradedJsonParseDocumentTextOnlyWire(),
    );
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("MODE", "development");
    logPremiumApiResultFromWire({ ok: true, status: 200, wire: normalized.wire });
    const apiResult = logSpy.mock.calls.find((call) => call[0] === "[premium-api-result]")?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(apiResult?.hasAuthoritativeServerDocument).toBe(true);
    expect(apiResult?.hasServerFullDocumentText).toBe(true);
    expect(Number(apiResult?.serverLen)).toBeGreaterThanOrEqual(TEST531_TARGET_DOCUMENT_LEN - 50);
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  it("fixture reports missing_execution_block before freeze auto-repair", () => {
    const body = buildTest531SubstantiveMissingExecutionBlockBody();
    expect(body.length).toBeGreaterThanOrEqual(TEST531_TARGET_DOCUMENT_LEN - 50);
    expect(body).not.toMatch(/IN WITNESS WHEREOF/i);
    const structural = validateClauseFamilyStructuralIntegrity(body, {
      intakeText: TEST531_INTAKE,
      draftPartyCount: 4,
      draftPartyNames: test531Draft().parties?.map((p) => p.name) ?? [],
      surface: "test531_missing_execution_block",
    });
    expect(structural.violations.some((v) => v.code === "missing_execution_block")).toBe(true);
  });

  it(
    "pipeline terminalizes rejected_paid_corpus and blocks thin local fallback",
    async () => {
    premiumApiMock.mockResponses = [buildTest531DegradedJsonParseDocumentTextOnlyWire()];
    const [thin1313, thin2046, thin2382] = buildTest531ThinLocalRecoveryCandidates();
    expect(thin1313.length).toBe(1_313);
    expect(thin2046.length).toBe(2_046);
    expect(thin2382.length).toBe(2_382);

    const localRecoverySpy = vi
      .spyOn(localRecoveryModule, "buildPremiumPostCheckoutLocalRecoveryProDraft")
      .mockImplementation(() => ({
        ok: true,
        body: thin2382,
        reasons: [] as string[],
      }));
    const fallbackSpy = vi.spyOn(deterministicFallback, "logDeterministicProFallbackDecision");
    const originalFreeze = paidProFreezeCandidateModule.resolvePaidProFreezeCommitText;
    const freezeSpy = vi
      .spyOn(paidProFreezeCandidateModule, "resolvePaidProFreezeCommitText")
      .mockImplementation((args) => {
        const trimmed = (args.text || "").trim();
        if (trimmed.length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) {
          const prep = originalFreeze(args);
          return {
            ok: false,
            text: prep.text.length >= Math.floor(trimmed.length * 0.85) ? prep.text : trimmed,
            hash: prep.hash ?? "",
            rejectReason: "missing_execution_block",
            reviewParties: prep.reviewParties ?? [],
            parties: prep.parties ?? [],
          };
        }
        return originalFreeze(args);
      });

    const debugSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const out = await runPremiumCompletion({
      intakeText: TEST531_INTAKE,
      originalUserIntakeRawForMerge: TEST531_INTAKE,
      structuredDraft: test531Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test531-full-doc-reject",
      premiumRequestIntakeFingerprint: "fp-test531",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test531Draft(),
    });

    expect(out.premiumRenderSource).toBe("rejected_paid_corpus");
    expect(out.winningPremiumBodyText.trim()).toBe("");
    expect(out.proIntentGateMessage ?? "").toMatch(/missing execution block|10,?580|full Pro draft/i);
    expect(out.proIntentGateMessage ?? "").not.toMatch(/professional_confidentiality/);
    expect(
      Math.max(
        out.premiumDraft.premium_server_full_document_text?.trim().length ?? 0,
        out.premiumDraft.premium_full_document_text?.trim().length ?? 0,
      ),
    ).toBeGreaterThanOrEqual(TEST531_TARGET_DOCUMENT_LEN - 500);

    expect(
      fallbackSpy.mock.calls.some((call) => call[0] === "deterministic_pro_fallback_accepted"),
    ).toBe(false);
    expect(
      fallbackSpy.mock.calls.some(
        (call) =>
          call[0] === "no_canonical_freeze_after_rejection" &&
          (call[1] as { recoverySotBlockReason?: string })?.recoverySotBlockReason ===
            "substantive_server_full_structural_rejection",
      ),
    ).toBe(true);

    const validationDecision = debugSpy.mock.calls.find(
      (call) => call[0] === "[paid-pro-validation-decision]",
    )?.[1] as { rejectedRule?: string; validationStage?: string } | undefined;
    if (validationDecision) {
      expect(validationDecision.rejectedRule).not.toBe("professional_confidentiality");
    }

    const thinFreezePrep = debugSpy.mock.calls.filter(
      (call) => call[0] === "[paid-pro-freeze-candidate-prep]",
    );
    for (const call of thinFreezePrep) {
      const payload = call[1] as { hash?: string; source?: string } | undefined;
      const hash = String(payload?.hash ?? "");
      const len = Number.parseInt(hash.split(":")[0] ?? "0", 10);
      if (len > 0 && len < SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) {
        expect(payload?.source).not.toBe("server_full_draft");
      }
    }

    expect(localRecoverySpy).not.toHaveBeenCalled();
    freezeSpy.mockRestore();
    debugSpy.mockRestore();
  }, 15_000);
});
