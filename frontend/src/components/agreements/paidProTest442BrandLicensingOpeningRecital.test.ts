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
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { applyFrozenManifestPaidProDisplayAuthority } from "./paidProFrozenManifestDisplayAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import {
  applyBrandLicensingFrozenCorpusAuthority,
  brandLicensingOpeningRecitalNeedsAuthorityRepair,
} from "./paidProBrandLicensingFreezeAuthority";
import {
  detectOpeningRecitalCrossMappedLegalNameAliases,
} from "./paidProOpeningRoleLabelConsistency";
import { consumeAuthoritativeSignerCount, resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  buildTest442CrossMappedOpeningCorpus,
  TEST442_ALL_PARTIES,
  TEST442_REALISTIC_PROSE_INTAKE,
  TEST442_TRANSACTION_TITLE,
  test442CrossMappedOpeningMarkers,
} from "./paidProTest442BrandLicensingOpeningRecitalFixtures";
import { test441BrightPeakFirstDraft } from "./paidProTest441BrandLicensingFrozenDisplayFixtures";
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

function expectNoCrossMappedQuotedAliases(text: string, partyNames: readonly string[]): void {
  expect(detectOpeningRecitalCrossMappedLegalNameAliases(text, partyNames)).toBe(false);
}

function expectBrandLicensingOpeningRecitalAuthority(text: string): void {
  expect(text).toContain(TEST442_TRANSACTION_TITLE);
  expect(text).not.toMatch(/^SERVICES AGREEMENT$/m);
  expect(text).not.toMatch(/\(\s*["']Client["']\s*\)/i);
  expect(text).not.toMatch(/\(\s*["']Service Provider["']\s*\)/i);
  expect(text).toMatch(/Evergreen Outdoor Brands LLC\s*\(\s*["']?Brand Owner["']?\s*\)/i);
  expect(text).toMatch(/Atlas Consumer Products Inc\.?\s*\(\s*["']?Manufacturer["']?\s*\)/i);
  expect(text).toMatch(/Horizon Wholesale Group(?:\s+LLC)?\s*\(\s*["']?Master Distributor["']?\s*\)/i);
  expect(text).toMatch(
    /BrightPeak Retail Solutions(?:\s+LLC)?\s*\(\s*["']?Marketing & E-commerce Manager["']?\s*\)/i,
  );
  expectNoCrossMappedQuotedAliases(text, TEST442_ALL_PARTIES);
  expect(text).toMatch(/State of Oklahoma/i);
  expect(text).toMatch(/12\.\s+GOVERNING LAW/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  const structure = applySectionStructureIntegrity(text, {
    source: "test442_opening_recital",
    repair: false,
  });
  expect(structure.anomalyCount).toBe(0);
}

describe("TEST442 — Brand licensing opening recital alias authority", () => {
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

  it("detects live-style cross-mapped quoted legal-name aliases in opening recital", () => {
    const draft = test441BrightPeakFirstDraft();
    const corrupted = buildTest442CrossMappedOpeningCorpus();
    const markers = test442CrossMappedOpeningMarkers();
    expect(corrupted).toContain(markers.brightPeakAlias);
    expect(corrupted).toContain(markers.evergreenAlias);
    expect(brandLicensingOpeningRecitalNeedsAuthorityRepair(corrupted, TEST442_REALISTIC_PROSE_INTAKE, draft)).toBe(
      true,
    );
    expect(detectOpeningRecitalCrossMappedLegalNameAliases(corrupted, TEST442_ALL_PARTIES)).toBe(true);
  });

  it("repairs cross-mapped opening recital via brand licensing frozen corpus authority", () => {
    const draft = test441BrightPeakFirstDraft();
    const corrupted = buildTest442CrossMappedOpeningCorpus();
    const repaired = applyBrandLicensingFrozenCorpusAuthority(corrupted, draft, TEST442_REALISTIC_PROSE_INTAKE);
    expectBrandLicensingOpeningRecitalAuthority(repaired.text);
    expect(brandLicensingOpeningRecitalNeedsAuthorityRepair(repaired.text, TEST442_REALISTIC_PROSE_INTAKE, draft)).toBe(
      false,
    );
    expect(repaired.text.indexOf(TEST440_EVERGREEN)).toBeLessThan(repaired.text.indexOf("BrightPeak"));
  });

  it("display layer and frozen manifest authority preserve correct opening recital aliases", () => {
    const draft = test441BrightPeakFirstDraft();
    const corrupted = buildTest442CrossMappedOpeningCorpus();
    const authority = applyBrandLicensingFrozenCorpusAuthority(corrupted, draft, TEST442_REALISTIC_PROSE_INTAKE);

    const display = polishProAgreementDisplayLayer(authority.text, {
      draft,
      intakeText: TEST442_REALISTIC_PROSE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingOpeningRecitalAuthority(display.text);

    const frozenManifest = applyFrozenManifestPaidProDisplayAuthority(display.text, {
      draft,
      intakeText: TEST442_REALISTIC_PROSE_INTAKE,
    });
    expectBrandLicensingOpeningRecitalAuthority(frozenManifest.text);
  });

  it("freeze commit repairs cross-mapped opening before SoT eligibility", () => {
    const draft = test441BrightPeakFirstDraft();
    const corrupted = buildTest442CrossMappedOpeningCorpus();
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: corrupted,
      draft,
      intakeText: TEST442_REALISTIC_PROSE_INTAKE,
      source: "server_full_draft",
      generationOutcome: "ok",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expectBrandLicensingOpeningRecitalAuthority(freezeCommit.text);
  });

  it("final display path keeps four signers without count mismatch", () => {
    const draft = test441BrightPeakFirstDraft();
    const corrupted = buildTest442CrossMappedOpeningCorpus();
    const repaired = applyBrandLicensingFrozenCorpusAuthority(corrupted, draft, TEST442_REALISTIC_PROSE_INTAKE);
    const display = polishProAgreementDisplayLayer(repaired.text, {
      draft,
      intakeText: TEST442_REALISTIC_PROSE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });

    const signerAuthority = resolveAuthoritativeSignerCount({
      intakeText: TEST442_REALISTIC_PROSE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: display.text,
    });
    expect(signerAuthority.count).toBe(4);

    const consumed = consumeAuthoritativeSignerCount("guided_pre_review_signer_slots", {
      intakeText: TEST442_REALISTIC_PROSE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: display.text,
    });
    expect(consumed).toBe(4);
    expectBrandLicensingOpeningRecitalAuthority(display.text);
  });

  it("premium completion with server-success cross-mapped opening repairs recital on display", async () => {
    const draft = test441BrightPeakFirstDraft();
    const serverBody = buildTest442CrossMappedOpeningCorpus();
    premiumApiMock.mockResponses = [
      {
        title: "Brand Licensing and Distribution Agreement",
        agreement_family: "services_agreement",
        document_text: serverBody,
        server_full_document_text: serverBody,
        key_terms_found: ["payment", "governing_law"],
        missing_material_info: [],
        generation_outcome: "ok",
      },
    ];

    const out = await runPremiumCompletion({
      intakeText: TEST442_REALISTIC_PROSE_INTAKE,
      originalUserIntakeRawForMerge: TEST442_REALISTIC_PROSE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test442-opening-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test442-opening",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.proIntentGateMessage).toBeNull();
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(4000);

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST442_REALISTIC_PROSE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingOpeningRecitalAuthority(display.text);
  });
});
