/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import * as paidProCorpusAcceptance from "./paidProCorpusAcceptance";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  clearPremiumPartyNamesHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import {
  clearFrozenPremiumSessionBodiesForTests,
  SERVER_FULL_DOCUMENT_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import {
  resolvePremiumPreValidationBody,
  isSubstantivePremiumServerFullDocument,
} from "./premiumPreValidationBodyAuthority";
import {
  TEST435_HARBOR_PEAK,
  TEST435_INTAKE_WITH_SIGNERS,
  TEST435_RED_MESA,
  test435Draft,
} from "./paidProTest435Fixtures";
import {
  buildTest442LongServerFullDocumentText,
  buildTest442ShortDocumentText,
  TEST442_MIN_SERVER_LEN,
  TEST442_SHORT_DOCUMENT_TARGET_LEN,
} from "./paidProTest442Fixtures";

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

describe("TEST442 — server_full_document_text adopted before validatePaidProOutput", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    });
    clearFrozenPremiumSessionBodiesForTests();
    clearPremiumParseSessionGuard();
    clearPaidProPostAcceptanceValidatorCache();
    premiumApiMock.mockResponses = [];
    premiumApiMock.callIndex = 0;
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    clearFrozenPremiumSessionBodiesForTests();
    storage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fixtures: short document_text and substantive long server_full_document_text", () => {
    const shortDoc = buildTest442ShortDocumentText();
    const serverFull = buildTest442LongServerFullDocumentText();
    expect(shortDoc.length).toBeLessThan(1200);
    expect(shortDoc.length).toBeGreaterThan(500);
    expect(serverFull.length).toBeGreaterThan(TEST442_MIN_SERVER_LEN - 500);
    expect(serverFull.length).toBeGreaterThan(shortDoc.length * 10);
    expect(shortDoc).toContain(TEST435_RED_MESA);
    expect(serverFull).toContain(TEST435_HARBOR_PEAK);
  });

  it("resolvePremiumPreValidationBody adopts substantive longer server full", () => {
    const shortDoc = buildTest442ShortDocumentText();
    const serverFull = buildTest442LongServerFullDocumentText();
    const effectiveFull = {
      title: "Consulting Services Agreement",
      agreement_family: "services_agreement",
      document_text: shortDoc,
      server_full_document_text: serverFull,
      key_terms_found: ["payment", "governing_law"],
      missing_material_info: [],
      generation_outcome: "ok",
    } as PremiumFullDraftResult;

    expect(isSubstantivePremiumServerFullDocument(serverFull.length, effectiveFull)).toBe(true);

    const resolved = resolvePremiumPreValidationBody({
      clientDocumentText: shortDoc,
      effectiveFull,
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
    });
    expect(resolved.adoptedServerFull).toBe(true);
    expect(resolved.source).toBe("server_full_document_text");
    expect(resolved.text.length).toBeGreaterThan(SERVER_FULL_DOCUMENT_AUTHORITATIVE_MIN_LEN);
    expect(resolved.text.length).toBeGreaterThan(shortDoc.length * 5);
    expect(resolved.text).toContain(TEST435_HARBOR_PEAK);
  });

  it("validatePaidProOutput receives adopted server full body in runPremiumCompletion", async () => {
    const shortDoc = buildTest442ShortDocumentText();
    const serverFull = buildTest442LongServerFullDocumentText();
    premiumApiMock.mockResponses = [
      {
        title: "Consulting Services Agreement",
        agreement_family: "services_agreement",
        document_text: shortDoc,
        server_full_document_text: serverFull,
        key_terms_found: ["payment", "governing_law"],
        missing_material_info: [],
        generation_outcome: "ok",
      },
    ];

    const validateSpy = vi.spyOn(paidProCorpusAcceptance, "validatePaidProOutput");

    const out = await runPremiumCompletion({
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
      originalUserIntakeRawForMerge: TEST435_INTAKE_WITH_SIGNERS,
      structuredDraft: test435Draft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test442-validation-body",
      premiumRequestIntakeFingerprint: "fp-test442",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test435Draft(),
    });

    expect(validateSpy.mock.calls.length).toBeGreaterThan(0);
    const validationInputLens = validateSpy.mock.calls.map((call) => (call[0].text || "").trim().length);
    const maxValidationLen = Math.max(...validationInputLens);
    expect(maxValidationLen).toBeGreaterThan(SERVER_FULL_DOCUMENT_AUTHORITATIVE_MIN_LEN);
    expect(maxValidationLen).toBeGreaterThan(shortDoc.length * 5);

    expect(out.premiumRenderSource).not.toBe("rejected_paid_corpus");
    expect(out.premiumRenderSource).toMatch(/server_full_draft/);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThan(5000);
    expect(out.proIntentGateMessage).toBeNull();
  });

  it("freeze, SoT, and review use long server full after pre-validation adopt", async () => {
    const shortDoc = buildTest442ShortDocumentText();
    const serverFull = buildTest442LongServerFullDocumentText();
    const adopted = resolvePremiumPreValidationBody({
      clientDocumentText: shortDoc,
      effectiveFull: {
        title: "Consulting Services Agreement",
        document_text: shortDoc,
        server_full_document_text: serverFull,
        generation_outcome: "ok",
      } as PremiumFullDraftResult,
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
    });
    expect(adopted.adoptedServerFull).toBe(true);

    const prepared = preparePaidProServerDocumentForAcceptance(
      adopted.text,
      test435Draft(),
      TEST435_INTAKE_WITH_SIGNERS,
      { surface: "test442_prepare" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
      agreementGenerationId: "gen-test442-sot",
      surface: "test442_freeze",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.text.length).toBeGreaterThan(5000);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
      reviewSessionId: "gen-test442-sot",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);

    const sot = getPaidProSourceOfTruthText();
    expect(sot).toContain(TEST435_RED_MESA);
    expect(sot).toContain(TEST435_HARBOR_PEAK);

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
    });
    expect(reviewPlain.trim().length).toBeGreaterThan(5000);

    const finalReview = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: sot,
      renderedPreviewPlain: buildAgreementPreviewText(test435Draft(), { starterPreview: true }),
      finalReviewAuthorityOnly: true,
    });
    expect(finalReview.source).not.toBe("rejected_paid_corpus");
    expect(finalReview.source).not.toBe("free_starter");
    expect(finalReview.plainText).toContain(TEST435_HARBOR_PEAK);
    expect(finalReview.authoritativeLen).toBeGreaterThan(5000);
    expect(isAuthoritativePremiumPipelineRenderSource("server_full_draft")).toBe(true);
  });

  it("adopted server full body is substantive before freeze prep (validation input corpus)", () => {
    const shortDoc = buildTest442ShortDocumentText();
    const serverFull = buildTest442LongServerFullDocumentText();
    const adopted = resolvePremiumPreValidationBody({
      clientDocumentText: shortDoc,
      effectiveFull: {
        document_text: shortDoc,
        server_full_document_text: serverFull,
        generation_outcome: "ok",
      } as PremiumFullDraftResult,
      draft: test435Draft(),
      intakeText: TEST435_INTAKE_WITH_SIGNERS,
      wireServerFullDocumentText: serverFull,
    }).text;

    expect(adopted.length).toBeGreaterThan(TEST442_SHORT_DOCUMENT_TARGET_LEN * 2);
    expect(adopted.length).toBeGreaterThan(shortDoc.length * 5);
    expect(adopted).toContain(TEST435_HARBOR_PEAK);
    expect(adopted).toContain(TEST435_RED_MESA);
  });
});
