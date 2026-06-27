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
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { buildPaidProStructuralRecoveryBody } from "./paidProStructuralRecovery";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
import {
  assessBrandLicensingRoleFidelity,
  resolveBrandLicensingEntityForRoleSlot,
} from "./paidProBrandLicensingRoleMap";
import {
  assessRepeatedSupplementalProvisionsFiller,
  stripRepeatedSupplementalProvisionsFiller,
} from "./paidProSupplementalProvisionsFillerGate";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { previewPostCheckoutRecoverySotCommit } from "./paidProPostCheckoutRecoveryAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { buildDeterministicQuadPartyBrandLicensingProFallback } from "./deterministicQuadPartyProFallback";
import {
  TEST454_ALL_PARTIES,
  TEST454_LIVE_INTAKE,
  TEST454_TRANSACTION_TITLE,
  buildTest454LegacyRepeatedFillerCorpus,
  test454GenericPartyRolesDraft,
} from "./paidProTest454SupplementalProvisionsFillerFixtures";
import {
  TEST440_EVERGREEN,
  TEST440_BRIGHT_PEAK,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { rejectPremiumDegradedFiller } from "./premiumFullDraftClientAcceptance";

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

function expectTest454BrandLicensingCorpus(text: string, draft = test454GenericPartyRolesDraft()): void {
  expect(text).toContain(TEST454_TRANSACTION_TITLE);
  expect(text).not.toMatch(/^SERVICES AGREEMENT$/m);
  expect(text).not.toMatch(/As stated in the agreement\.?/i);
  expect(text).not.toMatch(/primary business email on file with the Party/i);
  expect(text).not.toMatch(/primary business address on file with the Party/i);
  expect(text).toMatch(/provided during signer setup|Notice details to be completed in signer setup/i);
  expect(text).not.toMatch(/\bParty\s+1\b.*owns and controls the brand program/i);
  expect(text).toMatch(
    /Evergreen Outdoor Brands LLC\s*\(\s*["']?Brand Owner["']?\s*\)/i,
  );
  expect(text).toMatch(/Atlas Consumer Products Inc\.?\s*\(\s*["']?Manufacturer["']?\s*\)/i);
  expect(text).toMatch(/Horizon Wholesale Group(?:\s+LLC)?\s*\(\s*["']?Master Distributor["']?\s*\)/i);
  expect(text).toMatch(
    /BrightPeak Retail Solutions(?:\s+LLC)?\s*\(\s*["']?Marketing & E-commerce Manager["']?\s*\)/i,
  );
  expect(text).toMatch(
    new RegExp(`${TEST440_EVERGREEN.replace(/\./g, "\\.")}[^\\n]{0,120}owns and controls the brand program`, "i"),
  );
  expect(text).toMatch(
    new RegExp(`${TEST440_BRIGHT_PEAK.replace(/\./g, "\\.")}[^\\n]{0,120}marketing campaigns`, "i"),
  );
  expect(text).toMatch(/12\.\s+GOVERNING LAW/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  for (const party of TEST454_ALL_PARTIES) {
    expect(text).toContain(party);
  }
  const filler = assessRepeatedSupplementalProvisionsFiller(text);
  expect(filler.ok, filler.reasons.join("|")).toBe(true);
  expect(rejectPremiumDegradedFiller(text).ok).toBe(true);
  const fidelity = assessBrandLicensingRoleFidelity(text, TEST454_LIVE_INTAKE, draft);
  expect(fidelity.ok, fidelity.defects.join("|")).toBe(true);
}

describe("TEST454 — Supplemental Provisions filler gate and role-faithful recovery", () => {
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

  it("detects and strips legacy repeated Supplemental Provisions filler", () => {
    const fallback = buildDeterministicQuadPartyBrandLicensingProFallback({
      draft: test454GenericPartyRolesDraft(),
      rawIntake: TEST454_LIVE_INTAKE,
    });
    expect(fallback.ok).toBe(true);
    const legacy = buildTest454LegacyRepeatedFillerCorpus(fallback.body, 15_000);
    const assessment = assessRepeatedSupplementalProvisionsFiller(legacy);
    expect(assessment.ok).toBe(false);
    expect(assessment.repeatCount).toBeGreaterThan(1);
    const stripped = stripRepeatedSupplementalProvisionsFiller(legacy);
    expect(assessRepeatedSupplementalProvisionsFiller(stripped.text).ok).toBe(true);
    expect(rejectPremiumDegradedFiller(stripped.text).ok).toBe(true);
  });

  it("structural recovery body has no filler and correct role mapping", () => {
    const draft = test454GenericPartyRolesDraft();
    const structural = buildPaidProStructuralRecoveryBody({
      intakeText: TEST454_LIVE_INTAKE,
      draft,
    });
    expect(structural.ok, structural.reason ?? "").toBe(true);
    expectTest454BrandLicensingCorpus(structural.body, draft);
    expect(resolveBrandLicensingEntityForRoleSlot("brand_owner", TEST454_LIVE_INTAKE, draft)).toBe(
      TEST440_EVERGREEN,
    );
  });

  it("structural recovery freeze candidate passes filler and role gates", () => {
    const draft = test454GenericPartyRolesDraft();
    const structural = buildPaidProStructuralRecoveryBody({
      intakeText: TEST454_LIVE_INTAKE,
      draft,
    });
    expect(structural.ok).toBe(true);
    const freeze = buildPaidProFreezeCandidate({
      text: structural.body,
      source: "structural_recovery",
      draft,
      intakeText: TEST454_LIVE_INTAKE,
      agreementGenerationId: "gen-test454",
      generationOutcome: "degraded",
      surface: "test454_structural_recovery",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    expectTest454BrandLicensingCorpus(freeze.text, draft);
  });

  it("degraded server local recovery produces role-faithful corpus without filler", () => {
    const draft = test454GenericPartyRolesDraft();
    const local = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft,
      rawIntake: TEST454_LIVE_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(local.ok, JSON.stringify(local.reasons)).toBe(true);
    const display = polishProAgreementDisplayLayer(local.body, {
      draft,
      intakeText: TEST454_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectTest454BrandLicensingCorpus(display.text, draft);
  });

  it("premium completion uses role-faithful recovery without Supplemental Provisions filler", async () => {
    const draft = test454GenericPartyRolesDraft();
    const out = await runPremiumCompletion({
      intakeText: TEST454_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST454_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test454-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test454",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.winningPremiumBodyText.length).toBeGreaterThan(7_500);

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST454_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectTest454BrandLicensingCorpus(display.text, draft);

    const preview = previewPostCheckoutRecoverySotCommit({
      body: display.text,
      draft,
      intakeText: TEST454_LIVE_INTAKE,
      premiumRenderSource: out.premiumRenderSource ?? PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(preview.eligible).toBe(true);
    expectTest454BrandLicensingCorpus(preview.displayPlain, draft);
  });
});
