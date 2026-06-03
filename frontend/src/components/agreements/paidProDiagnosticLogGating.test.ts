import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { logPaidProPlaceholderGateDecision } from "./agreementTemplatePlaceholderSafety";
import { logPremiumCompletionDebug } from "./premiumCompletionDebugLog";
import { logPremiumSessionConsistency } from "./premiumSessionDiagnostics";
import {
  paidProPerfTraceEnabled,
  paidProVerboseQaLogsEnabled,
} from "./paidProPerfLogging";
import { logPremiumGenerationRatio, tracePaidProQaPassText } from "./paidProQaPerfTrace";

describe("paidProDiagnosticLogGating", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("strict perf trace requires VITE_PAID_PRO_PERF_TRACE even in DEV", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    expect(paidProPerfTraceEnabled()).toBe(false);
    expect(paidProVerboseQaLogsEnabled()).toBe(true);
  });

  it("suppresses premium-completion-debug without verbose QA gate", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumCompletionDebug({ stage: "test_stage" });
    expect(info.mock.calls.some((c) => c[0] === "[premium-completion-debug]")).toBe(false);
    info.mockRestore();
  });

  it("suppresses premium-session-consistency without verbose QA gate", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumSessionConsistency({ context: "test" });
    expect(info.mock.calls.some((c) => c[0] === "[premium-session-consistency]")).toBe(false);
    info.mockRestore();
  });

  it("emits premium-generation-ratio only with perf trace flag", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumGenerationRatio({
      intakeLen: 10,
      serverDocumentLen: 100,
      normalizedDocumentLen: 100,
      sourceField: "document_text",
      responseBodyLen: 200,
    });
    expect(info.mock.calls.some((c) => c[0] === "[premium-generation-ratio]")).toBe(true);
    info.mockRestore();
  });

  it("placeholder gate decision logs on fatal without perf flag", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPaidProPlaceholderGateDecision({
      surface: "test",
      docLen: 1000,
      scannedCount: 1,
      fatalCount: 1,
      nonfatalCount: 0,
      repairedCount: 0,
      partyAnchorsFound: true,
      partyCount: 2,
      accepted: false,
    });
    expect(info.mock.calls.some((c) => c[0] === "[paid-pro-placeholder-gate-decision]")).toBe(true);
    info.mockRestore();
  });

  it("tracePaidProQaPassText returns identical text when trace flag off", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const body = "Agreement body unchanged.\n\n1. SCOPE\nText.";
    const out = tracePaidProQaPassText("paid-pro-placeholder-gate", "t", body, () => body);
    expect(out).toBe(body);
  });

  it("applyAcceptedProCorpusSafeDisplay identical with and without trace flag", () => {
    const raw = "CONSULTING AGREEMENT\n\nBetween A LLC and B Inc.\n\n1. SCOPE\nServices.";
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const off = applyAcceptedProCorpusSafeDisplay(raw, { intakeText: "A LLC and B Inc consulting." });
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const on = applyAcceptedProCorpusSafeDisplay(raw, { intakeText: "A LLC and B Inc consulting." });
    expect(on.text).toBe(off.text);
  });
});
