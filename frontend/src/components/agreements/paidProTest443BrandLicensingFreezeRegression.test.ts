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
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  buildPaidProFreezeCandidate,
  resolvePaidProFreezeCommitText,
} from "./paidProFreezeCandidate";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { applySectionStructureIntegrity } from "./sectionStructureAuthority";
import {
  detectPaidProSectionHeadingTitleAnomalies,
  applyPaidProSectionHeadingTitleAuthority,
} from "./paidProSectionHeadingTitleAuthority";
import {
  applyPaidProSectionStructureCompletenessAuthority,
  resetPaidProSectionStructureCompletenessLogsForTests,
} from "./paidProSectionStructureCompletenessAuthority";
import { buildCanonicalAgreementSnapshot } from "./canonicalAgreementSnapshot";
import { consumeAuthoritativeSignerCount, resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  buildTest443ServerFullWithHeadingTitleAnomaly,
  buildTest443SubstantiveBrandLicensingServerBody,
  TEST443_ALL_PARTIES,
  TEST443_LIVE_INTAKE,
  TEST443_TRANSACTION_TITLE,
  test443BrightPeakFirstDraft,
} from "./paidProTest443BrandLicensingFreezeRegressionFixtures";

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

function expectBrandLicensingFreezeReadyCorpus(text: string): void {
  expect(text).toContain(TEST443_TRANSACTION_TITLE);
  expect(text).not.toMatch(/^SERVICES AGREEMENT$/m);
  expect(text).toMatch(/State of Oklahoma/i);
  expect(text).toMatch(/12\.\s+GOVERNING LAW/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  expect(detectPaidProSectionHeadingTitleAnomalies(text).length).toBe(0);
  const structure = applySectionStructureIntegrity(text, {
    source: "test443_final_corpus",
    repair: false,
  });
  expect(structure.anomalyCount).toBe(0);
}

describe("TEST443 — Brand licensing server-full freeze after heading title anomaly", () => {
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
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    clearFrozenPremiumSessionBodiesForTests();
    clearCurrentSessionProEntitlementMarkers();
    vi.restoreAllMocks();
  });

  it("authoritative title lines are exempt from heading title anomaly detection", () => {
    const raw = buildTest443ServerFullWithHeadingTitleAnomaly();
    expect(raw).toContain("MANUFACTURING, DISTRIBUTION,");
    expect(detectPaidProSectionHeadingTitleAnomalies(raw).length).toBe(0);
  });

  it("heading title authority repairs multiline brand title idempotently", () => {
    const raw = buildTest443ServerFullWithHeadingTitleAnomaly();
    const once = applyPaidProSectionHeadingTitleAuthority(raw);
    expect(once.text).toContain(TEST443_TRANSACTION_TITLE);
    expect(detectPaidProSectionHeadingTitleAnomalies(once.text).length).toBe(0);
    const twice = applyPaidProSectionHeadingTitleAuthority(once.text);
    expect(twice.text).toBe(once.text);
    expect(detectPaidProSectionHeadingTitleAnomalies(twice.text).length).toBe(0);
  });

  it("preparePaidProReviewDisplayPlain leaves no heading title anomaly", () => {
    const draft = test443BrightPeakFirstDraft();
    const prepared = preparePaidProServerDocumentForAcceptance(
      buildTest443ServerFullWithHeadingTitleAnomaly(),
      draft,
      TEST443_LIVE_INTAKE,
      { surface: "test443_prepare" },
    );
    const display = preparePaidProReviewDisplayPlain(prepared.text);
    expect(detectPaidProSectionHeadingTitleAnomalies(display.text).length).toBe(0);
    expect(display.text).toContain(TEST443_TRANSACTION_TITLE);
  });

  it("section structure completeness accepts repaired substantive server draft", () => {
    const draft = test443BrightPeakFirstDraft();
    const prepared = preparePaidProServerDocumentForAcceptance(
      buildTest443ServerFullWithHeadingTitleAnomaly(),
      draft,
      TEST443_LIVE_INTAKE,
      { surface: "test443_structure" },
    );
    const structure = applyPaidProSectionStructureCompletenessAuthority(prepared.text, {
      source: "test443_pre_freeze",
      phase: "pre_freeze",
      blockOnFatal: false,
    });
    expect(structure.rejected).toBe(false);
    expect(structure.rejectReason).not.toBe("section_heading_title_anomaly");
    expect(detectPaidProSectionHeadingTitleAnomalies(structure.text).length).toBe(0);
  });

  it("freeze commit accepts substantive brand licensing server full draft", () => {
    const draft = test443BrightPeakFirstDraft();
    const server = buildTest443ServerFullWithHeadingTitleAnomaly();
    const prepared = preparePaidProServerDocumentForAcceptance(server, draft, TEST443_LIVE_INTAKE, {
      surface: "test443_freeze_prepare",
    });
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      draft,
      intakeText: TEST443_LIVE_INTAKE,
      source: "server_full_draft",
      generationOutcome: "ok",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.rejectReason).not.toBe("section_heading_title_anomaly");
    expectBrandLicensingFreezeReadyCorpus(freezeCommit.text);
  });

  it("validatePaidProOutput surfaces pass without section_heading_title_anomaly", () => {
    const draft = test443BrightPeakFirstDraft();
    const prepared = preparePaidProServerDocumentForAcceptance(
      buildTest443ServerFullWithHeadingTitleAnomaly(),
      draft,
      TEST443_LIVE_INTAKE,
      { surface: "test443_validate" },
    );
    const freezeCandidate = buildPaidProFreezeCandidate({
      text: prepared.text,
      draft,
      intakeText: TEST443_LIVE_INTAKE,
      source: "server_full_draft",
    });
    expect(freezeCandidate.ok, freezeCandidate.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCandidate.rejectReason).not.toBe("section_heading_title_anomaly");
    const validation = validatePaidProOutput({
      text: freezeCandidate.text,
      rawIntake: TEST443_LIVE_INTAKE,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.reasons).not.toContain("section_heading_title_anomaly");
  });

  it("canonical snapshot allows generic on-file notice contact language", () => {
    const draft = test443BrightPeakFirstDraft();
    const body = buildTest443SubstantiveBrandLicensingServerBody();
    const snapshot = buildCanonicalAgreementSnapshot({
      surface: "test443_snapshot",
      tier: "pro",
      candidates: [{ source: "server_full_document_text", text: body }],
      intakeText: TEST443_LIVE_INTAKE,
      parties: draft.parties.map((p) => ({
        name: String((p as { name?: string }).name ?? ""),
        role: String((p as { role?: string }).role ?? ""),
      })),
      signerState: { complete: false, signerCount: 4 },
      minLen: 500,
    });
    expect(snapshot.placeholderIssues, JSON.stringify(snapshot.placeholderIssues)).not.toContain(
      "unresolved_identity_or_address_placeholder",
    );
    expect(snapshot.integrityOk).toBe(true);
  });

  it("signer count stays 4 across display and freeze paths", () => {
    const draft = test443BrightPeakFirstDraft();
    const freezeCommit = resolvePaidProFreezeCommitText({
      text: preparePaidProServerDocumentForAcceptance(
        buildTest443ServerFullWithHeadingTitleAnomaly(),
        draft,
        TEST443_LIVE_INTAKE,
      ).text,
      draft,
      intakeText: TEST443_LIVE_INTAKE,
      source: "server_full_draft",
    });
    expect(freezeCommit.ok).toBe(true);
    const display = polishProAgreementDisplayLayer(freezeCommit.text, {
      draft,
      intakeText: TEST443_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST443_LIVE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: display.text,
    });
    expect(authority.count).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("guided_pre_review_signer_slots", {
        intakeText: TEST443_LIVE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: display.text,
      }),
    ).toBe(4);
    for (const party of TEST443_ALL_PARTIES) {
      expect(display.text).toContain(party);
    }
  });

  it("premium completion reaches Pro review corpus without freeze_commit_rejected", async () => {
    const draft = test443BrightPeakFirstDraft();
    const serverBody = buildTest443ServerFullWithHeadingTitleAnomaly();
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
      intakeText: TEST443_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST443_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test443-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test443",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.proIntentGateMessage).toBeNull();
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.premiumRenderSource).not.toBe("free_starter");
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(15_000);

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST443_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingFreezeReadyCorpus(display.text);
  });
});
