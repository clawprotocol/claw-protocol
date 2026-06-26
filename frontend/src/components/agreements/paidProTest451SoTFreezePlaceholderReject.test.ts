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
  hashPaidProCorpus,
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
import { paidProPipelineAcceptedCorpusHash, readPaidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
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
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import {
  buildCanonicalAgreementSnapshot,
  collectFatalPaidProPlaceholderIssueCodes,
  getFrozenCanonicalAgreementCorpus,
} from "./canonicalAgreementSnapshot";
import { readAcceptedProCorpusSafeDisplayCacheSizeForTests } from "./paidProAcceptedCorpusSafeDisplayCache";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { buildTest448StarterFreeCorpus1319 } from "./paidProTest448BrandLicensingOrchestrationFixtures";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  buildTest451SubstantiveServerBody,
  TEST451_LIVE_INTAKE,
  TEST451_TARGET_SERVER_LEN,
  TEST451_TRANSACTION_TITLE,
  test451BrightPeakFirstDraft,
} from "./paidProTest451SoTFreezePlaceholderRejectFixtures";

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
    title: TEST451_TRANSACTION_TITLE,
    agreement_family: "services_agreement",
    document_text: serverBody,
    server_full_document_text: serverBody,
    key_terms_found: ["payment", "governing_law"],
    missing_material_info: ["inventory_reporting_detail"],
    generation_outcome: "needs_details",
    schema_validation_reasons: ["section_missing"],
  };
}

