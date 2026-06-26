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
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { resolveDeterministicQuadPartyNames } from "./deterministicQuadPartyProFallback";
import {
  applyBrandLicensingFrozenCorpusAuthority,
  brandLicensingFrozenCorpusHasProfessionalDefects,
} from "./paidProBrandLicensingFreezeAuthority";
import { previewPostCheckoutRecoverySotCommit } from "./paidProPostCheckoutRecoveryAuthority";
import {
  buildTest441DegradedJsonParseDocumentText,
  buildTest441DefectiveFrozenDisplayCorpus,
  TEST441_ALL_PARTIES,
  TEST441_MIN_FROZEN_LEN,
  TEST441_REALISTIC_PROSE_INTAKE,
  TEST441_TRANSACTION_TITLE,
  test441BrightPeakFirstDraft,
  test441DefectiveCorpusMarkers,
} from "./paidProTest441BrandLicensingFrozenDisplayFixtures";
import { TEST440_EVERGREEN } from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";

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

function expectBrandLicensingProfessionalFrozenCorpus(text: string): void {
  expect(text).toContain(TEST441_TRANSACTION_TITLE);
  expect(text).not.toMatch(/^SERVICES AGREEMENT$/m);
  expect(text).not.toMatch(/\(\s*["']Client["']\s*\)/i);
  expect(text).not.toMatch(/\(\s*["']Service Provider["']\s*\)/i);
  expect(text).toMatch(/Evergreen Outdoor Brands LLC\s*\(\s*["']?Brand Owner["']?\s*\)/i);
  expect(text).toMatch(/Atlas Consumer Products Inc\.?\s*\(\s*["']?Manufacturer["']?\s*\)/i);
  expect(text).toMatch(/Horizon Wholesale Group(?:\s+LLC)?\s*\(\s*["']?Master Distributor["']?\s*\)/i);
  expect(text).toMatch(
    /BrightPeak Retail Solutions(?:\s+LLC)?\s*\(\s*["']?Marketing & E-commerce Manager["']?\s*\)/i,
  );
  expect(text).not.toMatch(/:zon\s+Wholesale/i);
  expect(text).not.toMatch(/the\s+the\s*["']Parties["']\)\.\s*GOVERNING LAW/i);
  expect(text).not.toMatch(/Address:[^\n]*\bGOVERNING LAW\b/i);
  expect(text).not.toMatch(/Address: primary business address on file with the the/i);
  expect(text).toMatch(/State of Oklahoma/i);
  expect(text).toMatch(/12\.\s+GOVERNING LAW/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  const structure = applySectionStructureIntegrity(text, {
    source: "test441_final_frozen_display",
    repair: false,
  });
  expect(structure.anomalyCount).toBe(0);
}

describe("TEST441 — Brand Licensing frozen/display corpus authority", () => {
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
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    clearFrozenPremiumSessionBodiesForTests();
    clearCurrentSessionProEntitlementMarkers();
    vi.restoreAllMocks();
  });

  it("prefers prose party order over BrightPeak-first draft for brand licensing quad names", () => {
    const draft = test441BrightPeakFirstDraft();
    const names = resolveDeterministicQuadPartyNames(TEST441_REALISTIC_PROSE_INTAKE, draft);
    expect(names[0]).toMatch(/Evergreen/i);
    expect(names).toHaveLength(4);
  });

  it("detects live-style defective frozen corpus markers", () => {
    const defective = buildTest441DefectiveFrozenDisplayCorpus();
    const markers = test441DefectiveCorpusMarkers();
    expect(defective).toContain(markers.title);
    expect(defective).toMatch(/\(\s*["']Client["']\s*\)/i);
    expect(brandLicensingFrozenCorpusHasProfessionalDefects(defective)).toBe(true);
  });

  it("repairs defective frozen/display corpus to professional brand licensing authority", () => {
    const draft = test441BrightPeakFirstDraft();
    const defective = buildTest441DefectiveFrozenDisplayCorpus();
    const repaired = applyBrandLicensingFrozenCorpusAuthority(defective, draft, TEST441_REALISTIC_PROSE_INTAKE);
    expectBrandLicensingProfessionalFrozenCorpus(repaired.text);

    const display = polishProAgreementDisplayLayer(repaired.text, {
      draft,
      intakeText: TEST441_REALISTIC_PROSE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingProfessionalFrozenCorpus(display.text);
  });

  it("freeze commit repairs defective server corpus instead of freezing SERVICES AGREEMENT", () => {
    const draft = test441BrightPeakFirstDraft();
    const defective = buildTest441DefectiveFrozenDisplayCorpus();
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: defective,
      draft,
      intakeText: TEST441_REALISTIC_PROSE_INTAKE,
      source: "server_full_draft_degraded",
      generationOutcome: "degraded",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expectBrandLicensingProfessionalFrozenCorpus(freezeCommit.text);
  });

  it("premium completion establishes SoT with professional frozen corpus after degraded json_parse", async () => {
    const degraded = buildTest441DegradedJsonParseDocumentText();
    premiumApiMock.mockResponses = [
      degradedJsonParseResult(degraded),
      degradedJsonParseResult(degraded),
    ];

    const draft = test441BrightPeakFirstDraft();
    const out = await runPremiumCompletion({
      intakeText: TEST441_REALISTIC_PROSE_INTAKE,
      originalUserIntakeRawForMerge: TEST441_REALISTIC_PROSE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test441-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test441",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.proIntentGateMessage).toBeNull();
    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(TEST441_MIN_FROZEN_LEN);

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST441_REALISTIC_PROSE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingProfessionalFrozenCorpus(display.text);

    const sotPreview = previewPostCheckoutRecoverySotCommit({
      body: display.text,
      draft,
      intakeText: TEST441_REALISTIC_PROSE_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(sotPreview.eligible).toBe(true);
    expectBrandLicensingProfessionalFrozenCorpus(sotPreview.displayPlain);

    for (const party of TEST441_ALL_PARTIES) {
      expect(sotPreview.displayPlain).toContain(party);
    }
    expect(sotPreview.displayPlain.indexOf(TEST440_EVERGREEN)).toBeLessThan(
      sotPreview.displayPlain.indexOf("BrightPeak"),
    );
  });
});
