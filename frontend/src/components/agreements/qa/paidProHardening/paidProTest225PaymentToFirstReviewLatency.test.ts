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
  readPremiumNetworkCallRecords,
  recordPremiumNetworkCall,
} from "../../paidProPremiumGenerationCallAudit";
import { validateProMinimumSubstance } from "../../paidProConciseServicesQuality";
import {
  clearPaidProPostAcceptanceValidatorCache,
  readProMinimumSubstanceCacheSize,
} from "../../paidProPostAcceptanceValidatorCache";
import {
  clearLastFinishedPaidProPerformanceTrace,
  flattenPaidProWaterfallSpan,
  readLastFinishedPaidProPerformanceTrace,
  type PaidProWaterfallSpanSummary,
} from "../../paidProPerformanceTrace";
import { shortIntakeFingerprint } from "../../../../lib/agreementGenerationId";
import type { PremiumNetworkCallReason } from "../../paidProPremiumGenerationCallAudit";
import { resetPaidProAuthoritySurfaceLogDedupeForTests } from "../../paidProAuthoritySurfaceLog";
import { paidProCheckoutCompletionHasVisibleOutcome } from "../../premiumPostCheckoutApplyEligible";
import { shouldSuppressPaidProGuidedCompletionUi } from "../../paidProPostCheckoutRenderGate";
import { hasPaidProSourceOfTruth } from "../../paidProSourceOfTruth";

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
  const tail = [
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT: Blue Canyon Analytics LLC",
    "SERVICE PROVIDER: Iron Vale Systems Inc.",
  ].join("\n");
  return `${body}\n${tail}`;
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

/** Flatten maps wire generationOutcome; span outcome is omitted when generationOutcome is present. */
const WATERFALL_PREMIUM_API_KEYS: (keyof PaidProWaterfallSpanSummary)[] = [
  "name",
  "startMs",
  "durationMs",
  "attempt",
  "requestReason",
  "responseBodyLen",
  "documentTextLen",
  "serverFullDocumentTextLen",
  "generationOutcome",
  "failureCode",
];

const WATERFALL_JSON_PARSE_DIAG_KEYS: (keyof PaidProWaterfallSpanSummary)[] = [
  "name",
  "startMs",
  "durationMs",
  "failureCode",
  "documentTextLen",
];

const WATERFALL_JSON_PARSE_SKIP_KEYS: (keyof PaidProWaterfallSpanSummary)[] = [
  "name",
  "startMs",
  "durationMs",
  "failureCode",
  "documentTextLen",
  "retryReason",
  "outcome",
];

function assertFlattenedSpanHasKeys(
  span: PaidProWaterfallSpanSummary,
  keys: (keyof PaidProWaterfallSpanSummary)[],
): void {
  for (const key of keys) {
    expect(span[key], `span ${span.name} missing ${key}`).toBeDefined();
  }
}

function mirrorMockPremiumNetworkCall(args: {
  reason: PremiumNetworkCallReason;
  intakeText: string;
  agreementGenerationId?: string | null;
  intakeFingerprint?: string | null;
  result: PremiumFullDraftResult;
}): void {
  const bodyText = JSON.stringify(args.result);
  recordPremiumNetworkCall({
    reason: args.reason,
    intakeFingerprint:
      (args.intakeFingerprint || "").trim() || shortIntakeFingerprint(args.intakeText),
    agreementGenerationId: args.agreementGenerationId ?? null,
    responseBodyLen: bodyText.length,
    documentTextLen: (args.result.document_text || "").trim().length,
    serverFullDocumentTextLen: (args.result.server_full_document_text || "").trim().length,
    generationOutcome: args.result.generation_outcome,
    failureCode: args.result.server_generation_failure_code,
  });
}

