/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { clearFrozenPremiumSessionBodiesForTests, SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import {
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  clearPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import {
  authoritativePremiumPipelineResultForUiApply,
  paidProCheckoutCompletionHasVisibleOutcome,
} from "./premiumPostCheckoutApplyEligible";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import {
  buildCanonicalAgreementSnapshot,
  collectFatalPaidProPlaceholderIssueCodes,
  getFrozenCanonicalAgreementCorpus,
} from "./canonicalAgreementSnapshot";
import { resolvePaidProSotEstablishmentDecision } from "./paidProSotEstablishmentGate";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { buildTest448StarterFreeCorpus1319 } from "./paidProTest448BrandLicensingOrchestrationFixtures";
import { tryCommitProGenerationAdoption } from "./paidProGenerationAdoption";
import {
  buildTest452DegradedJsonParseDocumentText,
  buildTest452SubstantiveServerBody,
  TEST452_LIVE_INTAKE,
  TEST452_TARGET_DEGRADED_LEN,
  TEST452_TARGET_SERVER_LEN,
  TEST452_TRANSACTION_TITLE,
  test452BrightPeakFirstDraft,
} from "./paidProTest452SoTEstablishmentAfterRetryFixtures";

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
    title: TEST452_TRANSACTION_TITLE,
    agreement_family: "services_agreement",
    document_text: documentText,
    server_full_document_text: "",
    key_terms_found: [],
    missing_material_info: [],
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
  };
}

function needsDetailsServerFullResult(serverBody: string): PremiumFullDraftResult {
  return {
    title: TEST452_TRANSACTION_TITLE,
    agreement_family: "services_agreement",
    document_text: serverBody,
    server_full_document_text: serverBody,
    key_terms_found: ["payment", "governing_law"],
    missing_material_info: [],
    generation_outcome: "needs_details",
  };
}

