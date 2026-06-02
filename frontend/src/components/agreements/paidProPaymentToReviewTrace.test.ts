import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginPaidProPaymentToReviewTrace,
  completePaidProPaymentToReviewTrace,
  ingestPaidProPaymentToReviewServerTiming,
} from "./paidProPaymentToReviewTrace";
import {
  clearLastFinishedPaidProPerformanceTrace,
  clearPaidProPerformanceTrace,
  readActivePaidProPerformanceTrace,
  readLastFinishedPaidProPerformanceTrace,
} from "./paidProPerformanceTrace";
import { readPremiumNetworkCallRecords } from "./paidProPremiumGenerationCallAudit";

describe("paidProPaymentToReviewTrace", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    clearPaidProPerformanceTrace();
    clearLastFinishedPaidProPerformanceTrace();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearPaidProPerformanceTrace();
    clearLastFinishedPaidProPerformanceTrace();
  });

  it("defers waterfall finish until review surface is recorded", () => {
    beginPaidProPaymentToReviewTrace({
      traceId: "g-perf-1",
      sessionGenerationId: "g-perf-1",
      intakeFingerprint: "fp-perf-1",
    });
    expect(readActivePaidProPerformanceTrace()?.deferFinish).toBe(true);
    expect(readActivePaidProPerformanceTrace()?.spans.some((s) => s.name === "checkout_return_detected")).toBe(
      true,
    );

    completePaidProPaymentToReviewTrace({ renderSource: "server_full_draft" });

    expect(readActivePaidProPerformanceTrace()).toBeNull();
    const finished = readLastFinishedPaidProPerformanceTrace();
    expect(finished?.spans.some((s) => s.name === "review_surface_visible")).toBe(true);
  });

  it("merges backend timing spans into the active trace", () => {
    beginPaidProPaymentToReviewTrace({
      traceId: "g-perf-2",
      sessionGenerationId: "g-perf-2",
      intakeFingerprint: "fp-perf-2",
    });
    ingestPaidProPaymentToReviewServerTiming(
      JSON.stringify({
        spans: [
          { name: "backend_llm_primary", startMs: 1200, durationMs: 140000 },
          { name: "backend_validation", startMs: 141500, durationMs: 40 },
        ],
      }),
    );
    completePaidProPaymentToReviewTrace({ renderSource: "server_full_draft" });
    const finished = readLastFinishedPaidProPerformanceTrace();
    expect(finished?.spans.some((s) => s.name === "backend_llm_primary")).toBe(true);
    expect(finished?.spans.some((s) => s.name === "backend_validation")).toBe(true);
  });

  it("does not add premium network calls from instrumentation", () => {
    expect(readPremiumNetworkCallRecords()).toHaveLength(0);
  });
});
