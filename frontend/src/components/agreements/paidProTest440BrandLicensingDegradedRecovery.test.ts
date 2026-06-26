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
import { buildPremiumPostCheckoutLocalRecoveryProDraft } from "./premiumNetworkRecoveryLocalDraft";
import { previewPostCheckoutRecoverySotCommit } from "./paidProPostCheckoutRecoveryAuthority";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import {
  buildTest440DegradedJsonParseDocumentText,
  TEST440_ALL_PARTIES,
  TEST440_MIN_RECOVERY_LEN,
  TEST440_REALISTIC_PROSE_INTAKE,
  TEST440_TRANSACTION_TITLE,
  test440BrandLicensingDraft,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";

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

function expectBrandLicensingProfessionalCorpus(text: string): void {
  expect(text).toContain(TEST440_TRANSACTION_TITLE);
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
  expect(text).not.toMatch(/\bLLC\s+Group\s+Attention/i);
  expect(text).toMatch(/State of Oklahoma/i);
  expect(text).toMatch(/12\.\s+GOVERNING LAW/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  const structure = applySectionStructureIntegrity(text, {
    source: "test440_final_display",
    repair: false,
  });
  expect(structure.anomalyCount).toBe(0);
}

describe("TEST440 — Brand Licensing degraded recovery professional-grade", () => {
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

  it("local recovery + display layer preserve intake roles and repair notice corruption", () => {
    const draft = test440BrandLicensingDraft();
    const localRecovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST440_REALISTIC_PROSE_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(localRecovery.ok, JSON.stringify(localRecovery.reasons)).toBe(true);
    expect(localRecovery.body.length).toBeGreaterThan(TEST440_MIN_RECOVERY_LEN);

    const display = polishProAgreementDisplayLayer(localRecovery.body, {
      draft,
      intakeText: TEST440_REALISTIC_PROSE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingProfessionalCorpus(display.text);

    const preview = previewPostCheckoutRecoverySotCommit({
      body: display.text,
      draft,
      intakeText: TEST440_REALISTIC_PROSE_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible).toBe(true);
    expectBrandLicensingProfessionalCorpus(preview.displayPlain);
  });

  it("premium completion freezes professional brand licensing corpus after degraded json_parse", async () => {
    const degraded = buildTest440DegradedJsonParseDocumentText();
    premiumApiMock.mockResponses = [
      degradedJsonParseResult(degraded),
      degradedJsonParseResult(degraded),
    ];

    const draft = test440BrandLicensingDraft();
    const out = await runPremiumCompletion({
      intakeText: TEST440_REALISTIC_PROSE_INTAKE,
      originalUserIntakeRawForMerge: TEST440_REALISTIC_PROSE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test440-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test440",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    const authoritativeRecoverySources = [
      PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
      "structural_recovery",
      "server_full_draft_degraded",
    ];
    expect(authoritativeRecoverySources).toContain(out.premiumRenderSource);
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(TEST440_MIN_RECOVERY_LEN);

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST440_REALISTIC_PROSE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingProfessionalCorpus(display.text);

    for (const party of TEST440_ALL_PARTIES) {
      expect(display.text).toContain(party);
    }
  });
});
