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
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
} from "./premiumNetworkRecoveryLocalDraft";
import { previewPostCheckoutRecoverySotCommit } from "./paidProPostCheckoutRecoveryAuthority";
import {
  buildDeterministicQuadPartyProFallback,
  DETERMINISTIC_BRAND_LICENSING_QUAD_PARTY_MIN_LEN,
} from "./deterministicQuadPartyProFallback";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  buildTest439DegradedJsonParseDocumentText,
  TEST439_ALL_PARTIES,
  TEST439_BRAND_LICENSING_INTAKE,
  TEST439_MIN_RECOVERY_LEN,
  TEST439_TRANSACTION_TITLE,
  test439BrandLicensingDraft,
} from "./paidProTest439BrandLicensingDegradedRecoveryFixtures";

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

describe("TEST439 — Brand Licensing degraded recovery professional-grade", () => {
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

  it("deterministic quad fallback synthesizes brand licensing template, not generic services", () => {
    const draft = test439BrandLicensingDraft();
    const built = buildDeterministicQuadPartyProFallback({
      draft,
      rawIntake: TEST439_BRAND_LICENSING_INTAKE,
      partyNames: TEST439_ALL_PARTIES,
    });
    expect(built.ok, JSON.stringify(built.reasons)).toBe(true);
    expect(built.body.length).toBeGreaterThanOrEqual(DETERMINISTIC_BRAND_LICENSING_QUAD_PARTY_MIN_LEN);
    expect(built.body).toContain(TEST439_TRANSACTION_TITLE);
    expect(built.body).not.toMatch(/^SERVICES AGREEMENT$/m);
    expect(built.body).not.toMatch(/Service Provider will perform professional consulting/i);
    expect(built.body).not.toMatch(/\bClient\b.*Service Provider will perform/i);
    expect(built.body).toMatch(/Brand Owner/i);
    expect(built.body).toMatch(/Manufacturer/i);
    expect(built.body).toMatch(/Master Distributor|Distributor/i);
    expect(built.body).toMatch(/Marketing/i);
    expect(built.body).toMatch(/State of Oklahoma/i);
    expect(built.body).not.toMatch(/K\. GOVERNING LAW/i);
    expect(built.body).not.toMatch(/\* assignment \*/i);
    expect(countOperativeIfToNoticeStanzas(built.body)).toBe(4);
    for (const party of TEST439_ALL_PARTIES) {
      expect(built.body).toContain(party);
    }
    expect(built.body).not.toMatch(/Wholesale Group LLC Group/i);
  });

  it("local recovery path produces eligible professional corpus for degraded json_parse", () => {
    const draft = test439BrandLicensingDraft();
    const localRecovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST439_BRAND_LICENSING_INTAKE,
      intakeLower: TEST439_BRAND_LICENSING_INTAKE.toLowerCase(),
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(localRecovery.ok, JSON.stringify(localRecovery.reasons)).toBe(true);
    expect(localRecovery.body.length).toBeGreaterThan(TEST439_MIN_RECOVERY_LEN);
    expect(localRecovery.body).toContain(TEST439_TRANSACTION_TITLE);
    expect(localRecovery.body).not.toMatch(/Service Provider will perform professional consulting/i);

    const preview = previewPostCheckoutRecoverySotCommit({
      body: localRecovery.body,
      draft,
      intakeText: TEST439_BRAND_LICENSING_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible).toBe(true);
    expect(preview.displayPlain).toContain(TEST439_TRANSACTION_TITLE);
  });

  it("premium completion adopts brand licensing local recovery after degraded json_parse without server_full", async () => {
    const degraded = buildTest439DegradedJsonParseDocumentText();
    expect(degraded.length).toBeGreaterThan(8_000);
    premiumApiMock.mockResponses = [
      degradedJsonParseResult(degraded),
      degradedJsonParseResult(degraded),
    ];

    const draft = test439BrandLicensingDraft();
    const out = await runPremiumCompletion({
      intakeText: TEST439_BRAND_LICENSING_INTAKE,
      originalUserIntakeRawForMerge: TEST439_BRAND_LICENSING_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test439-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test439",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(TEST439_MIN_RECOVERY_LEN);
    expect(out.winningPremiumBodyText).toContain(TEST439_TRANSACTION_TITLE);
    expect(out.winningPremiumBodyText).not.toMatch(/^SERVICES AGREEMENT$/m);
    expect(out.winningPremiumBodyText).not.toMatch(/Service Provider will perform professional consulting/i);
    expect(out.winningPremiumBodyText).not.toMatch(/K\. GOVERNING LAW/i);
    expect(out.winningPremiumBodyText).not.toMatch(/\* assignment \*/i);
    expect(countOperativeIfToNoticeStanzas(out.winningPremiumBodyText)).toBe(4);
    expect(countPaidProExecutionBlocks(out.winningPremiumBodyText)).toBe(1);
    for (const party of TEST439_ALL_PARTIES) {
      expect(out.winningPremiumBodyText).toContain(party);
    }
  });
});
