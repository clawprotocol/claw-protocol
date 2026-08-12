import { beforeEach, describe, expect, it, vi } from "vitest";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import {
  logPremiumApiResultFromWire,
  premiumApiResultHasAuthoritativeServerCorpus,
} from "./premiumApiHandoff";
import {
  looksLikePremiumResponseJsonWrapper,
  normalizePremiumFullDraftResponsePayload,
  rejectPremiumWireDocumentCandidate,
} from "./premiumFullDraftResponseNormalization";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const TEST235_INTAKE =
  "Create a mutual consulting and implementation agreement between Blue Canyon Analytics LLC (Client) " +
  "and Iron Vale Systems Inc. (Service Provider). Fixed fee $8,500. Delaware law governs.";

const premiumApiMock = vi.hoisted(() => ({
  mockResponses: [] as PremiumFullDraftResult[],
  callIndex: 0,
  forceValidateFail: false,
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
    postPremiumFullDraftOnce: () => Promise.reject(new Error("no_mock")),
  };
});

vi.mock("./paidProCorpusAcceptance", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./paidProCorpusAcceptance")>();
  return {
    ...mod,
    validatePaidProOutput: (...args: Parameters<typeof mod.validatePaidProOutput>) => {
      if (premiumApiMock.forceValidateFail) {
        return { ok: false, reasons: ["premium_truth_gate_soft_fail_test"] };
      }
      return mod.validatePaidProOutput(...args);
    },
  };
});