describe("TEST452 — SoT establishment after server_full_draft_retry adoption", () => {
  const storage = new Map<string, string>();
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    premiumApiMock.mockResponses = [];
    premiumApiMock.callIndex = 0;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
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
    warnSpy.mockRestore();
    infoSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("fixture degraded ~8247 and retry server ~28854", () => {
    expect(buildTest452DegradedJsonParseDocumentText().length).toBe(TEST452_TARGET_DEGRADED_LEN);
    expect(buildTest452SubstantiveServerBody().length).toBe(TEST452_TARGET_SERVER_LEN);
  });

  it("nonfatal snapshot issue with empty fatal tokens does not block when freeze hash aligned", () => {
    const draft = test452BrightPeakFirstDraft();
    const server = buildTest452SubstantiveServerBody();
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: server,
      draft,
      intakeText: TEST452_LIVE_INTAKE,
      source: "server_full_draft_retry",
    });
    expect(freezeCommit.ok).toBe(true);
    const acceptedHash = freezeCommit.hash!;

    const withStructuralScan = buildCanonicalAgreementSnapshot({
      surface: "test452_structural_scan",
      tier: "pro",
      candidates: [{ source: "server_full_document_text", text: freezeCommit.text }],
      intakeText: TEST452_LIVE_INTAKE,
      parties: draft.parties.map((p) => ({
        name: String((p as { name?: string }).name ?? ""),
        role: String((p as { role?: string }).role ?? ""),
      })),
      signerState: { complete: false, signerCount: 4 },
      minLen: 500,
      forceAuthoritativePreservation: true,
    });

    const fatalOnly = collectFatalPaidProPlaceholderIssueCodes(freezeCommit.text, {
      intakeText: TEST452_LIVE_INTAKE,
      partyNames: draft.parties.map((p) => String((p as { name?: string }).name ?? "")),
    });
    expect(fatalOnly).toHaveLength(0);

    const decision = resolvePaidProSotEstablishmentDecision({
      snapshot: withStructuralScan,
      corpusText: freezeCommit.text,
      freezeGatesPassed: true,
      acceptedFreezeHash: acceptedHash,
      adoptedHash: acceptedHash,
      intakeRaw: TEST452_LIVE_INTAKE,
      partyNames: draft.parties.map((p) => String((p as { name?: string }).name ?? "")),
    });

    expect(decision.blocked).toBe(false);
    expect(decision.blockedBy).toBeNull();
    if (withStructuralScan.placeholderIssues.length > 0 || !withStructuralScan.integrityOk) {
      expect(decision.warnOnly).toBe(true);
    }
    expect(decision.sotCandidateHash).toBe(acceptedHash);
  });

  it("establishPaidProSourceOfTruth writes snapshot for adopted server_full_draft_retry hash", () => {
    const draft = test452BrightPeakFirstDraft();
    const server = buildTest452SubstantiveServerBody();
    const generationId = `gen-test452-${Date.now()}`;
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: server,
      draft,
      intakeText: TEST452_LIVE_INTAKE,
      source: "server_full_draft_retry",
      agreementGenerationId: generationId,
    });
    expect(freezeCommit.ok).toBe(true);
    markPaidProPipelineValidationPassed({ text: freezeCommit.text, source: "server_full_draft_retry" });
    tryCommitProGenerationAdoption({
      generationId,
      intakeFingerprint: "fp-test452",
      intakeText: TEST452_LIVE_INTAKE,
      body: freezeCommit.text,
      source: "server_full_draft_retry",
      freezeCandidateHash: freezeCommit.hash,
    });

    const display = polishProAgreementDisplayLayer(freezeCommit.text, {
      draft,
      intakeText: TEST452_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });

    establishPaidProSourceOfTruth({
      text: display.text,
      source: "server_full_draft_retry",
      draft,
      intakeText: TEST452_LIVE_INTAKE,
      reviewSessionId: generationId,
      agreementGenerationId: generationId,
      generationOutcome: "needs_details",
    });

    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(getPaidProSourceOfTruth()!.hash).toBe(freezeCommit.hash);
    expect(getFrozenCanonicalAgreementCorpus()?.hash).toBe(freezeCommit.hash);
    expect(getPaidProSourceOfTruthText().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
  });

  it("degraded json_parse then 31k retry opens Pro review without blocking SoT paths", async () => {
    const draft = test452BrightPeakFirstDraft();
    const degraded = buildTest452DegradedJsonParseDocumentText();
    const serverBody = buildTest452SubstantiveServerBody();
    const starter = buildTest448StarterFreeCorpus1319(draft);
    const generationId = `gen-test452-pipeline-${Date.now()}`;

    applyAcceptedProCorpusSafeDisplay(starter, {
      draft,
      intakeText: TEST452_LIVE_INTAKE,
      surface: "test452_starter_poison",
      sourceKind: "free_starter",
      partyCount: 0,
      agreementGenerationId: generationId,
    });

    premiumApiMock.mockResponses = [
      degradedJsonParseResult(degraded),
      needsDetailsServerFullResult(serverBody),
    ];

    const out = await runPremiumCompletion({
      intakeText: TEST452_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST452_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: "fp-test452",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.proIntentGateMessage).toBeNull();
    expect(out.premiumRenderSource).toBe("server_full_draft_retry");
    expect(authoritativePremiumPipelineResultForUiApply(out)).toBe(true);
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);

    const committedHash = paidProPipelineAcceptedCorpusHash(out.winningPremiumBodyText)!;
    expect(committedHash).toBeTruthy();

    const validation = validatePaidProOutput({
      text: out.winningPremiumBodyText,
      rawIntake: TEST452_LIVE_INTAKE,
      draft,
      premiumPipelineSource: out.premiumRenderSource,
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);
    expect(validation.reasons).not.toContain("deterministic_recovery_freeze_candidate_ok");

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST452_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });

    establishPaidProSourceOfTruth({
      text: display.text,
      source: "server_full_draft_retry",
      draft,
      intakeText: TEST452_LIVE_INTAKE,
      reviewSessionId: generationId,
      agreementGenerationId: generationId,
      generationOutcome: "needs_details",
    });

    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(getPaidProSourceOfTruth()!.hash).toBe(committedHash);

    const safeDisplay = applyAcceptedProCorpusSafeDisplay(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST452_LIVE_INTAKE,
      surface: "test452_post_accept",
      sourceKind: "server_full_draft_retry",
      partyCount: 4,
      agreementGenerationId: generationId,
    });
    expect(safeDisplay.text.length).toBeGreaterThan(starter.length * 2);

    expect(warnSpy.mock.calls.some((c) => c[0] === "[paid-pro-sot-freeze-placeholder-reject]")).toBe(
      false,
    );
    expect(infoSpy.mock.calls.some((c) => c[0] === "[paid-pro-fallback-display-only]")).toBe(false);
  });
});
