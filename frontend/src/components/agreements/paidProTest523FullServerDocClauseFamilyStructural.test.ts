/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import {
  logClauseFamilyStructuralDiagnostic,
  validateClauseFamilyStructuralIntegrity,
} from "./clauseFamilyStructuralIntegrity";
import { buildPaidProFreezeCandidate, resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import * as paidProFreezeCandidateModule from "./paidProFreezeCandidate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import * as deterministicFallback from "./deterministicQuadPartyProFallback";
import {
  buildTest523DegradedJsonParseWire,
  buildTest523FullServerDocClauseFamilyStructuralDefect,
  buildTest523FullServerDocNoticeProvisionsHeading,
  TEST523_INTAKE,
  TEST523_TARGET_DOCUMENT_LEN,
  test523Draft,
} from "./paidProTest523Fixtures";
import { TEST519_PRODUCTION_QUAD_PARTY_INTAKE } from "./paidProTest519Fixtures";

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
    postPremiumFullDraftOnce: () => Promise.reject(new Error("test523_no_second_post")),
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

describe("TEST523 — full server doc clause_family_structural recovery", () => {
  it("1 — 10k server_full_draft rejected by clause_family_structural logs exact missing family names", () => {
    const body = buildTest523FullServerDocClauseFamilyStructuralDefect();
    expect(body.length).toBeGreaterThanOrEqual(TEST523_TARGET_DOCUMENT_LEN - 50);

    const rawReport = validateClauseFamilyStructuralIntegrity(body, {
      intakeText: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyCount: 4,
      draftPartyNames: test523Draft().parties?.map((p) => p.name) ?? [],
      surface: "test523_raw_diagnostic",
    });
    expect(rawReport.ok).toBe(false);
    expect(rawReport.violations.length).toBeGreaterThan(0);

    const validation = validatePaidProOutput({
      text: body,
      rawIntake: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
      intentContract: resolveAgreementIntentContract(TEST519_PRODUCTION_QUAD_PARTY_INTAKE),
      draft: test523Draft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok).toBe(false);

    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("MODE", "development");
    logClauseFamilyStructuralDiagnostic(body, rawReport, { surface: "test523_diagnostic" });
    const diagnostic = logSpy.mock.calls.find(
      (call) => call[0] === "[paid-pro-clause-family-structural-diagnostic]",
    )?.[1] as Record<string, unknown> | undefined;
    expect(Array.isArray(diagnostic?.failedFamilies)).toBe(true);
    expect((diagnostic?.failedFamilies as string[]).length).toBeGreaterThan(0);
    expect(Array.isArray(diagnostic?.violationCodes)).toBe(true);
    expect((diagnostic?.violationCodes as string[]).length).toBeGreaterThan(0);
    expect(diagnostic?.headingEvidence).toBeTruthy();
    vi.unstubAllEnvs();
    logSpy.mockRestore();
  });

  function mockSubstantiveWireFreezeRejection() {
    const original = resolvePaidProFreezeCommitText;
    return vi.spyOn(paidProFreezeCandidateModule, "resolvePaidProFreezeCommitText").mockImplementation((args) => {
      const trimmed = (args.text || "").trim();
      if (trimmed.length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) {
        const prep = original(args);
        return {
          ok: false,
          text: prep.text.length >= Math.floor(trimmed.length * 0.85) ? prep.text : trimmed,
          hash: prep.hash ?? "",
          rejectReason: "missing_party_notice_stanzas",
          reviewParties: prep.reviewParties ?? [],
          parties: prep.parties ?? [],
        };
      }
      return original(args);
    });
  }

  it("2 — full-doc rejection does not trigger deterministic thin fallback", async () => {
    premiumApiMock.mockResponses = [buildTest523DegradedJsonParseWire()];
    const fallbackSpy = vi.spyOn(deterministicFallback, "logDeterministicProFallbackDecision");
    const freezeSpy = mockSubstantiveWireFreezeRejection();

    const out = await runPremiumCompletion({
      intakeText: TEST523_INTAKE,
      originalUserIntakeRawForMerge: TEST523_INTAKE,
      structuredDraft: test523Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test523-structural-reject",
      premiumRequestIntakeFingerprint: "fp-test523",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test523Draft(),
    });

    expect(out.premiumRenderSource).toBe("rejected_paid_corpus");
    expect(out.winningPremiumBodyText.trim()).toBe("");
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
    expect(out.proIntentGateMessage ?? "").toMatch(/full Pro draft|10,?812|structure|notice|retry/i);
    freezeSpy.mockRestore();
  });

  it("3 — recovery preserves full-doc failure reason and body length", async () => {
    premiumApiMock.mockResponses = [buildTest523DegradedJsonParseWire()];
    const freezeSpy = mockSubstantiveWireFreezeRejection();

    const out = await runPremiumCompletion({
      intakeText: TEST523_INTAKE,
      originalUserIntakeRawForMerge: TEST523_INTAKE,
      structuredDraft: test523Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test523-preserve-context",
      premiumRequestIntakeFingerprint: "fp-test523-preserve",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test523Draft(),
    });

    expect(out.premiumRenderSource).toBe("rejected_paid_corpus");
    expect(out.winningPremiumBodyText.trim()).toBe("");
    expect(out.proIntentGateMessage ?? "").toMatch(
      /full Pro draft|10,?812|structure|notice|retry/i,
    );
    expect(
      Math.max(
        out.premiumDraft.premium_server_full_document_text?.trim().length ?? 0,
        out.premiumDraft.premium_full_document_text?.trim().length ?? 0,
      ),
    ).toBeGreaterThanOrEqual(TEST523_TARGET_DOCUMENT_LEN - 500);
    expect(out.proIntentGateMessage ?? "").not.toMatch(/professional_confidentiality/);
    expect(out.proIntentGateMessage ?? "").toMatch(
      /full Pro draft|could not freeze|10,?812|Retry Pro draft/i,
    );
    freezeSpy.mockRestore();
  });

  it("4 — substance-based clause detection accepts equivalent Notice Provisions headings", () => {
    const body = buildTest523FullServerDocNoticeProvisionsHeading();
    expect(body.length).toBeGreaterThanOrEqual(TEST523_TARGET_DOCUMENT_LEN - 50);
    expect(body).toMatch(/\d+\.\s+Notice Provisions/i);

    const prepared = preparePaidProServerDocumentForAcceptance(
      body,
      test523Draft(),
      TEST523_INTAKE,
      { surface: "test523_notice_provisions_prepare" },
    );
    const structural = validateClauseFamilyStructuralIntegrity(prepared.text, {
      intakeText: TEST523_INTAKE,
      draftPartyCount: 4,
      draftPartyNames: test523Draft().parties?.map((p) => p.name) ?? [],
      surface: "test523_notice_provisions",
    });
    expect(structural.violations.some((v) => v.code === "missing_notices_heading")).toBe(false);
    expect(structural.familyPresence.notices).toBe(true);

    const freeze = buildPaidProFreezeCandidate({
      text: prepared.text,
      draft: test523Draft(),
      intakeText: TEST523_INTAKE,
      source: "server_full_draft",
      surface: "test523_notice_provisions_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
    expect(freeze.text.length).toBeGreaterThanOrEqual(TEST523_TARGET_DOCUMENT_LEN - 2000);
  });
});
