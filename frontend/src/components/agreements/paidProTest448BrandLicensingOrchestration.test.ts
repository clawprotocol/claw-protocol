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
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
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
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  readProGenerationAdoption,
  tryCommitProGenerationAdoption,
} from "./paidProGenerationAdoption";
import {
  isPaidProStarterFallbackDisplayOnly,
  shouldBlockPaidProCanonicalFreezeOnApiFailure,
} from "./paidProApiFailureAuthorityGuard";
import {
  buildTest448DegradedJsonParseDocumentText,
  buildTest448StarterFreeCorpus1319,
  buildTest448StarterFreeCorpus2228,
  buildTest448SuccessfulServerBody,
  buildTest448WireHeadTitleMismatchBody,
  TEST448_ALL_PARTIES,
  TEST448_LIVE_INTAKE,
  TEST448_STARTER_LEN,
  TEST448_TARGET_DEGRADED_LEN,
  TEST448_TARGET_SERVER_LEN,
  TEST448_TRANSACTION_TITLE,
  test448BrightPeakFirstDraft,
} from "./paidProTest448BrandLicensingOrchestrationFixtures";

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

function needsDetailsServerFullResult(serverBody: string): PremiumFullDraftResult {
  return {
    title: TEST448_TRANSACTION_TITLE,
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
  expect(text).toContain(TEST448_TRANSACTION_TITLE);
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
    source: "test448_final_corpus",
    repair: false,
  });
  expect(structure.anomalyCount).toBe(0);
  expect(text).not.toMatch(/\bParty\s+5\b/i);
  expect(text).not.toMatch(/Summit Outdoor Partners/i);
  for (const party of TEST448_ALL_PARTIES) {
    expect(text).toContain(party);
  }
}

