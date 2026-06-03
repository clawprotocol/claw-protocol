import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logPaidProRecitalPolish } from "./paidProAgreementPolish";
import { logPlaceholderScanResult } from "./agreementTemplatePlaceholderSafety";
import {
  clearLastFinishedPaidProPerformanceTrace,
  clearPaidProPerformanceTrace,
} from "./paidProPerformanceTrace";
import {
  ingestPaidProPaymentToReviewServerTiming,
  beginPaidProPaymentToReviewTrace,
  completePaidProPaymentToReviewTrace,
} from "./paidProPaymentToReviewTrace";
import {
  logPremiumGenerationRatio,
  markPaidProCheckoutReturnAt,
  markPaidProFirstReviewPaintAt,
  markPaidProPremiumHttpEndAt,
  resetPaidProQaPerfTraceForTests,
  tracePaidProQaPassText,
} from "./paidProQaPerfTrace";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { readPremiumNetworkCallRecords } from "./paidProPremiumGenerationCallAudit";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

describe("paidProTest240 diagnostic instrumentation", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
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

  it("does not emit perf trace logs without VITE_PAID_PRO_PERF_TRACE", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumGenerationRatio({
      intakeLen: 208,
      serverDocumentLen: 18012,
      normalizedDocumentLen: 18012,
      sourceField: "document_text",
      responseBodyLen: 18012,
    });
    tracePaidProQaPassText("paid-pro-recital-polish", "preview_premium_deliverable", "x".repeat(200), () =>
      "x".repeat(200),
    );
    expect(info.mock.calls.some((c) => c[0] === "[premium-generation-ratio]")).toBe(false);
    expect(info.mock.calls.some((c) => c[0] === "[premium-pass-timing]")).toBe(false);
    info.mockRestore();
  });

  it("waterfall records backendServerTimingHeaderMissing when perf trace on and header absent", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    markPaidProCheckoutReturnAt();
    beginPaidProPaymentToReviewTrace({
      traceId: "g-240-missing",
      sessionGenerationId: "g-240-missing",
      intakeFingerprint: "fp-240",
    });
    markPaidProPremiumHttpEndAt();
    ingestPaidProPaymentToReviewServerTiming(null);
    markPaidProFirstReviewPaintAt();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    completePaidProPaymentToReviewTrace({ renderSource: "server_full_draft" });
    const waterfall = info.mock.calls.find((c) => c[0] === "[paid-pro-waterfall]");
    expect(waterfall?.[1]).toMatchObject({ backendServerTimingHeaderMissing: true });
    info.mockRestore();
  });

  it("suppresses no-op polish logs in production-like mode", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPaidProRecitalPolish({
      applied: false,
      partyCount: 2,
      confidence: "high",
      reason: "already_normalized",
    });
    logPlaceholderScanResult({
      surface: "preview_premium_deliverable",
      scannedCount: 0,
      fatalCount: 0,
      nonfatalCount: 0,
      repairedCount: 0,
      bodyLen: 18040,
      partyCount: 2,
      ok: true,
    });
    expect(info.mock.calls.some((c) => c[0] === "[paid-pro-recital-polish]")).toBe(false);
    expect(info.mock.calls.some((c) => c[0] === "[placeholder-scan-result]")).toBe(false);
    info.mockRestore();
  });

  it("trace wrappers do not mutate accepted corpus text", () => {
    const raw =
      "CONSULTING AGREEMENT\n\nBetween Acme LLC and Beta Inc.\n\n1. SCOPE\nProfessional services.\n\nIN WITNESS WHEREOF\n\nClient: ____________________\nService Provider: ____________________";
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const off = applyAcceptedProCorpusSafeDisplay(raw, { intakeText: "Acme LLC Beta Inc consulting." });
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    resetPaidProQaPerfTraceForTests();
    const on = applyAcceptedProCorpusSafeDisplay(raw, { intakeText: "Acme LLC Beta Inc consulting." });
    expect(on.text).toBe(off.text);
    expect(hashPaidProCorpus(on.text)).toBe(hashPaidProCorpus(off.text));
  });

  it("single premium network attempt remains auditable separately from instrumentation", () => {
    expect(readPremiumNetworkCallRecords()).toHaveLength(0);
  });
});
