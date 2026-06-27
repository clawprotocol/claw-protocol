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
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
  clearPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import {
  authoritativePremiumPipelineResultForUiApply,
  paidProCheckoutCompletionHasVisibleOutcome,
} from "./premiumPostCheckoutApplyEligible";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import { detectPaidProSectionHeadingTitleAnomalies } from "./paidProSectionHeadingTitleAuthority";
import {
  consumeAuthoritativeSignerCount,
  resolveAuthoritativeSignerCount,
} from "./signerCountAuthority";
import { readProGenerationAdoption } from "./paidProGenerationAdoption";
import {
  readForbiddenPostValidatedRecoveryStages,
  readPaidProAuthorityHashContinuity,
  verifyPaidProAuthorityHashContinuity,
} from "./paidProAuthorityHashContinuity";
import { getAuthoritativeAgreementDocument } from "./authoritativeAgreementDocument";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { preparePaidProFrozenDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import {
  buildTest450DegradedJsonParseDocumentText,
  buildTest450SuccessfulServerBody,
  TEST450_ALL_PARTIES,
  TEST450_LIVE_INTAKE,
  TEST450_TARGET_DEGRADED_LEN,
  TEST450_TARGET_SERVER_LEN,
  TEST450_TRANSACTION_TITLE,
  test450BrightPeakFirstDraft,
} from "./paidProTest450BrandLicensingAuthorityHashContinuityFixtures";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";

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

vi.mock("./premiumFullDraftClientAcceptance", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftClientAcceptance")>();
  return {
    ...mod,
    rejectPremiumBodyForProRender: (
      body: string,
      opts?: Parameters<typeof mod.rejectPremiumBodyForProRender>[1],
    ) => {
      if (body.trim().length >= SUBSTANTIVE_SERVER_DRAFT_MIN_LEN) {
        return {
          ok: false,
          reasons: [
            "placeholder:synthetic_acc_structural_gate",
            "placeholder:synthetic_acc_gate_2",
            "placeholder:synthetic_acc_gate_3",
            "placeholder:synthetic_acc_gate_4",
          ],
        };
      }
      return mod.rejectPremiumBodyForProRender(body, opts);
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

function needsDetailsServerFullResult(serverBody: string): PremiumFullDraftResult {
  return {
    title: TEST450_TRANSACTION_TITLE,
    agreement_family: "services_agreement",
    document_text: serverBody,
    server_full_document_text: serverBody,
    key_terms_found: ["payment", "governing_law"],
    missing_material_info: ["inventory_reporting_detail"],
    generation_outcome: "needs_details",
    schema_validation_reasons: ["section_missing"],
  };
}

function expectBrandLicensingReviewCorpus(text: string): void {
  expect(text).toContain(TEST450_TRANSACTION_TITLE);
  expect(text).not.toMatch(/^SERVICES AGREEMENT$/m);
  expect(text).toMatch(/State of Oklahoma/i);
  expect(text).toMatch(/12\.\s+GOVERNING LAW/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  expect(detectPaidProSectionHeadingTitleAnomalies(text).length).toBe(0);
  const structure = applySectionStructureIntegrity(text, {
    source: "test450_final_corpus",
    repair: false,
  });
  expect(structure.anomalyCount).toBe(0);
  expect(text).not.toMatch(/\bParty\s+5\b/i);
  for (const party of TEST450_ALL_PARTIES) {
    expect(text).toContain(party);
  }
}

describe("TEST450 — Brand licensing authority hash continuity after validated adoption", () => {
  const storage = new Map<string, string>();
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    premiumApiMock.mockResponses = [];
    premiumApiMock.callIndex = 0;
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("fixture degraded ~8466 and retry server ~28442", () => {
    const degraded = buildTest450DegradedJsonParseDocumentText();
    expect(degraded.length).toBe(TEST450_TARGET_DEGRADED_LEN);
    const server = buildTest450SuccessfulServerBody();
    expect(server.length).toBe(TEST450_TARGET_SERVER_LEN);
  });

  it("substantive vPaid passes while acc structural gate is mocked to fail", () => {
    const draft = test450BrightPeakFirstDraft();
    const server = buildTest450SuccessfulServerBody();
    const validation = validatePaidProOutput({
      text: server,
      rawIntake: TEST450_LIVE_INTAKE,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);
  });

  it("adopted corpus keeps identical authority hashes through freeze, SoT, and review", async () => {
    const draft = test450BrightPeakFirstDraft();
    const degraded = buildTest450DegradedJsonParseDocumentText();
    const serverBody = buildTest450SuccessfulServerBody();
    const generationId = `gen-test450-${Date.now()}`;
    const intakeFp = "fp-test450";

    premiumApiMock.mockResponses = [
      degradedJsonParseResult(degraded),
      needsDetailsServerFullResult(serverBody),
    ];

    const out = await runPremiumCompletion({
      intakeText: TEST450_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST450_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: intakeFp,
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.proIntentGateMessage).toBeNull();
    expect(out.premiumRenderSource).not.toBe("free_starter");
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.premiumRenderSource).not.toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(
      out.premiumRenderSource === "server_full_draft" ||
        out.premiumRenderSource === "server_full_draft_retry" ||
        out.premiumRenderSource === "server_full_draft_degraded",
    ).toBe(true);
    expect(authoritativePremiumPipelineResultForUiApply(out)).toBe(true);
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);

    expect(readForbiddenPostValidatedRecoveryStages()).toEqual([]);

    const validation = validatePaidProOutput({
      text: out.winningPremiumBodyText,
      rawIntake: TEST450_LIVE_INTAKE,
      draft,
      premiumPipelineSource: out.premiumRenderSource,
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);

    const vPaidValidationHash = paidProPipelineAcceptedCorpusHash(out.winningPremiumBodyText)!;
    expect(vPaidValidationHash).toBeTruthy();

    const continuity = readPaidProAuthorityHashContinuity(generationId, intakeFp);
    expect(continuity, `renderSource=${out.premiumRenderSource}`).toBeTruthy();
    expect(continuity!.vPaidValidationHash).toBe(vPaidValidationHash);
    expect(continuity!.acceptedFreezeHash).toBe(vPaidValidationHash);

    const adopted = readProGenerationAdoption(generationId, intakeFp);
    expect(adopted, `renderSource=${out.premiumRenderSource}`).toBeTruthy();
    expect(adopted!.body.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(adopted!.hash).toBe(vPaidValidationHash);
    if (adopted!.freezeCandidateHash) {
      expect(adopted!.freezeCandidateHash).toBe(vPaidValidationHash);
    }

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST450_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingReviewCorpus(display.text);

    establishPaidProSourceOfTruth({
      text: out.winningPremiumBodyText,
      source: out.premiumRenderSource,
      draft,
      intakeText: TEST450_LIVE_INTAKE,
      reviewSessionId: generationId,
      agreementGenerationId: generationId,
      generationOutcome: "needs_details",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);

    const sot = getPaidProSourceOfTruthText();
    const sotRecord = getPaidProSourceOfTruth()!;
    const frozen = getFrozenCanonicalAgreementCorpus();
    const authoritative = getAuthoritativeAgreementDocument();
    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft,
      intakeText: TEST450_LIVE_INTAKE,
    });
    const frozenDisplay = preparePaidProFrozenDisplayPlain(sotRecord.text).text;
    const reviewDisplayHash = hashPaidProCorpus(reviewPlain);
    const canonicalSnapshotHash = frozen?.hash ?? sotRecord.hash;
    const authoritativeSnapshotHash = authoritative?.authoritativeHash ?? sotRecord.hash;

    expect(sot.trim().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expectBrandLicensingReviewCorpus(sot);

    expect(canonicalSnapshotHash).toBe(vPaidValidationHash);
    expect(authoritativeSnapshotHash).toBe(vPaidValidationHash);
    expect(sotRecord.hash).toBe(vPaidValidationHash);
    expect(hashPaidProCorpus(frozenDisplay)).toBe(reviewDisplayHash);

    const parity = auditPaidProReviewRenderSotParity({ reviewPlain });
    expect(parity.invariantOk).toBe(true);

    const continuityReport = verifyPaidProAuthorityHashContinuity({
      generationId,
      intakeFingerprint: intakeFp,
      vPaidValidationHash,
      acceptedFreezeHash: vPaidValidationHash,
      canonicalSnapshotHash,
      authoritativeSnapshotHash,
      reviewDisplayHash: vPaidValidationHash,
      sotHash: sotRecord.hash,
    });
    expect(continuityReport.ok, continuityReport.mismatches.join("|")).toBe(true);
    expect(continuityReport.anchorHash).toBe(vPaidValidationHash);

    expect(
      infoSpy.mock.calls.some((c) => c[0] === "[premium-authority-candidate-rejected-shorter-than-accepted]"),
    ).toBe(false);
    expect(infoSpy.mock.calls.some((c) => c[0] === "[paid-pro-fallback-display-only]")).toBe(false);
    expect(warnSpy.mock.calls.some((c) => c[0] === "[paid-pro-api-failure-no-canonical-freeze]")).toBe(false);

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST450_LIVE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 5,
      corpusPlain: display.text,
    });
    expect(authority.count).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("paid_pro_structural_recovery", {
        intakeText: TEST450_LIVE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 5,
        corpusPlain: display.text,
      }),
    ).toBe(4);
  });
});
