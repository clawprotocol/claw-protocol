import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedDraftShape } from "../../intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "../../partyRoleIntake";
import { runPremiumCompletion } from "../../premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "../../premiumFullDraftApi";
import { PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE } from "../../premiumNetworkRecoveryLocalDraft";
import { clearFrozenPremiumSessionBodiesForTests } from "../../premiumAcceptancePolicy";
import {
  assertTest225PremiumNetworkCallBudget,
  clearPremiumGenerationCallAudit,
} from "../../paidProPremiumGenerationCallAudit";
import * as secondGenLog from "../../paidProSecondGenerationTriggerLog";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const TEST225_INTAKE = readFileSync(join(FIXTURE_DIR, "freeProQaTemplateATest220.intake.txt"), "utf8").trim();

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const structured: ParsedDraftShape = {
  title: "Mutual Consulting and Implementation Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  purpose: "AI workflow implementation services.",
  payment_terms: "$8,500 fixed fee.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
  agreement_family: "services_agreement",
};

function buildDegradedDisplayEligibleBody(targetLen: number): string {
  const header = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    "Blue Canyon Analytics LLC and Iron Vale Systems Inc. agree to AI workflow implementation.",
    "Fixed fee $8,500. Delaware law governs.",
    "",
  ].join("\n");
  const bannedMarkers = [
    "[claw_full_draft_expansion_v1]",
    "internal generation",
    "gap-trace",
    "sparse-prompt premium expansion",
  ];
  let body = header;
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. ${bannedMarkers[i % bannedMarkers.length]} The parties shall perform diligently. `;
    i += 1;
  }
  return `${body}\n\nIN WITNESS WHEREOF\nCLIENT: Blue Canyon Analytics LLC\nSERVICE PROVIDER: Iron Vale Systems Inc.`;
}

function buildNonDisplayDegradedWithBannedMarkers(targetLen: number): string {
  let body = "GENERIC SERVICES AGREEMENT\n\nAcme Corp and Beta LLC consulting engagement.\n";
  const banned = "[claw_full_draft_expansion_v1] internal generation gap-trace sparse-prompt premium expansion";
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. ${banned} Operative terms for milestone ${i + 1}.\n`;
    i += 1;
  }
  return body;
}

