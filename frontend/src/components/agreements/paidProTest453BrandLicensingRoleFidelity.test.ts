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
import type { PremiumFullDraftApiResult } from "./premiumFullDraftApi";
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
  PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { buildDeterministicQuadPartyBrandLicensingProFallback } from "./deterministicQuadPartyProFallback";
import {
  assessBrandLicensingRoleFidelity,
  resolveBrandLicensingAuthoritativeRoleMap,
  resolveBrandLicensingEntityForRoleSlot,
} from "./paidProBrandLicensingRoleMap";
import { validateIntentContractForPaidProOutput, resolvePaidProIntentContract } from "./agreementIntentContract";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { previewPostCheckoutRecoverySotCommit } from "./paidProPostCheckoutRecoveryAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  TEST453_ALL_PARTIES,
  TEST453_LIVE_INTAKE,
  TEST453_TRANSACTION_TITLE,
  test453GenericPartyRolesDraft,
} from "./paidProTest453BrandLicensingRoleFidelityFixtures";
import { buildTest452SubstantiveServerBody } from "./paidProTest452SoTEstablishmentAfterRetryFixtures";
import {
  TEST440_EVERGREEN,
  TEST440_BRIGHT_PEAK,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";

const premiumApiMock = vi.hoisted(() => ({
  call: 0,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: (): Promise<PremiumFullDraftApiResult> => {
      premiumApiMock.call += 1;
      return Promise.resolve({
        ok: false,
        failure_kind: "network",
        retryable: true,
        error_code: "network_changed",
        document_text: "",
        attemptCount: 2,
      });
    },
    postPremiumFullDraftOnce: () =>
      Promise.reject(new Error("network_changed")),
  };
});

function expectBrandLicensingRoleFidelityCorpus(text: string): void {
  expect(text).toContain(TEST453_TRANSACTION_TITLE);
  expect(text).not.toMatch(/^SERVICES AGREEMENT$/m);
  expect(text).not.toMatch(/As stated in the agreement\.?/i);
  expect(text).not.toMatch(/primary business email on file with the Party/i);
  expect(text).toMatch(/provided during signer setup/i);
  expect(text).toMatch(/Evergreen Outdoor Brands LLC\s*\(\s*["']?Brand Owner["']?\s*\)/i);
  expect(text).toMatch(/Atlas Consumer Products Inc\.?\s*\(\s*["']?Manufacturer["']?\s*\)/i);
  expect(text).toMatch(/Horizon Wholesale Group(?:\s+LLC)?\s*\(\s*["']?Master Distributor["']?\s*\)/i);
  expect(text).toMatch(
    /BrightPeak Retail Solutions(?:\s+LLC)?\s*\(\s*["']?Marketing & E-commerce Manager["']?\s*\)/i,
  );
  expect(text).not.toMatch(/\bParty\s+1\b.*owns and controls the brand program/i);
  expect(text).toMatch(new RegExp(`${TEST440_EVERGREEN.replace(/\./g, "\\.")}[^\\n]{0,120}owns and controls the brand program`, "i"));
  expect(text).toMatch(new RegExp(`${TEST440_BRIGHT_PEAK.replace(/\./g, "\\.")}[^\\n]{0,120}marketing campaigns`, "i"));
  expect(text).toMatch(/12\.\s+GOVERNING LAW/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  for (const party of TEST453_ALL_PARTIES) {
    expect(text).toContain(party);
  }
  const fidelity = assessBrandLicensingRoleFidelity(text, TEST453_LIVE_INTAKE, test453GenericPartyRolesDraft());
  expect(fidelity.ok, fidelity.defects.join("|")).toBe(true);
}

describe("TEST453 — brand licensing role fidelity and recovery copy quality", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    premiumApiMock.call = 0;
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
    vi.unstubAllGlobals();
    storage.clear();
  });

  it("test452 server body passes role fidelity", () => {
    const draft = test453GenericPartyRolesDraft();
    const server = buildTest452SubstantiveServerBody();
    const fidelity = assessBrandLicensingRoleFidelity(server, TEST453_LIVE_INTAKE, draft);
    expect(fidelity.ok, fidelity.defects.join("|")).toBe(true);
  });

  it("extracts authoritative role map from bullet-format outdoor products intake", () => {
    const draft = test453GenericPartyRolesDraft();
    const map = resolveBrandLicensingAuthoritativeRoleMap(TEST453_LIVE_INTAKE, draft);
    expect(map.length).toBeGreaterThanOrEqual(4);
    expect(resolveBrandLicensingEntityForRoleSlot("brand_owner", TEST453_LIVE_INTAKE, draft)).toBe(TEST440_EVERGREEN);
    expect(resolveBrandLicensingEntityForRoleSlot("manufacturer", TEST453_LIVE_INTAKE, draft)).toMatch(/Atlas Consumer Products/i);
    expect(resolveBrandLicensingEntityForRoleSlot("master_distributor", TEST453_LIVE_INTAKE, draft)).toMatch(/Horizon Wholesale/i);
    expect(resolveBrandLicensingEntityForRoleSlot("marketing_ecommerce_manager", TEST453_LIVE_INTAKE, draft)).toMatch(
      /BrightPeak Retail/i,
    );
  });

  it("deterministic brand licensing fallback preserves roles when draft parties are generic", () => {
    const draft = test453GenericPartyRolesDraft();
    const fallback = buildDeterministicQuadPartyBrandLicensingProFallback({
      draft,
      rawIntake: TEST453_LIVE_INTAKE,
    });
    expect(fallback.ok, JSON.stringify(fallback.reasons)).toBe(true);
    expectBrandLicensingRoleFidelityCorpus(fallback.body);
  });

  it("network local recovery produces role-faithful Pro review corpus", () => {
    const draft = test453GenericPartyRolesDraft();
    const local = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST453_LIVE_INTAKE,
      recoverySurface: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(local.ok, JSON.stringify(local.reasons)).toBe(true);
    expect(local.body.length).toBeGreaterThan(7_500);

    const display = polishProAgreementDisplayLayer(local.body, {
      draft,
      intakeText: TEST453_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingRoleFidelityCorpus(display.text);

    const preview = previewPostCheckoutRecoverySotCommit({
      body: display.text,
      draft,
      intakeText: TEST453_LIVE_INTAKE,
      premiumRenderSource: PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible).toBe(true);
    expectBrandLicensingRoleFidelityCorpus(preview.displayPlain);
  });

  it("does not reject accepted brand licensing recovery with intent:generic_agreement_title", () => {
    const draft = test453GenericPartyRolesDraft();
    const fallback = buildDeterministicQuadPartyBrandLicensingProFallback({
      draft,
      rawIntake: TEST453_LIVE_INTAKE,
    });
    expect(fallback.ok).toBe(true);
    const contract = resolvePaidProIntentContract({ rawIntake: TEST453_LIVE_INTAKE });
    const intent = validateIntentContractForPaidProOutput({
      contract,
      text: fallback.body,
      rawIntake: TEST453_LIVE_INTAKE,
      draftTitle: TEST453_TRANSACTION_TITLE,
      authoritativeProPipelineAccepted: true,
    });
    expect(intent.reasons).not.toContain("intent:generic_agreement_title");
    expect(intent.ok, intent.reasons.join("|")).toBe(true);
  });

  it("premium completion opens Pro review via premium_network_local_recovery when both attempts fail", async () => {
    const draft = test453GenericPartyRolesDraft();
    const out = await runPremiumCompletion({
      intakeText: TEST453_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST453_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test453-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test453",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.premiumNetworkRetryable).toBe(true);
    expect(out.premiumNetworkLocalRecovery).toBe(true);
    expect(out.premiumRenderSource).toBe(PREMIUM_NETWORK_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(7_500);

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST453_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingRoleFidelityCorpus(display.text);
  });
});
