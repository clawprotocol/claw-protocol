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
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  applyPaidProSectionStructureCompletenessAuthority,
  resetPaidProSectionStructureCompletenessLogsForTests,
} from "./paidProSectionStructureCompletenessAuthority";
import { tryCommitProGenerationAdoption } from "./paidProGenerationAdoption";
import {
  TEST460_LIVE_INTAKE,
  TEST460_TARGET_SERVER_LEN,
  buildTest460LiveRegressionServerBody,
  buildTest460SubstantiveServerBody,
  test460RedMesaDraft,
} from "./paidProTest460RedMesaSoTEstablishmentFixtures";

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

function needsDetailsServerFullResult(serverBody: string): PremiumFullDraftResult {
  return {
    title: "Mutual Consulting Services Agreement",
    agreement_family: "consulting_agreement",
    document_text: serverBody,
    server_full_document_text: serverBody,
    key_terms_found: ["payment", "governing_law", "confidentiality"],
    missing_material_info: [],
    generation_outcome: "needs_details",
    schema_validation_reasons: [],
  };
}

describe("TEST460 — Red Mesa SoT establishment after substantive server_full", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    resetPaidProSectionStructureCompletenessLogsForTests();
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

  it("fixture server body is substantive (~19841 chars)", () => {
    const server = buildTest460LiveRegressionServerBody();
    expect(server.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(server.length).toBeGreaterThanOrEqual(TEST460_TARGET_SERVER_LEN - 50);
  });

  it("notice signer-setup scaffolding demotes to zero fatal placeholders at SoT gate", () => {
    const draft = test460RedMesaDraft();
    const server = buildTest460LiveRegressionServerBody();
    const fatalOnly = collectFatalPaidProPlaceholderIssueCodes(server, {
      intakeText: TEST460_LIVE_INTAKE,
      partyNames: draft.parties.map((p) => String((p as { name?: string }).name ?? "")),
    });
    expect(fatalOnly).toHaveLength(0);
  });

  it("substantive heading title anomaly is warn-only when collapses are cleared", () => {
    const server = buildTest460LiveRegressionServerBody();
    const structure = applyPaidProSectionStructureCompletenessAuthority(server, {
      source: "test460_structure",
      phase: "pre_freeze",
      blockOnFatal: false,
      log: false,
    });
    expect(structure.rejected).toBe(false);
    expect(structure.rejectReason).not.toBe("section_heading_title_anomaly");
  });

  it("freeze commit accepts substantive server_full with exactly 4 notice stanzas", () => {
    const draft = test460RedMesaDraft();
    const server = buildTest460LiveRegressionServerBody();
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: server,
      draft,
      intakeText: TEST460_LIVE_INTAKE,
      source: "server_full_draft",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.text.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(countOperativeIfToNoticeStanzas(freezeCommit.text)).toBe(4);
    expect(countPaidProExecutionBlocks(freezeCommit.text)).toBe(1);

    const validation = validatePaidProOutput({
      text: freezeCommit.text,
      rawIntake: TEST460_LIVE_INTAKE,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.reasons).not.toContain("section_heading_title_anomaly");
  });

  it("SoT establishment decision is not blocked by stale fatal_placeholder", () => {
    const draft = test460RedMesaDraft();
    const server = buildTest460LiveRegressionServerBody();
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: server,
      draft,
      intakeText: TEST460_LIVE_INTAKE,
      source: "server_full_draft",
    });
    expect(freezeCommit.ok).toBe(true);
    const acceptedHash = freezeCommit.hash!;

    const snapshot = buildCanonicalAgreementSnapshot({
      surface: "test460_structural_scan",
      tier: "pro",
      candidates: [{ source: "server_full_document_text", text: freezeCommit.text }],
      intakeText: TEST460_LIVE_INTAKE,
      parties: draft.parties.map((p) => ({
        name: String((p as { name?: string }).name ?? ""),
        role: String((p as { role?: string }).role ?? ""),
      })),
      signerState: { complete: false, signerCount: 4 },
      minLen: 500,
      forceAuthoritativePreservation: true,
    });

    const fatalOnly = collectFatalPaidProPlaceholderIssueCodes(freezeCommit.text, {
      intakeText: TEST460_LIVE_INTAKE,
      partyNames: draft.parties.map((p) => String((p as { name?: string }).name ?? "")),
    });
    expect(fatalOnly).toHaveLength(0);

    const decision = resolvePaidProSotEstablishmentDecision({
      snapshot,
      corpusText: freezeCommit.text,
      freezeGatesPassed: true,
      acceptedFreezeHash: acceptedHash,
      adoptedHash: acceptedHash,
      intakeRaw: TEST460_LIVE_INTAKE,
      partyNames: draft.parties.map((p) => String((p as { name?: string }).name ?? "")),
    });

    expect(decision.blocked).toBe(false);
    expect(decision.blockedBy).toBeNull();
    expect(decision.blockedBy).not.toBe("fatal_placeholder");
    expect(decision.sotCandidateHash).toBe(acceptedHash);
  });

  it("establishPaidProSourceOfTruth succeeds and mounts substantive review corpus", () => {
    const draft = test460RedMesaDraft();
    const server = buildTest460LiveRegressionServerBody();
    const generationId = `gen-test460-${Date.now()}`;
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: server,
      draft,
      intakeText: TEST460_LIVE_INTAKE,
      source: "server_full_draft",
      agreementGenerationId: generationId,
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    markPaidProPipelineValidationPassed({ text: freezeCommit.text, source: "server_full_draft" });
    tryCommitProGenerationAdoption({
      generationId,
      intakeFingerprint: "fp-test460",
      intakeText: TEST460_LIVE_INTAKE,
      body: freezeCommit.text,
      source: "server_full_draft",
      freezeCandidateHash: freezeCommit.hash,
    });

    const display = polishProAgreementDisplayLayer(freezeCommit.text, {
      draft,
      intakeText: TEST460_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });

    establishPaidProSourceOfTruth({
      text: display.text,
      source: "server_full_draft",
      draft,
      intakeText: TEST460_LIVE_INTAKE,
      reviewSessionId: generationId,
      agreementGenerationId: generationId,
      generationOutcome: "needs_details",
    });

    expect(hasPaidProSourceOfTruth()).toBe(true);
    expect(getPaidProSourceOfTruth()!.hash).toBe(freezeCommit.hash);
    expect(getFrozenCanonicalAgreementCorpus()?.hash).toBe(freezeCommit.hash);
    expect(getPaidProSourceOfTruthText().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(getPaidProSourceOfTruthText().length).not.toBeLessThan(1200);
  });

  it("premium completion pipeline accepts substantive server_full without structural_recovery source", async () => {
    const draft = test460RedMesaDraft();
    const serverBody = buildTest460LiveRegressionServerBody();
    const generationId = `gen-test460-pipeline-${Date.now()}`;
    premiumApiMock.mockResponses = [needsDetailsServerFullResult(serverBody)];

    const result = await runPremiumCompletion({
      intakeText: TEST460_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST460_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: "fp-test460",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(result.premiumRenderSource).not.toBe("structural_recovery");
    expect(result.premiumRenderSource).toMatch(/server_full_draft/);
    expect((result.winningPremiumBodyText || "").length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(paidProCheckoutCompletionHasVisibleOutcome(result)).toBe(true);
    expect(authoritativePremiumPipelineResultForUiApply(result)).toBe(true);

    const pipelineHash = paidProPipelineAcceptedCorpusHash(result.winningPremiumBodyText || "");
    expect(pipelineHash).toBeTruthy();
  });

  it("clean substantive server body also freezes without heading anomaly reject", () => {
    const draft = test460RedMesaDraft();
    const server = buildTest460SubstantiveServerBody();
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: server,
      draft,
      intakeText: TEST460_LIVE_INTAKE,
      source: "server_full_draft",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.text.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
  });
});