function buildAcceptedRetryBody(targetLen: number): string {
  const header = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    "This Agreement is entered into between Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider).",
    "Fixed fee $8,500. Governing law: Delaware.",
    "",
  ].join("\n");
  let body = header;
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. Scope, payment, confidentiality, termination, and dispute resolution for milestone ${i + 1}. `;
    i += 1;
  }
  return `${body}\n\nIN WITNESS WHEREOF\nCLIENT: Blue Canyon Analytics LLC\nSERVICE PROVIDER: Iron Vale Systems Inc.`;
}

const h = vi.hoisted(() => {
  const degraded = buildDegradedDisplayEligibleBody(6_220);
  const accepted = buildAcceptedRetryBody(17_317);
  return {
    netCount: 0,
    degradedResult: {
      title: "Mutual Consulting and Implementation Agreement",
      agreement_family: "services_agreement",
      document_text: degraded,
      server_full_document_text: degraded,
      agreement_validation: {
        passed: false,
        failures: [{ code: "requested_e_sign_missing", message: "missing", severity: "high" as const }],
        warnings: [],
        minimum_contract_elements: {
          identifiable_parties: true,
          agreement_purpose_or_scope: true,
          exchange_of_value_or_consideration: true,
          obligations_or_performance: true,
          execution_or_acceptance_mechanism: true,
        },
        summary: { failure_count: 1, warning_count: 0, checked_at: "" },
      },
      key_terms_found: [] as string[],
      missing_material_info: [] as string[],
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
      server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    } satisfies PremiumFullDraftResult,
    acceptedResult: {
      title: "Mutual Consulting and Implementation Agreement",
      agreement_family: "services_agreement",
      document_text: accepted,
      server_full_document_text: accepted,
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
        summary: { failure_count: 0, warning_count: 0, checked_at: "" },
      },
      key_terms_found: [] as string[],
      missing_material_info: [] as string[],
      generation_outcome: "ok",
    } satisfies PremiumFullDraftResult,
    shortDegradedResult: (() => {
      let body = "GENERIC DEGRADED AGREEMENT\n\n";
      while (body.length < 8_000) {
        body += "Section. Generic clause without named parties or Delaware fee anchors.\n";
      }
      return {
        title: "Agreement",
        agreement_family: "services_agreement",
        document_text: body,
        server_full_document_text: body,
        key_terms_found: [] as string[],
        missing_material_info: [] as string[],
        generation_outcome: "degraded",
        server_generation_failure_code: "json_parse",
        server_generation_failure_message: "parse error",
      } satisfies PremiumFullDraftResult;
    })(),
  };
});

vi.mock("../../premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () => {
      h.netCount += 1;
      return Promise.resolve({ ok: true as const, result: h.degradedResult });
    },
    postPremiumFullDraftOnce: () => {
      h.netCount += 1;
      return Promise.resolve(h.acceptedResult);
    },
  };
});

describe("paidPro second-generation trigger logging in pipeline", () => {
  beforeEach(() => {
    (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest = false;
    h.netCount = 0;
    clearPremiumGenerationCallAudit();
    clearFrozenPremiumSessionBodiesForTests();
    vi.clearAllMocks();
    const degraded = buildDegradedDisplayEligibleBody(6_220);
    h.degradedResult.document_text = degraded;
    h.degradedResult.server_full_document_text = degraded;
    const accepted = buildAcceptedRetryBody(17_317);
    h.acceptedResult.document_text = accepted;
    h.acceptedResult.server_full_document_text = accepted;
  });

  it("does not log second-generation trigger when Test225 skip path avoids retry", async () => {
    const spy = vi.spyOn(secondGenLog, "logPremiumSecondGenerationTriggered");
    const out = await runPremiumCompletion({
      intakeText: TEST225_INTAKE,
      originalUserIntakeRawForMerge: TEST225_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-trigger-skip",
      premiumRequestIntakeFingerprint: "fp-trigger-skip",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "checkout_completion",
    });

    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(h.netCount).toBe(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs degraded_structural_retry immediately before the second POST", async () => {
    (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest = true;
    const nonDisplay = buildNonDisplayDegradedWithBannedMarkers(6_780);
    h.degradedResult.document_text = nonDisplay;
    h.degradedResult.server_full_document_text = nonDisplay;
    h.degradedResult.generation_outcome = "degraded";
    h.degradedResult.server_generation_failure_code = "json_parse";
    const spy = vi.spyOn(secondGenLog, "logPremiumSecondGenerationTriggered");
    await runPremiumCompletion({
      intakeText: TEST225_INTAKE,
      originalUserIntakeRawForMerge: TEST225_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-trigger-structural",
      premiumRequestIntakeFingerprint: "fp-trigger-structural",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "checkout_completion",
    });

    expect(h.netCount).toBe(2);
    assertTest225PremiumNetworkCallBudget();
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]?.[0];
    expect(payload?.reason).toBe("degraded_structural_retry");
    expect(payload?.attempt).toBeUndefined();
    const built = secondGenLog.buildPremiumSecondGenerationTriggerPayload({
      ...payload!,
      attempt: 2,
    });
    expect(built.reason).toBe("degraded_structural_retry");
    expect(built.clientAcceptanceOk).toBe(false);
    expect(built.skipStructuralRetryApplied).toBe(false);
    expect(built.firstDocumentLen).toBeGreaterThan(6_000);
    expect(secondGenLog.premiumSecondGenerationTriggerPayloadIsSafe(built)).toBe(true);
    expect(JSON.stringify(built)).not.toMatch(/Blue Canyon|Iron Vale|IN WITNESS/i);
  });

  it("does not introduce a third premium HTTP call when structural retry is logged", async () => {
    (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest = true;
    const nonDisplay = buildNonDisplayDegradedWithBannedMarkers(6_780);
    h.degradedResult.document_text = nonDisplay;
    h.degradedResult.server_full_document_text = nonDisplay;
    vi.spyOn(secondGenLog, "logPremiumSecondGenerationTriggered");
    await runPremiumCompletion({
      intakeText: TEST225_INTAKE,
      originalUserIntakeRawForMerge: TEST225_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-trigger-budget",
      premiumRequestIntakeFingerprint: "fp-trigger-budget",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "checkout_completion",
    });
    expect(h.netCount).toBeLessThanOrEqual(2);
  });
});
