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
import {
  resolveAgreementIntentContract,
  resolvePaidProIntentContract,
  validateIntentContractForPaidProOutput,
} from "./agreementIntentContract";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  buildPaidProFreezeCandidate,
  resolvePaidProFreezeCommitText,
} from "./paidProFreezeCandidate";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import { detectPaidProSectionHeadingTitleAnomalies } from "./paidProSectionHeadingTitleAuthority";
import { consumeAuthoritativeSignerCount, resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  buildTest446SubstantiveBrandLicensingServerBody,
  TEST446_ALL_PARTIES,
  TEST446_LIVE_INTAKE,
  TEST446_TRANSACTION_TITLE,
  test446BrightPeakFirstDraft,
} from "./paidProTest446BrandLicensingIntentRegressionFixtures";

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

function expectBrandLicensingReviewCorpus(text: string): void {
  expect(text).toContain(TEST446_TRANSACTION_TITLE);
  expect(text).toMatch(/State of Oklahoma/i);
  expect(text).toMatch(/12\.\s+GOVERNING LAW/i);
  expect(countOperativeIfToNoticeStanzas(text)).toBe(4);
  expect(countPaidProExecutionBlocks(text)).toBe(1);
  expect(detectPaidProSectionHeadingTitleAnomalies(text).length).toBe(0);
  for (const party of TEST446_ALL_PARTIES) {
    expect(text).toContain(party);
  }
  expect(text).not.toMatch(/\bParty\s+5\b/i);
}

describe("TEST446 — brand licensing intent regression (not design_creative)", () => {
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
    vi.restoreAllMocks();
    storage.clear();
  });

  it("routes intake to consulting_services — not design_creative", () => {
    const resolved = resolveAgreementIntentContract(TEST446_LIVE_INTAKE);
    expect(resolved.intent_id).not.toBe("design_creative");
    expect(resolved.intent_id).toBe("consulting_services");

    const paid = resolvePaidProIntentContract({ rawIntake: TEST446_LIVE_INTAKE });
    expect(paid.intent_id).not.toBe("design_creative");
    expect(paid.intent_id).toBe("consulting_services");
  });

  it("validateIntentContractForPaidProOutput does not reject with design_title_requires_logo_or_design_services", () => {
    const draft = test446BrightPeakFirstDraft();
    const server = buildTest446SubstantiveBrandLicensingServerBody();
    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      draft,
      TEST446_LIVE_INTAKE,
      { surface: "test446_intent_validate" },
    );
    const contract = resolvePaidProIntentContract({ rawIntake: TEST446_LIVE_INTAKE });
    const intent = validateIntentContractForPaidProOutput({
      contract,
      text: prepared.text,
      rawIntake: TEST446_LIVE_INTAKE,
      draftTitle: TEST446_TRANSACTION_TITLE,
      authoritativeProPipelineAccepted: true,
    });
    expect(intent.reasons).not.toContain("intent:design_title_requires_logo_or_design_services");
    expect(intent.ok, intent.reasons.join("|")).toBe(true);
  });

  it("freeze candidate accepts repaired server_full_draft", () => {
    const draft = test446BrightPeakFirstDraft();
    const server = buildTest446SubstantiveBrandLicensingServerBody();
    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      draft,
      TEST446_LIVE_INTAKE,
      { surface: "test446_freeze_prepare" },
    );
    const freezeCandidate = buildPaidProFreezeCandidate({
      text: prepared.text,
      draft,
      intakeText: TEST446_LIVE_INTAKE,
      source: "server_full_draft",
      surface: "test446_freeze_candidate",
    });
    expect(freezeCandidate.ok, freezeCandidate.rejectReason ?? "freeze_failed").toBe(true);

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      draft,
      intakeText: TEST446_LIVE_INTAKE,
      source: "server_full_draft",
      surface: "test446_freeze_commit",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_commit_failed").toBe(true);
    expectBrandLicensingReviewCorpus(freezeCommit.text);
  });

  it("validatePaidProOutput accepts substantive server_full_draft end-to-end", () => {
    const draft = test446BrightPeakFirstDraft();
    const server = buildTest446SubstantiveBrandLicensingServerBody();
    const validation = validatePaidProOutput({
      text: server,
      rawIntake: TEST446_LIVE_INTAKE,
      draft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(validation.reasons).not.toContain("intent:design_title_requires_logo_or_design_services");
    expect(validation.ok, validation.reasons.join("|")).toBe(true);
  });

  it("premium completion opens Pro review — not Retry Pro draft failure card", async () => {
    const draft = test446BrightPeakFirstDraft();
    const serverBody = buildTest446SubstantiveBrandLicensingServerBody();
    premiumApiMock.mockResponses = [
      {
        title: TEST446_TRANSACTION_TITLE,
        agreement_family: "services_agreement",
        document_text: serverBody,
        server_full_document_text: serverBody,
        key_terms_found: ["payment", "governing_law"],
        missing_material_info: [],
        generation_outcome: "ok",
      },
    ];

    const out = await runPremiumCompletion({
      intakeText: TEST446_LIVE_INTAKE,
      originalUserIntakeRawForMerge: TEST446_LIVE_INTAKE,
      structuredDraft: draft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      agreementGenerationId: `gen-test446-${Date.now()}`,
      premiumRequestIntakeFingerprint: "fp-test446",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => draft,
    });

    expect(out.proIntentGateMessage).toBeNull();
    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.premiumRenderSource).not.toBe("free_starter");
    expect(out.winningPremiumBodyText.length).toBeGreaterThan(15_000);

    const display = polishProAgreementDisplayLayer(out.winningPremiumBodyText, {
      draft,
      intakeText: TEST446_LIVE_INTAKE,
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    });
    expectBrandLicensingReviewCorpus(display.text);

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TEST446_LIVE_INTAKE,
      draftParties: draft.parties,
      manifestPartyCount: 4,
      corpusPlain: display.text,
    });
    expect(authority.count).toBe(4);
    expect(
      consumeAuthoritativeSignerCount("guided_pre_review_signer_slots", {
        intakeText: TEST446_LIVE_INTAKE,
        draftParties: draft.parties,
        manifestPartyCount: 4,
        corpusPlain: display.text,
      }),
    ).toBe(4);
  });
});