describe("TEST448 — Brand licensing Pro orchestration / SoT adoption", () => {
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

  it("intent validation aligns with freeze candidate hash — not raw wire title", () => {
    const draft = test448BrightPeakFirstDraft();
    const wire = buildTest448WireHeadTitleMismatchBody();
    expect(wire.length).toBe(TEST448_TARGET_SERVER_LEN);

    const validation = validatePaidProOutput({
      text: wire,
      rawIntake: TEST448_LIVE_INTAKE,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);
    expect(validation.reasons).not.toContain(
      "intent:brand_licensing_title_requires_manufacturing_distribution_stack",
    );

    const prep = preparePaidProServerDocumentForAcceptance(wire, draft, TEST448_LIVE_INTAKE, {
      surface: "test448_intent_hash_prep",
    });
    const freeze = buildPaidProFreezeCandidate({
      text: prep.text,
      draft,
      intakeText: TEST448_LIVE_INTAKE,
      source: "server_full_draft",
      surface: "test448_intent_hash_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
    const freezeHash = paidProPipelineAcceptedCorpusHash(freeze.text);
    const wireHash = paidProPipelineAcceptedCorpusHash(wire);
    expect(freezeHash).toBeTruthy();
    expect(wireHash).not.toBe(freezeHash);
    expect(paidProPipelineAcceptedCorpusHash(freeze.text)).toBe(freezeHash);
  });

  it("fixture degraded wire is ~8552 and retry body is ~28871", () => {
    const degraded = buildTest448DegradedJsonParseDocumentText();
    expect(degraded.length).toBe(TEST448_TARGET_DEGRADED_LEN);
    const server = buildTest448SuccessfulServerBody();
    expect(server.length).toBe(TEST448_TARGET_SERVER_LEN);
    const starter1319 = buildTest448StarterFreeCorpus1319();
    expect(starter1319.length).toBe(TEST448_STARTER_LEN);
    const starter2228 = buildTest448StarterFreeCorpus2228();
    expect(starter2228.length).toBe(2_228);
  });

  it("premium completion adopts Pro corpus — no retry card / starter masquerade", async () => {
    const draft = test448BrightPeakFirstDraft();
    const degraded = buildTest448DegradedJsonParseDocumentText();
    const serverBody = buildTest448SuccessfulServerBody();
    const starter1319 = buildTest448StarterFreeCorpus1319(draft);
    const starter2228 = buildTest448StarterFreeCorpus2228(draft);
    const generationId = `gen-test448-${Date.now()}`;
    const intakeFp = "fp-test448";

    applyAcceptedProCorpusSafeDisplay(starter1319, {
      draft,
      intakeText: TEST448_LIVE_INTAKE,
      surface: "test448_starter_poison_1319",
      sourceKind: "free_starter",
      partyCount: 4,
      agreementGenerationId: generationId,
      recoveryKind: "no-recovery",
    });
    applyAcceptedProCorpusSafeDisplay(starter2228, {
      draft,
      intakeText: TEST448_LIVE_INTAKE,
      surface: "test448_starter_poison_2228",
      sourceKind: "free_starter",
      partyCount: 4,
      agreementGenerationId: generationId,
      recoveryKind: "no-recovery",
    });

    const starterHash = hashPaidProCorpus(starter1319);

    premiumApiMock.mockResponses = [
      degradedJsonParseResult(degraded),
      needsDetailsServerFullResult(serverBody),
    ];

    const out = await runPremiumCompletion({
      intakeText: TEST448_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST448_LIVE_INTAKE,
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
    expect(out.premiumRenderSource).not.toBe("premium_generation_retryable");
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.premiumRenderSource).not.toBe("premium_degraded_server_local_recovery");
    expect(authoritativePremiumPipelineResultForUiApply(out)).toBe(true);
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);

    const adopted = readProGenerationAdoption(generationId, intakeFp);
    expect(adopted).not.toBeNull();
    expect(adopted?.body.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(adopted?.hash).not.toBe(starterHash);

    const winningHash = hashPaidProCorpus(out.winningPremiumBodyText);
    expect(winningHash).toBe(adopted?.hash);
    expect(winningHash).not.toBe(starterHash);

    const validation = validatePaidProOutput({
      text: out.winningPremiumBodyText,
      rawIntake: TEST448_LIVE_INTAKE,
      draft,
      premiumPipelineSource: out.premiumRenderSource,
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST448_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingReviewCorpus(display.text);
    expect(hashPaidProCorpus(display.text)).not.toBe(starterHash);

    establishPaidProSourceOfTruth({
      text: display.text,
      source: out.premiumRenderSource,
      draft,
      intakeText: TEST448_LIVE_INTAKE,
      reviewSessionId: generationId,
      agreementGenerationId: generationId,
      generationOutcome: "needs_details",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.trim().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(hashPaidProCorpus(sot)).not.toBe(starterHash);
    expectBrandLicensingReviewCorpus(sot);

    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: out.premiumRenderSource,
        corpusLen: sot.length,
      }),
    ).toBe(false);
    expect(
      isPaidProStarterFallbackDisplayOnly({
        premiumRenderSource: out.premiumRenderSource,
        corpusLen: sot.length,
      }),
    ).toBe(false);

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft,
      intakeText: TEST448_LIVE_INTAKE,
    });
    expect(reviewPlain.trim().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(reviewPlain).toContain(TEST448_TRANSACTION_TITLE);

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST448_LIVE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: display.text,
    });
    expect(authority.count).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("paid_pro_structural_recovery", {
        intakeText: TEST448_LIVE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 5,
        corpusPlain: display.text,
      }),
    ).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("enforcePaidProSingleExecutionBlock", {
        intakeText: TEST448_LIVE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: display.text,
      }),
    ).toBe(4);
  });

  it("adoption latch blocks weaker starter override after Pro commit", () => {
    const draft = test448BrightPeakFirstDraft();
    const generationId = `gen-test448-latch-${Date.now()}`;
    const intakeFp = "fp-test448-latch";
    const proBody = buildTest448SuccessfulServerBody();
    const starter = buildTest448StarterFreeCorpus1319(draft);

    const committed = tryCommitProGenerationAdoption({
      generationId,
      intakeFingerprint: intakeFp,
      intakeText: TEST448_LIVE_INTAKE,
      body: proBody,
      source: "server_full_draft",
      freezeCandidateHash: paidProPipelineAcceptedCorpusHash(proBody),
    });
    expect(committed.committed).toBe(true);

    const weaker = tryCommitProGenerationAdoption({
      generationId,
      intakeFingerprint: intakeFp,
      body: starter,
      source: "free_starter",
    });
    expect(weaker.committed).toBe(false);
    expect(weaker.reason).toBe("weaker_than_adopted");
    expect(readProGenerationAdoption(generationId, intakeFp)?.hash).toBe(hashPaidProCorpus(proBody));
  });
});