const h = vi.hoisted(() => {
  const degraded = buildDegradedDisplayEligibleBody(6_220);
  const accepted = buildAcceptedRetryBody(17_317);
  return {
    netCount: 0,
    mode: "skip_retry" as "skip_retry" | "two_call",
    degradedResult: {
      title: "Mutual Consulting and Implementation Agreement",
      agreement_family: "services_agreement",
      document_text: degraded,
      server_full_document_text: degraded,
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
    postPremiumFullDraftWithRetry: (args: Parameters<typeof mod.postPremiumFullDraftWithRetry>[0]) => {
      h.netCount += 1;
      const result = h.mode === "two_call" ? h.shortDegradedResult : h.degradedResult;
      mirrorMockPremiumNetworkCall({
        reason: args.networkCallReason ?? "checkout_completion",
        intakeText: args.intakeText,
        agreementGenerationId: args.agreementGenerationId,
        result,
      });
      return Promise.resolve({ ok: true as const, result });
    },
    postPremiumFullDraftOnce: (args: Parameters<typeof mod.postPremiumFullDraftOnce>[0]) => {
      h.netCount += 1;
      const result = h.netCount > 1 ? h.acceptedResult : h.degradedResult;
      mirrorMockPremiumNetworkCall({
        reason: args.networkCallReason ?? "degraded_structural_retry",
        intakeText: args.intakeText,
        agreementGenerationId: args.agreementGenerationId,
        intakeFingerprint: args.intakeFingerprint,
        result,
      });
      return Promise.resolve(result);
    },
  };
});

describe("paidPro Test225 payment to first review latency", () => {
  beforeEach(() => {
    (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest = false;
    h.netCount = 0;
    h.mode = "skip_retry";
    clearPremiumGenerationCallAudit();
    clearFrozenPremiumSessionBodiesForTests();
    clearPaidProPostAcceptanceValidatorCache();
    clearLastFinishedPaidProPerformanceTrace();
    resetPaidProAuthoritySurfaceLogDedupeForTests();
    const degraded = buildDegradedDisplayEligibleBody(6_220);
    h.degradedResult.document_text = degraded;
    h.degradedResult.server_full_document_text = degraded;
    const accepted = buildAcceptedRetryBody(17_317);
    h.acceptedResult.document_text = accepted;
    h.acceptedResult.server_full_document_text = accepted;
  });

  it("skips blocking structural retry when degraded body is display-eligible (one premium network call)", async () => {
    h.mode = "skip_retry";
    const out = await runPremiumCompletion({
      intakeText: TEST225_INTAKE,
      originalUserIntakeRawForMerge: TEST225_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test225-skip",
      premiumRequestIntakeFingerprint: "fp-test225-skip",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "checkout_completion",
    });

    expect(h.netCount).toBe(1);
    const networkLedger = readPremiumNetworkCallRecords();
    expect(networkLedger).toHaveLength(1);
    expect(networkLedger[0]?.reason).toBe("checkout_completion");
    expect(networkLedger[0]?.failureCode).toBe("json_parse");
    expect(networkLedger[0]?.generationOutcome).toBe("degraded");
    assertTest225PremiumNetworkCallBudget();
    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(hasPaidProSourceOfTruth()).toBe(false);
    expect(
      shouldSuppressPaidProGuidedCompletionUi({
        premiumPaidDocumentSurface: true,
        premiumCheckoutCompleted: true,
        premiumRenderSource: out.premiumRenderSource,
        premiumDegradedServerLocalRecovery: true,
      }),
    ).toBe(true);

    const finished = readLastFinishedPaidProPerformanceTrace();
    const flat = finished!.spans.map(flattenPaidProWaterfallSpan);

    const apiSpan = flat.find((s) => s.name === "premium_full_draft_api");
    expect(apiSpan).toBeTruthy();
    assertFlattenedSpanHasKeys(apiSpan!, WATERFALL_PREMIUM_API_KEYS);
    expect(apiSpan!.requestReason).toBe("checkout_completion");
    expect(apiSpan!.generationOutcome).toBe("degraded");
    expect(apiSpan!.failureCode).toBe("json_parse");
    expect(apiSpan!.outcome).toBeUndefined();

    const jsonParseSpans = flat.filter((s) => s.name === "json_parse_degraded_handling");
    expect(jsonParseSpans.length).toBeGreaterThanOrEqual(2);
    const diagSpan = jsonParseSpans.find((s) => s.failureCode === "json_parse" && s.retryReason == null);
    expect(diagSpan).toBeTruthy();
    assertFlattenedSpanHasKeys(diagSpan!, WATERFALL_JSON_PARSE_DIAG_KEYS);

    const skipSpan = jsonParseSpans.find((s) => s.retryReason === "degraded_display_eligible");
    expect(skipSpan).toBeTruthy();
    assertFlattenedSpanHasKeys(skipSpan!, WATERFALL_JSON_PARSE_SKIP_KEYS);
    expect(skipSpan!.outcome).toBe("skip_structural_retry");
  });

  it("records checkout then structural retry without a third premium network call", () => {
    clearPremiumGenerationCallAudit();
    recordPremiumNetworkCall({
      reason: "checkout_completion",
      intakeFingerprint: "fp-test225-ledger",
      agreementGenerationId: "g-test225-ledger",
      responseBodyLen: 14_339,
      documentTextLen: 6_220,
      serverFullDocumentTextLen: 6_220,
      generationOutcome: "degraded",
      failureCode: "json_parse",
    });
    recordPremiumNetworkCall({
      reason: "degraded_structural_retry",
      intakeFingerprint: "fp-test225-ledger",
      agreementGenerationId: "g-test225-ledger",
      responseBodyLen: 18_000,
      documentTextLen: 17_317,
      serverFullDocumentTextLen: 17_317,
      generationOutcome: "ok",
    });
    assertTest225PremiumNetworkCallBudget();
    expect(readPremiumNetworkCallRecords()).toHaveLength(2);
  });

  it("integration: structural retry path can return server_full_draft_retry when retry is enabled in test", async () => {
    h.mode = "two_call";
    (globalThis as { __paidProAllowStructuralRetryInTest?: boolean }).__paidProAllowStructuralRetryInTest = true;
    const out = await runPremiumCompletion({
      intakeText: TEST225_INTAKE,
      originalUserIntakeRawForMerge: TEST225_INTAKE,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test225-two",
      premiumRequestIntakeFingerprint: "fp-test225-two",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => structured,
      premiumGenerationCallReason: "checkout_completion",
    });

    expect(h.netCount).toBeLessThanOrEqual(2);
    expect(readPremiumNetworkCallRecords().length).toBe(h.netCount);
    assertTest225PremiumNetworkCallBudget();
    expect(paidProCheckoutCompletionHasVisibleOutcome(out)).toBe(true);
    expect(
      ["server_full_draft_retry", "server_full_draft", PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE].includes(
        out.premiumRenderSource,
      ),
    ).toBe(true);
  });

  it("memoizes pro-minimum-substance-decision for repeated same-hash validation", () => {
    const corpus = buildAcceptedRetryBody(12_000);
    validateProMinimumSubstance({
      text: corpus,
      rawIntake: TEST225_INTAKE,
      draft: structured,
      source: "review_surface",
    });
    validateProMinimumSubstance({
      text: corpus,
      rawIntake: TEST225_INTAKE,
      draft: structured,
      source: "review_surface",
    });
    validateProMinimumSubstance({
      text: corpus,
      rawIntake: TEST225_INTAKE,
      draft: structured,
      source: "copy_surface",
    });
    expect(readProMinimumSubstanceCacheSize()).toBeLessThanOrEqual(2);
  });
});