describe("TEST451 — SoT freeze placeholder rejection after validated server adoption", () => {
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

  it("fixture server body is ~29499 chars", () => {
    const server = buildTest451SubstantiveServerBody();
    expect(server.length).toBe(TEST451_TARGET_SERVER_LEN);
  });

  it("canonical snapshot with skipClauseFamilyPlaceholderIssues matches freeze-gate semantics", () => {
    const draft = test451BrightPeakFirstDraft();
    const server = buildTest451SubstantiveServerBody();
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: server,
      draft,
      intakeText: TEST451_LIVE_INTAKE,
      source: "server_full_draft",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    const committedHash = freezeCommit.hash!;
    expect(committedHash).toBeTruthy();

    const withStructuralIssues = buildCanonicalAgreementSnapshot({
      surface: "test451_structural_scan",
      tier: "pro",
      candidates: [{ source: "server_full_document_text", text: freezeCommit.text }],
      intakeText: TEST451_LIVE_INTAKE,
      parties: draft.parties.map((p) => ({
        name: String((p as { name?: string }).name ?? ""),
        role: String((p as { role?: string }).role ?? ""),
      })),
      signerState: { complete: false, signerCount: 4 },
      minLen: 500,
      forceAuthoritativePreservation: true,
    });

    const freezeAligned = buildCanonicalAgreementSnapshot({
      surface: "test451_freeze_aligned",
      tier: "pro",
      candidates: [{ source: "server_full_document_text", text: freezeCommit.text }],
      intakeText: TEST451_LIVE_INTAKE,
      parties: draft.parties.map((p) => ({
        name: String((p as { name?: string }).name ?? ""),
        role: String((p as { role?: string }).role ?? ""),
      })),
      signerState: { complete: false, signerCount: 4 },
      minLen: 500,
      forceAuthoritativePreservation: true,
      skipClauseFamilyPlaceholderIssues: true,
    });

    const fatalIssues = collectFatalPaidProPlaceholderIssueCodes(freezeCommit.text, {
      intakeText: TEST451_LIVE_INTAKE,
      partyNames: draft.parties.map((p) => String((p as { name?: string }).name ?? "")),
    });
    expect(fatalIssues).toHaveLength(0);
    expect(freezeAligned.integrityOk).toBe(true);
    expect(freezeAligned.placeholderIssues).toHaveLength(0);
    expect(freezeAligned.hash).toBe(committedHash);

    if (withStructuralIssues.placeholderIssues.length > 0 && fatalIssues.length === 0) {
      expect(withStructuralIssues.integrityOk).toBe(false);
      expect(freezeAligned.integrityOk).toBe(true);
    }
  });

  it("establishPaidProSourceOfTruth succeeds for pipeline-accepted ~31k corpus", async () => {
    const draft = test451BrightPeakFirstDraft();
    const serverBody = buildTest451SubstantiveServerBody();
    const generationId = `gen-test451-${Date.now()}`;

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: serverBody,
      draft,
      intakeText: TEST451_LIVE_INTAKE,
      source: "server_full_draft",
      agreementGenerationId: generationId,
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    markPaidProPipelineValidationPassed({
      text: freezeCommit.text,
      source: "server_full_draft",
    });

    const display = polishProAgreementDisplayLayer(freezeCommit.text, {
      draft,
      intakeText: TEST451_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });

    establishPaidProSourceOfTruth({
      text: display.text,
      source: "server_full_draft",
      draft,
      intakeText: TEST451_LIVE_INTAKE,
      reviewSessionId: generationId,
      agreementGenerationId: generationId,
      generationOutcome: "needs_details",
    });

    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.trim().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(getPaidProSourceOfTruth()!.hash).toBe(freezeCommit.hash);
    expect(getFrozenCanonicalAgreementCorpus()?.hash).toBe(freezeCommit.hash);
    expect(collectFatalPaidProPlaceholderIssueCodes(sot, {
      intakeText: TEST451_LIVE_INTAKE,
      partyNames: draft.parties.map((p) => String((p as { name?: string }).name ?? "")),
    })).toHaveLength(0);
  });

  it("premium completion opens Pro review — no SoT placeholder reject or starter cache poison", async () => {
    const draft = test451BrightPeakFirstDraft();
    const serverBody = buildTest451SubstantiveServerBody();
    const starter = buildTest448StarterFreeCorpus1319(draft);
    const generationId = `gen-test451-pipeline-${Date.now()}`;

    applyAcceptedProCorpusSafeDisplay(starter, {
      draft,
      intakeText: TEST451_LIVE_INTAKE,
      surface: "test451_starter_poison",
      sourceKind: "free_starter",
      partyCount: 0,
      agreementGenerationId: generationId,
    });
    expect(readAcceptedProCorpusSafeDisplayCacheSizeForTests()).toBeGreaterThan(0);

    premiumApiMock.mockResponses = [needsDetailsServerFullResult(serverBody)];

    const out = await runPremiumCompletion({
      intakeText: TEST451_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST451_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: generationId,
      premiumRequestIntakeFingerprint: "fp-test451",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.proIntentGateMessage).toBeNull();
    expect(authoritativePremiumPipelineResultForUiApply(out)).toBe(true);
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(out.premiumRenderSource).toBe("server_full_draft");

    const committedHash = paidProPipelineAcceptedCorpusHash(out.winningPremiumBodyText)!;
    expect(readPaidProPipelineAcceptedCorpusHash()).toBe(committedHash);

    const validation = validatePaidProOutput({
      text: out.winningPremiumBodyText,
      rawIntake: TEST451_LIVE_INTAKE,
      draft,
      premiumPipelineSource: out.premiumRenderSource,
    });
    expect(validation.ok, validation.reasons.join("|")).toBe(true);
    expect(validation.reasons).not.toContain("deterministic_recovery_freeze_candidate_ok");

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST451_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });

    establishPaidProSourceOfTruth({
      text: display.text,
      source: out.premiumRenderSource,
      draft,
      intakeText: TEST451_LIVE_INTAKE,
      reviewSessionId: generationId,
      agreementGenerationId: generationId,
      generationOutcome: "needs_details",
    });

    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sotHash = getPaidProSourceOfTruth()!.hash;
    expect(sotHash).toBe(committedHash);

    const safeDisplay = applyAcceptedProCorpusSafeDisplay(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST451_LIVE_INTAKE,
      surface: "test451_post_accept_safe_display",
      sourceKind: "server_full_draft",
      partyCount: 4,
      agreementGenerationId: generationId,
    });
    expect(safeDisplay.text.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(safeDisplay.text.length).toBeGreaterThan(starter.length * 2);
    expect(hashPaidProCorpus(safeDisplay.text)).toBe(paidProPipelineAcceptedCorpusHash(safeDisplay.text));

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft,
      intakeText: TEST451_LIVE_INTAKE,
    });
    expect(reviewPlain).toContain(TEST451_TRANSACTION_TITLE);
    expect(countOperativeIfToNoticeStanzas(reviewPlain)).toBe(4);
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);
    expect(detectPaidProSectionHeadingTitleAnomalies(reviewPlain).length).toBe(0);
    const structure = applySectionStructureIntegrity(reviewPlain, {
      source: "test451_review",
      repair: false,
    });
    expect(structure.anomalyCount).toBe(0);
    expect(reviewPlain).not.toMatch(/\bParty\s+5\b/i);
  });
});
