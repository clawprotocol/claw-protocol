import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import {
  clearFrozenPremiumSessionBodiesForTests,
  latchAcceptedServerFullDraftAuthority,
  LONG_PREMIUM_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";
import {
  guardPaidProAcceptedServerFullDraftCommit,
} from "./paidProAcceptedServerFullDraftCommitGuard";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { shouldBlockStarterRegenerationAfterPaidAuthority } from "./paidProPostAcceptanceStateGuard";
import {
  clearPaidProCheckoutPreviewPreflightCache,
  readPaidProCheckoutPreviewPreflightCacheSize,
} from "./paidProCheckoutPreviewPreflightCache";
import {
  clearLastFinishedPaidProPerformanceTrace,
  clearPaidProPerformanceTrace,
  finishPaidProPerformanceWaterfall,
  readLastFinishedPaidProPerformanceTrace,
  startPaidProPerformanceTrace,
} from "./paidProPerformanceTrace";
import { tracePaidProQaPassText } from "./paidProQaPerfTrace";
import { resetPaidProQaPerfTraceForTests } from "./paidProQaPerfTrace";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import { buildPremiumFullDraftContextForProRequest } from "./premiumFullDraftApi";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { mergePremiumParsePreferFresh } from "./fullDraftUpgradeEnrich";
import {
  resolveCheckoutPremiumParseSubstitute,
  shouldSkipCheckoutPremiumParseBeforeFullDraft,
} from "./paidProCheckoutParseSkip";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

const structured: ParsedDraftShape = {
  title: "Mutual Consulting and Implementation Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  purpose:
    "Provider delivers AI workflow implementation, integration, and milestone acceptance testing for Client over twelve months.",
  payment_terms: "Fixed fee of $8,500 due upon execution.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: emptyPayment,
  agreement_family: "services_agreement",
  additional_terms:
    "Confidentiality, IP, indemnity, and limitation of liability provisions apply as set out in the operative articles below.",
  termination_summary: "Termination for material breach after thirty-day cure period.",
};

const intakeText =
  "Blue Canyon Analytics LLC and Iron Vale Systems Inc. need a consulting agreement for AI workflow implementation in Delaware with a fixed fee of $8,500 due upon execution.";

function buildServerBody(targetLen: number): string {
  let body = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    "Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider).",
    "Delaware law governs. Fixed fee $8,500.",
    "",
    "1. Scope. AI workflow implementation with commercially reasonable skill.",
    "2. Payment. $8,500 upon execution.",
    "3. Confidentiality. Mutual obligations.",
    "4. IP. Work product vests in Client.",
    "5. Term. Twelve months.",
    "",
    "IN WITNESS WHEREOF",
    "CLIENT: Blue Canyon Analytics LLC",
    "SERVICE PROVIDER: Iron Vale Systems Inc.",
  ].join("\n");
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. Additional operative clause for milestone delivery.\n`;
    i += 1;
  }
  return body;
}

const serverBody = buildServerBody(17_160);

const premiumApiMock = vi.hoisted(() => ({
  mockResponse: null as PremiumFullDraftResult | null,
  parseCallCount: 0,
}));

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      premiumApiMock.mockResponse
        ? Promise.resolve({ ok: true as const, result: premiumApiMock.mockResponse })
        : Promise.resolve({
            ok: false as const,
            failure_kind: "http" as const,
            retryable: false,
            error_code: "test_mode_skipped",
            document_text: "" as const,
            attemptCount: 0,
          }),
    postPremiumFullDraftOnce: () =>
      premiumApiMock.mockResponse
        ? Promise.resolve(premiumApiMock.mockResponse)
        : Promise.reject(new Error("no_mock")),
  };
});

beforeEach(() => {
  vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
  clearFrozenPremiumSessionBodiesForTests();
  clearPremiumParseSessionGuard();
  clearPremiumGenerationCallAudit();
  clearPaidProSourceOfTruth();
  clearPaidProCheckoutPreviewPreflightCache();
  clearPaidProPerformanceTrace();
  clearLastFinishedPaidProPerformanceTrace();
  resetPaidProQaPerfTraceForTests();
  premiumApiMock.parseCallCount = 0;
  premiumApiMock.mockResponse = {
    document_text: serverBody,
    server_full_document_text: serverBody,
    generation_outcome: "ok",
    title: structured.title,
    agreement_family: "services_agreement",
    key_terms_found: [],
    missing_material_info: [],
    schema_validation_reasons: [],
    authoritative_draft: serverBody,
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("paidPro Test245 generation latency attribution", () => {
  it("keeps ~17k server_full_draft authoritative and blocks shorter commit", () => {
    expect(serverBody.length).toBeGreaterThanOrEqual(LONG_PREMIUM_AUTHORITATIVE_MIN_LEN);
    const hash = hashPaidProCorpus(serverBody);
    latchAcceptedServerFullDraftAuthority(serverBody, "server_full_draft");
    establishPaidProSourceOfTruth({ text: serverBody, source: "server_full_draft" });
    expect(getPaidProSourceOfTruth()?.hash).toBe(hash);
    const short = buildServerBody(4_711);
    const guard = guardPaidProAcceptedServerFullDraftCommit({
      candidateText: short,
      candidateSource: "fallback_preview",
      renderSource: "server_full_draft",
      generationOutcome: "ok",
      agreementGenerationId: "g-test245",
      reason: "test_short_candidate",
    });
    expect(guard.rejected).toBe(true);
  });

  it("tracePaidProQaPassText does not mutate corpus bytes", () => {
    const body = serverBody;
    const out = tracePaidProQaPassText("paid-pro-placeholder-gate", "test245", body, () => body);
    expect(out).toBe(body);
    expect(hashPaidProCorpus(out)).toBe(hashPaidProCorpus(body));
  });

  it("skips checkout parse without changing full-draft context payload shape", async () => {
    expect(
      shouldSkipCheckoutPremiumParseBeforeFullDraft({
        premiumGenerationCallReason: "checkout_completion",
        structuredDraft: structured,
        rawIntake: intakeText,
      }),
    ).toBe(true);
    const parseDraft = vi.fn(async () => {
      premiumApiMock.parseCallCount += 1;
      return structured;
    });
    const substitute = resolveCheckoutPremiumParseSubstitute(structured);
    const mergedSkip = mergePremiumParsePreferFresh(structured, substitute, intakeText);
    const mergedParse = mergePremiumParsePreferFresh(structured, substitute, intakeText);
    const intent = resolveAgreementIntentContract(intakeText);
    const ctxSkip = buildPremiumFullDraftContextForProRequest(intakeText, mergedSkip, intent);
    const ctxParse = buildPremiumFullDraftContextForProRequest(intakeText, mergedParse, intent);
    expect(ctxSkip).toEqual(ctxParse);

    await runPremiumCompletion({
      intakeText,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft,
      agreementGenerationId: "gen-test245-skip",
      premiumGenerationCallReason: "checkout_completion",
    });
    expect(parseDraft).not.toHaveBeenCalled();
  });

  it("dedupes duplicate checkout preflight preview within one session", async () => {
    const parseDraft = vi.fn(async () => structured);
    await runPremiumCompletion({
      intakeText,
      structuredDraft: structured,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      parseDraft,
      agreementGenerationId: "gen-test245-preflight",
      premiumGenerationCallReason: "checkout_completion",
    });
    expect(readPaidProCheckoutPreviewPreflightCacheSize()).toBeGreaterThan(0);
    expect(readPaidProCheckoutPreviewPreflightCacheSize()).toBeLessThanOrEqual(3);
  });

  it("blocks starter regeneration after paid Pro SoT", () => {
    establishPaidProSourceOfTruth({ text: serverBody, source: "server_full_draft" });
    expect(shouldBlockStarterRegenerationAfterPaidAuthority()).toBe(true);
  });

  it("emits attribution buckets only when VITE_PAID_PRO_PERF_TRACE=1", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    startPaidProPerformanceTrace({
      traceId: "t245",
      sessionGenerationId: "gen-245",
      intakeFingerprint: "fp245",
    });
    finishPaidProPerformanceWaterfall();
    expect(info.mock.calls.some((c) => String(c[0]).includes("[premium-generation-attribution]"))).toBe(
      false,
    );
    info.mockClear();
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    startPaidProPerformanceTrace({
      traceId: "t245b",
      sessionGenerationId: "gen-245b",
      intakeFingerprint: "fp245b",
    });
    finishPaidProPerformanceWaterfall();
    expect(info.mock.calls.some((c) => String(c[0]).includes("[premium-generation-attribution]"))).toBe(
      true,
    );
    const trace = readLastFinishedPaidProPerformanceTrace();
    expect(trace?.traceId).toBe("t245b");
    info.mockRestore();
  });
});
