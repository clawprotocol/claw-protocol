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
  clearPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { validateIntentContractForPaidProOutput, resolvePaidProIntentContract } from "./agreementIntentContract";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  countOperativeIfToNoticeStanzas,
  repairBareEntityOnlyNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import {
  applySectionStructureIntegrity,
  repairJoinedTopLevelSectionHeadings,
} from "./sectionStructureAuthority";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "./premiumNetworkRecoveryLocalDraft";
import {
  buildTest457LiveSuccessPolishDefectsBody,
  TEST457_ALL_PARTIES,
  TEST457_LIVE_INTAKE,
  TEST457_MIN_SERVER_LEN,
  TEST457_TARGET_SERVER_LEN,
  TEST457_TRANSACTION_TITLE,
  test457BrightPeakFirstDraft,
} from "./paidProTest457Fixtures";

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

function okServerFullResult(serverBody: string): PremiumFullDraftResult {
  return {
    title: TEST457_TRANSACTION_TITLE,
    agreement_family: "services_agreement",
    document_text: serverBody,
    server_full_document_text: serverBody,
    key_terms_found: ["payment", "governing_law"],
    missing_material_info: [],
    generation_outcome: "ok",
  };
}

function expectTest457PolishedCorpus(text: string): void {
  expect(text).toContain(TEST457_TRANSACTION_TITLE);
  expect(text.length).toBeGreaterThan(20_000);
  expect(text).not.toMatch(/\.[0-9]{1,2}\.\s+[A-Z]/);
  expect(text).toMatch(/\n12\.\s+Disputes,\s+Governing Law and Notices/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(text).toMatch(/Attention:\s+Authorized Signer/i);
  expect(text).toMatch(/Email:\s+provided during signer setup/i);
  expect(text).toMatch(/Address:\s+provided during signer setup/i);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  expect(text).not.toMatch(/^\s*CLIENT\s*:/im);
  expect(text).not.toMatch(/^\s*SERVICE PROVIDER\s*:/im);
  for (const party of TEST457_ALL_PARTIES) {
    expect(text).toContain(party);
  }
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  expect(witnessIdx).toBeGreaterThan(0);
  const afterWitness = text.slice(witnessIdx);
  expect(afterWitness).not.toMatch(/\n\s*\d+\.\s+(?:Supplemental|Operational supplement)\b/i);
}

describe("TEST457 — final professional polish after server_full SoT success", () => {
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
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("fixture server body is ~28.6k with joined heading and thin notice stanzas", () => {
    const body = buildTest457LiveSuccessPolishDefectsBody();
    expect(body.length).toBeGreaterThanOrEqual(TEST457_MIN_SERVER_LEN);
    expect(body.length).toBeLessThanOrEqual(TEST457_TARGET_SERVER_LEN + 800);
    expect(body).toMatch(/termination\.12\.\s+Disputes/i);
    expect(body).toMatch(/If to BrightPeak Retail Solutions LLC: BrightPeak/i);
  });

  it("structure and notice display repairs fix joined headings and thin stanzas", () => {
    const body = buildTest457LiveSuccessPolishDefectsBody();
    const joined = repairJoinedTopLevelSectionHeadings(body);
    expect(joined.repairs.length).toBeGreaterThan(0);
    expect(joined.text).not.toMatch(/termination\.12\.\s+Disputes/i);
    const notices = repairBareEntityOnlyNoticeStanzas(joined.text);
    expect(notices.repairs.length).toBeGreaterThan(0);
    const display = preparePaidProReviewDisplayPlain(notices.text);
    expectTest457PolishedCorpus(display.text);
  });

  it("post-freeze generic draft title does not reject accepted server_full SoT", () => {
    const draft = { ...test457BrightPeakFirstDraft(), title: "Agreement" };
    const body = buildTest457LiveSuccessPolishDefectsBody();
    const polished = polishProAgreementDisplayLayer(body, {
      draft,
      intakeText: TEST457_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    }).text;
    establishPaidProSourceOfTruth({
      text: polished,
      source: "server_full_draft",
      draft,
      intakeText: TEST457_LIVE_INTAKE,
      reviewSessionId: "gen-test457-intent",
      generationOutcome: "ok",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruth();
    expect(sot?.hash).toBeTruthy();

    const contract = resolvePaidProIntentContract({ rawIntake: TEST457_LIVE_INTAKE });
    const intentOnly = validateIntentContractForPaidProOutput({
      contract,
      text: polished,
      rawIntake: TEST457_LIVE_INTAKE,
      draftTitle: draft.title,
      authoritativeProPipelineAccepted: true,
    });
    expect(intentOnly.reasons).not.toContain("intent:generic_agreement_title");
    expect(intentOnly.ok, intentOnly.reasons.join("|")).toBe(true);

    const validation = validatePaidProOutput({
      text: polished,
      rawIntake: TEST457_LIVE_INTAKE,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);
    expect(validation.reasons).not.toContain("intent:generic_agreement_title");
  });

  it("premium completion keeps server_full_draft — no structural recovery fallback", async () => {
    const serverBody = buildTest457LiveSuccessPolishDefectsBody();
    premiumApiMock.mockResponses = [okServerFullResult(serverBody)];

    const draft = test457BrightPeakFirstDraft();
    const out = await runPremiumCompletion({
      intakeText: TEST457_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST457_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test457-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test457",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.proIntentGateMessage).toBeNull();
    expect(out.premiumRenderSource).toMatch(/server_full_draft/);
    expect(out.premiumRenderSource).not.toBe("structural_recovery");
    expect(out.premiumRenderSource).not.toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(20_000);

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST457_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectTest457PolishedCorpus(display.text);

    establishPaidProSourceOfTruth({
      text: display.text,
      source: out.premiumRenderSource,
      draft,
      intakeText: TEST457_LIVE_INTAKE,
      reviewSessionId: `gen-test457-${Date.now()}`,
      generationOutcome: "ok",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sotText = getPaidProSourceOfTruthText();
    expect(sotText.length).toBeGreaterThan(20_000);
    expect(hashPaidProCorpus(sotText)).toBe(getPaidProSourceOfTruth()?.hash);

    const structure = applySectionStructureIntegrity(display.text, {
      source: "test457_final_corpus",
      repair: true,
    });
    expect(structure.anomalyCount).toBe(0);
    expect(structure.text).toMatch(/\n12\.\s+Disputes/i);

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST457_LIVE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: display.text,
    });
    expect(authority.count).toBe(4);
  });
});
