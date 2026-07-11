/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  extractPremiumApiServerCorpusText,
  premiumApiResultHasAuthoritativeServerCorpus,
} from "./premiumApiHandoff";
import {
  resolvePremiumFullDraftAuthoritativeBody,
  normalizePremiumFullDraftResponsePayload,
} from "./premiumFullDraftResponseNormalization";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import * as secondGenLog from "./paidProSecondGenerationTriggerLog";
import {
  computeDashboardPaidCreateReviewShellReady,
  hasDashboardPaidCreateValidatedReviewCorpus,
} from "./dashboardPaidCreateRoute";
import { DASHBOARD_PAID_CREATE_ROUTE_SOURCE, markPaidDashboardCreateContextForTests } from "../../launch/paidDashboardCreateContext";
import { CreateUiStage } from "./createUiStage";
import { gateFirstPaidCreateCanonicalReviewEntry } from "./paidProFirstPaidCreateFlowRoute";
import {
  commitPaidProPipelineValidationAcceptance,
  clearPaidProPostAcceptanceValidatorCache,
} from "./paidProPostAcceptanceValidatorCache";
import { clearPaidProPipelineAcceptedCorpusHashForTests } from "./paidProPipelineAcceptedCorpus";
import { clearPaidDashboardCreateContextForTests } from "../../launch/paidDashboardCreateContext";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const TEST517_INTAKE =
  "Create a mutual consulting and implementation agreement between Blue Canyon Analytics LLC (Client) " +
  "and Iron Vale Systems Inc. (Service Provider). Fixed fee $8,500. Delaware law governs.";

const TEST517_TARGET_LEN = 10_964;

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
    postPremiumFullDraftOnce: () => Promise.reject(new Error("test517_no_second_post")),
  };
});

