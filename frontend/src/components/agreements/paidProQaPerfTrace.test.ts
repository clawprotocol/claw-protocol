import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  clearLastFinishedPaidProPerformanceTrace,
  clearPaidProPerformanceTrace,
  finishPaidProPerformanceWaterfall,
  startPaidProPerformanceTrace,
} from "./paidProPerformanceTrace";
import {
  logPremiumGenerationRatio,
  markPaidProCheckoutReturnAt,
  markPaidProFirstReviewPaintAt,
  paidProQaPerfTraceEnabled,
  readPaidProQaPerfTraceStateForTests,
  resetPaidProQaPerfTraceForTests,
  tracePaidProQaPassText,
} from "./paidProQaPerfTrace";

describe("paidProQaPerfTrace", () => {
  beforeEach(() => {
    resetPaidProQaPerfTraceForTests();
    clearPaidProPerformanceTrace();
    clearLastFinishedPaidProPerformanceTrace();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPaidProQaPerfTraceForTests();
    clearPaidProPerformanceTrace();
    clearLastFinishedPaidProPerformanceTrace();
  });

  it("is disabled without VITE_PAID_PRO_PERF_TRACE even when DEV is true", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    expect(paidProQaPerfTraceEnabled()).toBe(false);
  });

  it("enables when VITE_PAID_PRO_PERF_TRACE is set in test mode", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    expect(paidProQaPerfTraceEnabled()).toBe(true);
  });

  it("emits premium-generation-ratio when trace is enabled", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumGenerationRatio({
      sessionGenerationId: "session-abc-12345678",
      intakeLen: 208,
      serverDocumentLen: 15137,
      normalizedDocumentLen: 15137,
      sourceField: "document_text",
      responseBodyLen: 18000,
    });
    const ratioLog = info.mock.calls.find((c) => c[0] === "[premium-generation-ratio]");
    expect(ratioLog).toBeDefined();
    expect(ratioLog?.[1]).toMatchObject({
      intakeLen: 208,
      normalizedDocumentLen: 15137,
      expansionRatio: expect.closeTo(72.78, 0.1),
      sourceField: "document_text",
    });
    info.mockRestore();
  });

  it("tracePaidProQaPassText returns byte-identical output", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const input = "SERVICES AGREEMENT\n\n1. SCOPE\n\nBody text here.";
    const direct = input.trim();
    const wrapped = tracePaidProQaPassText("buildPremiumAgreementReadonlyHtml", "test", input, () => direct);
    expect(wrapped).toBe(direct);
    expect(wrapped).toBe(input.trim());
  });

  it("applyAcceptedProCorpusSafeDisplay output unchanged when trace enabled", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const raw = "MUTUAL CONSULTING AGREEMENT\n\nBetween Acme LLC and Beta Inc.\n\n1. SCOPE\nWork.";
    const withoutTrace = applyAcceptedProCorpusSafeDisplay(raw, { surface: "test_off" });
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    resetPaidProQaPerfTraceForTests();
    const withTrace = applyAcceptedProCorpusSafeDisplay(raw, { surface: "test_on" });
    expect(withTrace.text).toBe(withoutTrace.text);
  });

  it("suppresses duplicate premium-pass-timing for same session hash pass surface", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    startPaidProPerformanceTrace({
      traceId: "g-dedupe",
      sessionGenerationId: "g-dedupe",
      intakeFingerprint: "fp",
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const body = "Same corpus for dedupe test.\n\n1. SCOPE\nText.";
    tracePaidProQaPassText("paid-pro-placeholder-gate", "premium_completion_pipeline", body, () => body);
    tracePaidProQaPassText("paid-pro-placeholder-gate", "premium_completion_pipeline", body, () => body);
    const passLogs = info.mock.calls.filter((c) => c[0] === "[premium-pass-timing]");
    expect(passLogs).toHaveLength(1);
    expect(readPaidProQaPerfTraceStateForTests().passLogDedupeSize).toBe(1);
    info.mockRestore();
  });

  it("finishPaidProPerformanceWaterfall emits checkout paid-pro-waterfall only once per session", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    markPaidProCheckoutReturnAt();
    startPaidProPerformanceTrace({
      traceId: "g-finish",
      sessionGenerationId: "g-finish",
      intakeFingerprint: "fp",
      deferFinish: true,
    });
    markPaidProFirstReviewPaintAt();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    finishPaidProPerformanceWaterfall();
    finishPaidProPerformanceWaterfall();
    const waterfalls = info.mock.calls.filter((c) => c[0] === "[paid-pro-waterfall]");
    expect(waterfalls).toHaveLength(1);
    expect(waterfalls[0]?.[1]).toMatchObject({
      sessionGenerationId: "g-finish",
      checkoutReturnAt: expect.any(Number),
      firstReviewPaintAt: expect.any(Number),
    });
    info.mockRestore();
  });
});
