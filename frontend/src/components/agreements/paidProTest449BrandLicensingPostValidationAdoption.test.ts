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
  buildTest449DegradedJsonParseDocumentText,
  buildTest449SuccessfulServerBody,
  TEST449_ALL_PARTIES,
  TEST449_LIVE_INTAKE,
  TEST449_TARGET_DEGRADED_LEN,
  TEST449_TARGET_SERVER_LEN,
  TEST449_TRANSACTION_TITLE,
  test449BrightPeakFirstDraft,
} from "./paidProTest449BrandLicensingPostValidationAdoptionFixtures";
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
    title: TEST449_TRANSACTION_TITLE,
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
  expect(text).toContain(TEST449_TRANSACTION_TITLE);
  expect(text).not.toMatch(/^SERVICES AGREEMENT$/m);
  expect(text).toMatch(/State of Oklahoma/i);
  expect(text).toMatch(/12\.\s+GOVERNING LAW/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  expect(detectPaidProSectionHeadingTitleAnomalies(text).length).toBe(0);
  const structure = applySectionStructureIntegrity(text, {
    source: "test449_final_corpus",
    repair: false,
  });
  expect(structure.anomalyCount).toBe(0);
  expect(text).not.toMatch(/\bParty\s+5\b/i);
  for (const party of TEST449_ALL_PARTIES) {
    expect(text).toContain(party);
  }
}

describe("TEST449 — Brand licensing post-validation adoption / accStructural bypass", () => {
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

  it("fixture degraded ~8466 and retry server ~28442", () => {
    const degraded = buildTest449DegradedJsonParseDocumentText();
    expect(degraded.length).toBe(TEST449_TARGET_DEGRADED_LEN);
    const server = buildTest449SuccessfulServerBody();
    expect(server.length).toBe(TEST449_TARGET_SERVER_LEN);
  });

  it("validatePaidProOutput accepts substantive server while acc structural gate is mocked to fail", () => {
    const draft = test449BrightPeakFirstDraft();
    const server = buildTest449SuccessfulServerBody();
    const validation = validatePaidProOutput({
      text: server,
      rawIntake: TEST449_LIVE_INTAKE,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);
  });

  it("premium completion adopts validated 28k server corpus when accStructural fails but vPaid passes", async () => {
    const draft = test449BrightPeakFirstDraft();
    const degraded = buildTest449DegradedJsonParseDocumentText();
    const serverBody = buildTest449SuccessfulServerBody();
    const generationId = `gen-test449-${Date.now()}`;
    const intakeFp = "fp-test449";

    premiumApiMock.mockResponses = [
      degradedJsonParseResult(degraded),
      needsDetailsServerFullResult(serverBody),
    ];

    const out = await runPremiumCompletion({
      intakeText: TEST449_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST449_LIVE_INTAKE,
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
        out.premiumRenderSource === "server_full_draft_degraded" ||
        out.premiumRenderSource === "structural_recovery",
    ).toBe(true);
    expect(authoritativePremiumPipelineResultForUiApply(out)).toBe(true);
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);

    const adopted = readProGenerationAdoption(generationId, intakeFp);
    if (adopted) {
      expect(hashPaidProCorpus(out.winningPremiumBodyText)).toBe(adopted.hash);
    }

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST449_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingReviewCorpus(display.text);

    const validation = validatePaidProOutput({
      text: out.winningPremiumBodyText,
      rawIntake: TEST449_LIVE_INTAKE,
      draft,
      premiumPipelineSource: out.premiumRenderSource,
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);
    const validatedFreezeHash = paidProPipelineAcceptedCorpusHash(out.winningPremiumBodyText);
    expect(hashPaidProCorpus(out.winningPremiumBodyText)).toBe(validatedFreezeHash);

    establishPaidProSourceOfTruth({
      text: display.text,
      source: out.premiumRenderSource,
      draft,
      intakeText: TEST449_LIVE_INTAKE,
      reviewSessionId: generationId,
      agreementGenerationId: generationId,
      generationOutcome: "needs_details",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.trim().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expectBrandLicensingReviewCorpus(sot);

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST449_LIVE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 5,
      corpusPlain: display.text,
    });
    expect(authority.count).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("paid_pro_structural_recovery", {
        intakeText: TEST449_LIVE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 5,
        corpusPlain: display.text,
      }),
    ).toBe(4);
  });
});