function test517StructuredDraft(): ParsedDraftShape {
  return {
    title: "Mutual Consulting and Implementation Agreement",
    jurisdiction: "Delaware",
    agreement_family: "services_agreement",
    parties: [
      { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
      { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
    ],
    purpose: "AI workflow implementation services.",
    payment_terms: "Fixed fee of $8,500.",
    duration: "Until completion",
    due_date: null,
    effective_date: null,
    payment: { amount: 8_500, cadence: null, valid: true },
  };
}

function buildTest517ValidBody(targetLen: number): string {
  const header = [
    "PROFESSIONAL SERVICES AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
    "",
    "1. Scope of Services. Service Provider shall deliver AI workflow implementation services.",
    "2. Payment. Client shall pay Service Provider a fixed fee of $8,500.",
    "3. Intellectual Property. Work product ownership terms apply as stated herein.",
    "4. Confidentiality. Each party shall protect confidential information.",
    "5. Term and Termination. Either party may terminate with written notice.",
    "6. Governing Law. This Agreement is governed by the laws of the State of Delaware.",
    "7. Electronic Signatures. The parties agree that electronic signatures are valid and binding.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    PAID_PRO_HARDENING_CLIENT,
    "By: __________________________",
    "",
    "SERVICE PROVIDER:",
    PAID_PRO_HARDENING_PROVIDER,
    "By: __________________________",
  ].join("\n");
  let body = header;
  let i = 8;
  while (body.length < targetLen) {
    body +=
      `\n${i}. Additional Provision. The parties acknowledge that the obligations under section ${i} are ` +
      "commercially reasonable and shall be performed diligently in connection with the engagement.";
    i += 1;
  }
  return body;
}

function buildTest517DegradedDocumentTextOnlyWire(): PremiumFullDraftResult {
  const valid = buildTest517ValidBody(TEST517_TARGET_LEN);
  return {
    title: "Mutual Consulting and Implementation Agreement",
    agreement_family: "services_agreement",
    document_text: valid,
    server_full_document_text: "",
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    agreement_validation: {
      passed: true,
      failures: [],
      warnings: [],
      minimum_contract_elements: {
        identifiable_parties: true,
        agreement_purpose_or_scope: true,
        exchange_of_value_or_consideration: true,
        obligations_or_performance: true,
        execution_or_acceptance_mechanism: true,
      },
      summary: { failure_count: 0, warning_count: 0, checked_at: "2026-01-01T00:00:00Z" },
    },
    key_terms_found: [],
    missing_material_info: [],
  };
}

beforeEach(() => {
  resetPaidProPipelineTestIsolation();
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  clearPaidDashboardCreateContextForTests();
  clearPaidProPostAcceptanceValidatorCache();
  clearPaidProPipelineAcceptedCorpusHashForTests();
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumParseSessionGuard();
  clearPremiumGenerationCallAudit();
  premiumApiMock.mockResponses = [];
  premiumApiMock.callIndex = 0;
  vi.restoreAllMocks();
  if (typeof window !== "undefined") {
    vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
  }
});

describe("paidPro Test517 server document_text alias", () => {
  it("response with document_text only resolves authoritative body from document_text", () => {
    const valid = buildTest517ValidBody(TEST517_TARGET_LEN);
    const resolved = resolvePremiumFullDraftAuthoritativeBody({
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
      server_full_document_text: "",
      document_text: valid,
    });
    expect(resolved.sourceField).toBe("document_text");
    expect(resolved.hasAuthoritativeServerDocument).toBe(true);
    expect(resolved.text.length).toBeGreaterThanOrEqual(TEST517_TARGET_LEN - 50);

    const normalized = normalizePremiumFullDraftResponsePayload({
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
      server_full_document_text: "",
      document_text: valid,
    });
    expect(String(normalized.wire.server_full_document_text ?? "").length).toBeGreaterThanOrEqual(
      TEST517_TARGET_LEN - 50,
    );
    expect(premiumApiResultHasAuthoritativeServerCorpus(normalized.wire)).toBe(true);
    expect(extractPremiumApiServerCorpusText(normalized.wire).length).toBeGreaterThanOrEqual(
      TEST517_TARGET_LEN - 50,
    );
  });

  it("degraded json_parse with substantive document_text preserves firstDocumentLen in second-gen log", async () => {
    premiumApiMock.mockResponses = [buildTest517DegradedDocumentTextOnlyWire()];
    const spy = vi.spyOn(secondGenLog, "logPremiumSecondGenerationTriggered");

    const out = await runPremiumCompletion({
      intakeText: TEST517_INTAKE,
      originalUserIntakeRawForMerge: TEST517_INTAKE,
      structuredDraft: test517StructuredDraft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test517-document-text-alias",
      premiumRequestIntakeFingerprint: "fp-test517",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test517StructuredDraft(),
    });

    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(TEST517_TARGET_LEN - 500);
    const degradedRetry = spy.mock.calls.find(
      (call) => call[0]?.reason === "degraded_structural_retry",
    );
    expect(degradedRetry).toBeUndefined();
    const anySecondGen = spy.mock.calls[0]?.[0];
    if (anySecondGen) {
      expect(anySecondGen.firstDocumentLen).toBeGreaterThanOrEqual(TEST517_TARGET_LEN - 500);
      expect(anySecondGen.firstServerFullDocumentLen).toBeGreaterThanOrEqual(TEST517_TARGET_LEN - 500);
    }
  }, 15_000);

  it("preparePaidProServerDocumentForAcceptance preserves 10964-char substantive wire body", () => {
    const valid = buildTest517ValidBody(TEST517_TARGET_LEN);
    const prep = preparePaidProServerDocumentForAcceptance(valid, test517StructuredDraft(), TEST517_INTAKE, {
      surface: "premium_completion_pipeline:thin_services",
    });
    expect(prep.text.length).toBeGreaterThanOrEqual(Math.floor(TEST517_TARGET_LEN * 0.85));
    expect(prep.text.length).toBeGreaterThan(8_000);
  });

  it("does not trigger degraded_structural_retry when normalized authoritative body exists", async () => {
    premiumApiMock.mockResponses = [buildTest517DegradedDocumentTextOnlyWire()];
    const spy = vi.spyOn(secondGenLog, "logPremiumSecondGenerationTriggered");

    await runPremiumCompletion({
      intakeText: TEST517_INTAKE,
      originalUserIntakeRawForMerge: TEST517_INTAKE,
      structuredDraft: test517StructuredDraft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test517-no-structural-retry",
      premiumRequestIntakeFingerprint: "fp-test517-retry",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test517StructuredDraft(),
    });

    expect(
      spy.mock.calls.some((call) => call[0]?.reason === "degraded_structural_retry"),
    ).toBe(false);
    expect(premiumApiMock.callIndex).toBe(1);
  });

  it("dashboard_paid_create renders Review from normalized authoritative body", async () => {
    premiumApiMock.mockResponses = [buildTest517DegradedDocumentTextOnlyWire()];

    const out = await runPremiumCompletion({
      intakeText: TEST517_INTAKE,
      originalUserIntakeRawForMerge: TEST517_INTAKE,
      structuredDraft: test517StructuredDraft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test517-dashboard-review",
      premiumRequestIntakeFingerprint: "fp-test517-dashboard",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test517StructuredDraft(),
    });

    expect(out.premiumRenderSource).toMatch(/server_full_draft/);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(TEST517_TARGET_LEN - 500);

    markPaidDashboardCreateContextForTests(DASHBOARD_PAID_CREATE_ROUTE_SOURCE);
    commitPaidProPipelineValidationAcceptance({
      text: out.winningPremiumBodyText,
      source: "server_full_draft",
    });

    expect(hasDashboardPaidCreateValidatedReviewCorpus()).toBe(true);
    expect(
      computeDashboardPaidCreateReviewShellReady({
        createUiStage: CreateUiStage.DRAFT,
        displayPhase: "review",
        createFlowPhase: "draft_ready_for_review",
      }),
    ).toBe(true);

    const reviewPlan = gateFirstPaidCreateCanonicalReviewEntry({
      source: "dashboard_paid_create",
      corpusPlain: out.winningPremiumBodyText,
      pipelineSource: out.premiumRenderSource,
      draft: test517StructuredDraft(),
      intakeText: TEST517_INTAKE,
      respectAlreadyOpened: false,
    });
    expect(reviewPlan.shouldApply).toBe(true);
    expect(reviewPlan.corpusPlain.length).toBeGreaterThanOrEqual(TEST517_TARGET_LEN - 500);

    const resolved = resolvePremiumFullDraftAuthoritativeBody(buildTest517DegradedDocumentTextOnlyWire());
    expect(resolved.hasAuthoritativeServerDocument).toBe(true);
    expect(resolved.sourceField).toBe("document_text");
  });
});
