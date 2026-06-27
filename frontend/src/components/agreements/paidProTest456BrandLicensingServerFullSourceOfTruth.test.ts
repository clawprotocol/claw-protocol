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
} from "./paidProSourceOfTruth";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { finalizeUserVisibleAgreementPlainText } from "./agreementTemplatePlaceholderSafety";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { normalizePremiumFullDraftResponsePayload } from "./premiumFullDraftResponseNormalization";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import {
  consumeAuthoritativeSignerCount,
  resolveAuthoritativeSignerCount,
} from "./signerCountAuthority";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import {
  buildTest456LiveRailwayDefectiveBody,
  TEST456_ALL_PARTIES,
  TEST456_LIVE_INTAKE,
  TEST456_MIN_SERVER_LEN,
  TEST456_TARGET_SERVER_LEN,
  TEST456_TRANSACTION_TITLE,
  test456BrightPeakFirstDraft,
} from "./paidProTest456Fixtures";

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
    title: TEST456_TRANSACTION_TITLE,
    agreement_family: "services_agreement",
    document_text: serverBody,
    server_full_document_text: serverBody,
    key_terms_found: ["payment", "governing_law"],
    missing_material_info: [],
    generation_outcome: "ok",
  };
}

function expectTest456FinalCorpus(text: string): void {
  expect(text).toContain(TEST456_TRANSACTION_TITLE);
  expect(text.length).toBeGreaterThan(20_000);
  expect(text).not.toMatch(/\b14\.\s+Supplemental Provision\b/i);
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  expect(witnessIdx).toBeGreaterThan(0);
  const afterWitness = text.slice(witnessIdx);
  expect(afterWitness).not.toMatch(/\n\s*\d+\.\s+(?:Supplemental|Operational supplement|Additional Provision)\b/i);
  expect(text).not.toMatch(/^\s*CLIENT\s*:/im);
  expect(text).not.toMatch(/^\s*SERVICE PROVIDER\s*:/im);
  expect(text).not.toMatch(/^\s*PARTY\s+3\s*:/im);
  expect(text).not.toMatch(/^\s*PARTY\s+4\s*:/im);
  expect(text).not.toMatch(/Summit Outdoor Partners/i);
  expect(text).not.toMatch(/\bParty\s+5\b/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  for (const party of TEST456_ALL_PARTIES) {
    expect(text).toContain(party);
  }
  const structure = applySectionStructureIntegrity(text, {
    source: "test456_final_corpus",
    repair: false,
  });
  expect(structure.anomalyCount).toBe(0);
}

describe("TEST456 — keep substantive server_full when notice signer-setup scaffolding is nonfatal", () => {
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

  it("fixture server body is ~30k with live Railway defects", () => {
    const defective = buildTest456LiveRailwayDefectiveBody();
    expect(defective.length).toBeGreaterThanOrEqual(TEST456_MIN_SERVER_LEN);
    expect(defective.length).toBeLessThanOrEqual(TEST456_TARGET_SERVER_LEN + 500);
    expect(defective).toMatch(/to be completed/i);
    expect(defective).toMatch(/provided during signer setup/i);
    expect(defective).toMatch(/^\s*CLIENT\s*:/im);
    expect(defective).toMatch(/\b14\.\s+Supplemental Provision\b/i);
    expect(defective).toMatch(/Summit Outdoor Partners/i);
  });

  it("normalized premium wire keeps substantive server_full_document_text", () => {
    const serverBody = buildTest456LiveRailwayDefectiveBody();
    const normalized = normalizePremiumFullDraftResponsePayload(
      okServerFullResult(serverBody) as PremiumFullDraftResult & Record<string, unknown>,
    );
    expect((normalized.wire.server_full_document_text ?? "").length).toBeGreaterThan(20_000);
    expect(normalized.authoritativeText.length).toBeGreaterThan(20_000);
  });

  it("safe display preserves substantive brand-licensing server wire", () => {
    const draft = test456BrightPeakFirstDraft();
    const body = buildTest456LiveRailwayDefectiveBody();
    const safe = applyAcceptedProCorpusSafeDisplay(body, {
      draft,
      intakeText: TEST456_LIVE_INTAKE,
      surface: "test456_safe_display",
    });
    expect(safe.text.length).toBeGreaterThan(20_000);
  });

  it("diagnostic: freeze path preserves substantive wire length", async () => {
    const { preparePaidProServerDocumentForAcceptance } = await import("./paidProConciseServicesQuality");
    const { buildPaidProFreezeCandidate } = await import("./paidProFreezeCandidate");
    const draft = test456BrightPeakFirstDraft();
    const body = buildTest456LiveRailwayDefectiveBody();
    const ph = finalizeUserVisibleAgreementPlainText(body, {
      intakeRaw: TEST456_LIVE_INTAKE,
      partyNames: TEST456_ALL_PARTIES,
      agreementFamily: draft.agreement_family ?? null,
      surface: "premium_completion_pipeline",
    });
    const prep = preparePaidProServerDocumentForAcceptance(ph.text, draft, TEST456_LIVE_INTAKE, {
      surface: "premium_completion_pipeline_freeze_prep",
    });
    const freeze = buildPaidProFreezeCandidate({
      text: prep.text,
      draft,
      intakeText: TEST456_LIVE_INTAKE,
      source: "server_full_draft",
      surface: "test456_diagnostic",
    });
    expect(ph.text.length, "placeholder_gate").toBeGreaterThan(TEST456_MIN_SERVER_LEN);
    expect(prep.text.length, `prep:${prep.repairs.join(",")}`).toBeGreaterThan(20_000);
    expect(freeze.ok, `${freeze.rejectReason ?? "freeze_failed"} ph=${ph.text.length} prep=${prep.text.length} freeze=${freeze.text.length}`).toBe(true);
  });

  it("placeholder gate treats notice signer-setup scaffolding as warn-only on substantive server_full", () => {
    const draft = test456BrightPeakFirstDraft();
    const defective = buildTest456LiveRailwayDefectiveBody();
    expect(defective.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    const ph = finalizeUserVisibleAgreementPlainText(defective, {
      intakeRaw: TEST456_LIVE_INTAKE,
      partyNames: TEST456_ALL_PARTIES,
      agreementFamily: draft.agreement_family ?? null,
      surface: "premium_completion_pipeline",
    });
    expect(ph.ok, ph.remainingFatal.join("|")).toBe(true);
    expect(ph.remainingDetail.filter((d) => d.fatal)).toHaveLength(0);
  });

  it("premium completion keeps server_full_draft — no structural recovery for notice scaffolding", async () => {
    const draft = test456BrightPeakFirstDraft();
    const serverBody = buildTest456LiveRailwayDefectiveBody();
    const generationId = `gen-test456-${Date.now()}`;

    premiumApiMock.mockResponses = [okServerFullResult(serverBody)];

    const out = await runPremiumCompletion({
      intakeText: TEST456_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST456_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: "fp-test456",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.proIntentGateMessage).toBeNull();
    expect(out.premiumRenderSource).toMatch(/server_full_draft|server_full_document_text/);
    expect(out.premiumRenderSource).not.toBe("structural_recovery");
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(20_000);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(
      Math.min(serverBody.length, TEST456_TARGET_SERVER_LEN) * 0.65,
    );

    const validation = validatePaidProOutput({
      text: out.winningPremiumBodyText,
      rawIntake: TEST456_LIVE_INTAKE,
      draft,
      premiumPipelineSource: out.premiumRenderSource,
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST456_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectTest456FinalCorpus(display.text);

    establishPaidProSourceOfTruth({
      text: display.text,
      source: out.premiumRenderSource,
      draft,
      intakeText: TEST456_LIVE_INTAKE,
      reviewSessionId: generationId,
      generationOutcome: "ok",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);
    expectTest456FinalCorpus(getPaidProSourceOfTruthText());

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft,
      intakeText: TEST456_LIVE_INTAKE,
    });
    expect(reviewPlain.trim().length).toBeGreaterThan(20_000);
    expectTest456FinalCorpus(reviewPlain);

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST456_LIVE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: display.text,
    });
    expect(authority.count).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("guided_pre_review_signer_slots", {
        intakeText: TEST456_LIVE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: display.text,
      }),
    ).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("guided_signer_setup_blockers", {
        intakeText: TEST456_LIVE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: display.text,
      }),
    ).toBe(4);
  });
});
