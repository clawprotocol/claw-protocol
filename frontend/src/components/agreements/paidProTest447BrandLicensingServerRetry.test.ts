/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import {
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  clearPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  buildPaidProFreezeCandidate,
} from "./paidProFreezeCandidate";
import { buildPaidProStructuralRecoveryBody } from "./paidProStructuralRecovery";
import {
  authoritativePremiumPipelineResultForUiApply,
  paidProCheckoutCompletionHasVisibleOutcome,
} from "./premiumPostCheckoutApplyEligible";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import { detectPaidProSectionHeadingTitleAnomalies } from "./paidProSectionHeadingTitleAuthority";
import {
  consumeAuthoritativeSignerCount,
  resolveAuthoritativeSignerCount,
} from "./signerCountAuthority";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  buildTest447DegradedJsonParseDocumentText,
  buildTest447ServerRetryDefectiveBody,
  TEST447_ALL_PARTIES,
  TEST447_LIVE_INTAKE,
  TEST447_MIN_SERVER_LEN,
  TEST447_TARGET_DEGRADED_LEN,
  TEST447_TRANSACTION_TITLE,
  test447BrightPeakFirstDraft,
} from "./paidProTest447BrandLicensingServerRetryFixtures";

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

function degradedJsonParseResult(documentText: string): PremiumFullDraftResult {
  return {
    title: "Brand Licensing and Distribution Agreement",
    agreement_family: "services_agreement",
    document_text: documentText,
    server_full_document_text: "",
    key_terms_found: [],
    missing_material_info: [],
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
  };
}

function okServerFullResult(serverBody: string): PremiumFullDraftResult {
  return {
    title: TEST447_TRANSACTION_TITLE,
    agreement_family: "services_agreement",
    document_text: serverBody,
    server_full_document_text: serverBody,
    key_terms_found: ["payment", "governing_law"],
    missing_material_info: [],
    generation_outcome: "ok",
  };
}

function expectBrandLicensingReviewCorpus(text: string): void {
  expect(text).toContain(TEST447_TRANSACTION_TITLE);
  expect(text).not.toMatch(/^SERVICES AGREEMENT$/m);
  expect(text).not.toMatch(/\(\s*["']Client["']\s*\)/i);
  expect(text).not.toMatch(/\(\s*["']Service Provider["']\s*\)/i);
  expect(text).toMatch(/State of Oklahoma/i);
  expect(text).toMatch(/12\.\s+GOVERNING LAW/i);
  expect(text).not.toMatch(/\bmissing_notices_heading\b/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  expect(detectPaidProSectionHeadingTitleAnomalies(text).length).toBe(0);
  const structure = applySectionStructureIntegrity(text, {
    source: "test447_final_corpus",
    repair: false,
  });
  expect(structure.anomalyCount).toBe(0);
  expect(text).not.toMatch(/\bParty\s+5\b/i);
  expect(text).not.toMatch(/Summit Outdoor Partners/i);
  for (const party of TEST447_ALL_PARTIES) {
    expect(text).toContain(party);
  }
}

describe("TEST447 — Brand licensing server retry after degraded json_parse", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    premiumApiMock.mockResponses = [];
    premiumApiMock.callIndex = 0;
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
    (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest =
      true;
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    clearFrozenPremiumSessionBodiesForTests();
    clearCurrentSessionProEntitlementMarkers();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("defective server body fails raw validation but structural recovery freeze passes", () => {
    const draft = test447BrightPeakFirstDraft();
    const defective = buildTest447ServerRetryDefectiveBody();
    const rawValidation = validatePaidProOutput({
      text: defective,
      rawIntake: TEST447_LIVE_INTAKE,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(rawValidation.ok).toBe(false);

    const structural = buildPaidProStructuralRecoveryBody({
      intakeText: TEST447_LIVE_INTAKE,
      draft,
    });
    expect(structural.ok).toBe(true);
    expect(structural.body.length).toBeGreaterThan(7_500);
    const prepared = preparePaidProServerDocumentForAcceptance(
      structural.body,
      draft,
      TEST447_LIVE_INTAKE,
      { surface: "test447_structural_prepare" },
    );
    const freeze = buildPaidProFreezeCandidate({
      text: prepared.text,
      draft,
      intakeText: TEST447_LIVE_INTAKE,
      source: "structural_recovery",
      surface: "test447_structural_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
    expect(freeze.text.length).toBeGreaterThan(7_000);
    expectBrandLicensingReviewCorpus(freeze.text);
  });

  it("fixture degraded wire is ~8120 and retry body is ~30177 with live defects", () => {
    const degraded = buildTest447DegradedJsonParseDocumentText();
    expect(degraded.length).toBe(TEST447_TARGET_DEGRADED_LEN);
    const defective = buildTest447ServerRetryDefectiveBody();
    expect(defective.length).toBeGreaterThanOrEqual(TEST447_MIN_SERVER_LEN);
    const preRepairStructure = applySectionStructureIntegrity(defective, {
      source: "test447_pre_repair",
      repair: false,
    });
    expect(preRepairStructure.anomalyCount).toBeGreaterThan(0);
    expect(defective).toMatch(/Summit Outdoor Partners/i);
  });

  it("premium completion reaches Pro review after json_parse retry — no retry card / SoT written", async () => {
    const draft = test447BrightPeakFirstDraft();
    const degraded = buildTest447DegradedJsonParseDocumentText();
    const defectiveServer = buildTest447ServerRetryDefectiveBody();
    const generationId = `gen-test447-${Date.now()}`;

    premiumApiMock.mockResponses = [
      degradedJsonParseResult(degraded),
      okServerFullResult(defectiveServer),
    ];

    const out = await runPremiumCompletion({
      intakeText: TEST447_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST447_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: "fp-test447",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.proIntentGateMessage).toBeNull();
    expect(out.premiumRenderSource).toMatch(/structural_recovery|server_full_draft/);
    expect(out.premiumRenderSource).not.toBe("free_starter");
    expect(out.premiumRenderSource).not.toBe("premium_generation_retryable");
    expect(authoritativePremiumPipelineResultForUiApply(out)).toBe(true);
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(7_000);

    const validation = validatePaidProOutput({
      text: out.winningPremiumBodyText,
      rawIntake: TEST447_LIVE_INTAKE,
      draft,
      premiumPipelineSource: out.premiumRenderSource,
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);
    expect(validation.reasons).not.toContain("brand_licensing_section_structure_anomaly");
    expect(validation.reasons).not.toContain("mislabeled_server_full_draft_below_substantive_min");

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST447_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingReviewCorpus(display.text);

    establishPaidProSourceOfTruth({
      text: display.text,
      source: out.premiumRenderSource,
      draft,
      intakeText: TEST447_LIVE_INTAKE,
      reviewSessionId: generationId,
      generationOutcome: "ok",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.trim().length).toBeGreaterThan(7_000);
    expectBrandLicensingReviewCorpus(sot);

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft,
      intakeText: TEST447_LIVE_INTAKE,
    });
    expect(reviewPlain.trim().length).toBeGreaterThan(7_000);
    expect(reviewPlain).toContain(TEST447_TRANSACTION_TITLE);

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST447_LIVE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: display.text,
    });
    expect(authority.count).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("enforcePaidProSingleExecutionBlock", {
        intakeText: TEST447_LIVE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: display.text,
      }),
    ).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("paid_pro_structural_recovery", {
        intakeText: TEST447_LIVE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: display.text,
      }),
    ).toBe(4);
  });
});