function test235StructuredDraft(): ParsedDraftShape {
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

function buildTest235ValidBody(targetLen: number): string {
  const header = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
    "",
    "1. Scope of Services. Service Provider shall deliver AI workflow implementation services.",
    "2. Payment. Client shall pay Service Provider a fixed fee of $8,500.",
    "3. Governing Law. This Agreement is governed by the laws of the State of Delaware.",
    "4. Electronic Signatures. The parties agree that electronic signatures are valid and binding.",
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
  let i = 5;
  while (body.length < targetLen) {
    body +=
      `\n${i}. Additional Provision. The parties acknowledge that the obligations under section ${i} are ` +
      "commercially reasonable and shall be performed diligently in connection with the engagement.";
    i += 1;
  }
  return body;
}

function buildDegradedDocumentTextWrapper(): string {
  return [
    "Below is a structured summary from your notes.",
    "Operative terms. The parties intend to document the commercial framework.",
    "Fill in with counsel as needed.",
  ].join("\n");
}

beforeEach(() => {
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumParseSessionGuard();
  clearPremiumGenerationCallAudit();
  premiumApiMock.mockResponses = [];
  premiumApiMock.callIndex = 0;
  premiumApiMock.forceValidateFail = false;
});

describe("paidPro Test235 premium response normalization", () => {
  it("prefers authoritative_draft over degraded document_text wrapper", () => {
    const valid = buildTest235ValidBody(6_380);
    const normalized = normalizePremiumFullDraftResponsePayload({
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
      server_full_document_text: "",
      document_text: buildDegradedDocumentTextWrapper(),
      authoritative_draft: valid,
    });
    expect(normalized.sourceField).toBe("authoritative_draft");
    expect(normalized.authoritativeText).toBe(valid);
    expect(normalized.wire.server_full_document_text).toBe(valid);
    expect(rejectPremiumWireDocumentCandidate(buildDegradedDocumentTextWrapper())?.reasons.length).toBeGreaterThan(
      0,
    );
  });

  it("rejects JSON wrapper text and does not treat it as authoritative", () => {
    const wrapper = JSON.stringify({
      title: "Agreement",
      agreement_family: "services_agreement",
      document_text: "stub",
      generation_outcome: "degraded",
    });
    expect(looksLikePremiumResponseJsonWrapper(wrapper)).toBe(true);
    expect(rejectPremiumWireDocumentCandidate(wrapper)?.reasons).toContain("json_wrapper");
    const normalized = normalizePremiumFullDraftResponsePayload({
      server_full_document_text: "",
      document_text: wrapper,
    });
    expect(normalized.authoritativeText).toBe("");
    expect(premiumApiResultHasAuthoritativeServerCorpus(normalized.wire)).toBe(false);
  });

  it("unwraps nested operative document from a JSON envelope in document_text", () => {
    const valid = buildTest235ValidBody(5_547);
    const wrapper = JSON.stringify({
      title: "Mutual Consulting and Implementation Agreement",
      agreement_family: "services_agreement",
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
      document_text: valid,
      server_full_document_text: "",
    });
    const normalized = normalizePremiumFullDraftResponsePayload({
      server_full_document_text: "",
      document_text: wrapper,
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
    });
    expect(normalized.sourceField).toBe("json_envelope.document_text");
    expect(normalized.authoritativeText).toBe(valid);
    expect(normalized.authoritativeText.length).toBeGreaterThanOrEqual(5_400);
    expect(premiumApiResultHasAuthoritativeServerCorpus(normalized.wire)).toBe(true);
  });

  it("logPremiumApiResultFromWire uses normalized corpus when server_full is missing", () => {
    const valid = buildTest235ValidBody(6_380);
    logPremiumApiResultFromWire({
      ok: true,
      status: 200,
      wire: {
        generation_outcome: "degraded",
        server_full_document_text: "",
        document_text: buildDegradedDocumentTextWrapper(),
        full_document_text: valid,
      } as unknown as PremiumFullDraftResult,
    });
    const normalized = normalizePremiumFullDraftResponsePayload({
      server_full_document_text: "",
      document_text: buildDegradedDocumentTextWrapper(),
      full_document_text: valid,
    } as Record<string, unknown>);
    expect(normalized.sourceField).toBe("full_document_text");
    expect(normalized.authoritativeText.length).toBeGreaterThanOrEqual(6_000);
  });

  it(
    "HTTP 200 Test235 wire accepts normalized server document instead of local recovery",
    async () => {
    const valid = buildTest235ValidBody(6_380);
    premiumApiMock.mockResponses = [
      {
        title: "Mutual Consulting and Implementation Agreement",
        agreement_family: "services_agreement",
        document_text: buildDegradedDocumentTextWrapper(),
        authoritative_draft: valid,
        server_full_document_text: "",
        generation_outcome: "degraded",
        server_generation_failure_code: "json_parse",
        server_generation_failure_message: "Structured intelligence JSON failed to parse.",
        agreement_validation: {
          passed: false,
          failures: [{ code: "missing_parties", message: "No parties", severity: "high" }],
          warnings: [],
          minimum_contract_elements: {
            identifiable_parties: false,
            agreement_purpose_or_scope: false,
            exchange_of_value_or_consideration: false,
            obligations_or_performance: false,
            execution_or_acceptance_mechanism: false,
          },
          summary: { failure_count: 1, warning_count: 0, checked_at: "2026-01-01T00:00:00Z" },
        },
        key_terms_found: [],
        missing_material_info: [],
      },
    ];
    const out = await runPremiumCompletion({
      intakeText: TEST235_INTAKE,
      originalUserIntakeRawForMerge: TEST235_INTAKE,
      structuredDraft: test235StructuredDraft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test235-normalized-wire",
      premiumRequestIntakeFingerprint: "fp-test235",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test235StructuredDraft(),
    });
    expect(out.premiumRenderSource).not.toBe("premium_degraded_server_local_recovery");
    expect(out.premiumRenderSource).toMatch(/server_full_draft/);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(6_000);
    expect(out.winningPremiumBodyText).toContain(PAID_PRO_HARDENING_CLIENT);
    expect(out.winningPremiumBodyText).toMatch(/\$8,500|8500/i);
    expect(out.winningPremiumBodyText).toMatch(/Delaware/i);
    expect(countPaidProExecutionBlocks(out.winningPremiumBodyText)).toBe(1);
  },
  20_000,
  );

  it("detects parties, payment, and governing law from normalized authoritative text", () => {
    const valid = buildTest235ValidBody(6_380);
    const vPaid = validatePaidProOutput({
      text: valid,
      rawIntake: TEST235_INTAKE,
      draft: test235StructuredDraft(),
      premiumPipelineSource: "server_full_draft",
    });
    expect(vPaid.ok).toBe(true);
    expect(valid).toMatch(/Blue Canyon Analytics LLC/i);
    expect(valid).toMatch(/Iron Vale Systems Inc/i);
    expect(valid).toMatch(/\$8,500|8500/i);
    expect(valid).toMatch(/Delaware/i);
  });

  it("wrapper-only degraded wire does not become authoritative server_full_draft", async () => {
    const wrapper = JSON.stringify({
      title: "Agreement",
      agreement_family: "services_agreement",
      document_text: buildDegradedDocumentTextWrapper(),
      generation_outcome: "degraded",
    });
    premiumApiMock.mockResponses = [
      {
        title: "Agreement",
        agreement_family: "services_agreement",
        document_text: wrapper,
        server_full_document_text: "",
        generation_outcome: "degraded",
        server_generation_failure_code: "json_parse",
        key_terms_found: [],
        missing_material_info: [],
      },
    ];
    const out = await runPremiumCompletion({
      intakeText: TEST235_INTAKE,
      originalUserIntakeRawForMerge: TEST235_INTAKE,
      structuredDraft: test235StructuredDraft(),
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "gen-test235-wrapper-only",
      premiumRequestIntakeFingerprint: "fp-test235-wrapper",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => test235StructuredDraft(),
    });
    expect(out.premiumRenderSource).not.toMatch(/^server_full_draft/);
    expect(out.winningPremiumBodyText.trim()).not.toContain('"generation_outcome"');
    if (out.premiumRenderSource === "premium_degraded_server_local_recovery") {
      expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    }
  });
});
