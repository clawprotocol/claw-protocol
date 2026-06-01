import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getPaidProMutationTimeline,
  resetPaidProMutationTraceForTests,
  setPaidProMutationTraceForceEnabledForTests,
  tracePaidProCorpusMutation,
} from "./paidProMutationTrace";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolvePaidProFinalHydratedCorpusForSurface } from "./paidProFinalHydratedCorpus";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { setPaidProPinnedSignerAppliedCorpus, clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";

const MIN_BODY =
  "CONSULTING AGREEMENT\n\n" +
  "1. Services. Provider shall perform professional services.\n\n".repeat(40) +
  "IN WITNESS WHEREOF\n\nCLIENT:\nName: ______\n\nSERVICE PROVIDER:\nName: ______\n";

describe("paidProMutationTrace", () => {
  beforeEach(() => {
    resetPaidProMutationTraceForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  afterEach(() => {
    resetPaidProMutationTraceForTests();
    clearPaidProSourceOfTruth();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("does not record events in test mode by default", () => {
    tracePaidProCorpusMutation({
      store: "paidProSourceOfTruth",
      caller: "test",
      stage: "unit",
      oldText: "before",
      newText: "after",
    });
    expect(getPaidProMutationTimeline()).toHaveLength(0);
  });

  it("dedupes identical write signatures in one session", () => {
    setPaidProMutationTraceForceEnabledForTests(true);
    const args = {
      store: "paidProSourceOfTruth" as const,
      caller: "establishPaidProSourceOfTruth",
      stage: "establish",
      oldText: "",
      newText: MIN_BODY,
    };
    tracePaidProCorpusMutation(args);
    tracePaidProCorpusMutation(args);
    expect(getPaidProMutationTimeline()).toHaveLength(1);
  });

  it("resolve/render paths do not append mutation trace entries", () => {
    establishPaidProSourceOfTruth({ text: MIN_BODY, source: "server_full_draft" });
    expect(hasPaidProSourceOfTruth()).toBe(true);

    setPaidProMutationTraceForceEnabledForTests(true);
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    resolvePaidProReviewRenderPlain();
    resolvePaidProFinalHydratedCorpusForSurface("review");
    resolvePaidProFinalHydratedCorpusForSurface("copy");

    expect(getPaidProMutationTimeline()).toHaveLength(0);
    const traceCalls = consoleSpy.mock.calls.filter(
      (c) => typeof c[0] === "string" && String(c[0]).includes("[paid-pro-mutation-trace]"),
    );
    expect(traceCalls).toHaveLength(0);

    consoleSpy.mockRestore();
    resetPaidProMutationTraceForTests();
  });

  it("real store writes append exactly one trace entry per distinct mutation", () => {
    setPaidProMutationTraceForceEnabledForTests(true);
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    setPaidProPinnedSignerAppliedCorpus(MIN_BODY);
    expect(getPaidProMutationTimeline()).toHaveLength(1);
    expect(getPaidProMutationTimeline()[0]?.caller).toBe("setPaidProPinnedSignerAppliedCorpus");

    const revised = `${MIN_BODY}\n2. Additional clause.\n`;
    establishPaidProSourceOfTruth({ text: revised, source: "server_full_draft", allowShorterOverwrite: true });
    expect(getPaidProMutationTimeline().length).toBeGreaterThanOrEqual(2);

    const traceCalls = consoleSpy.mock.calls.filter(
      (c) => typeof c[0] === "string" && String(c[0]).includes("[paid-pro-mutation-trace]"),
    );
    expect(traceCalls.length).toBeGreaterThanOrEqual(2);
    expect(traceCalls.length).toBeLessThanOrEqual(getPaidProMutationTimeline().length + 2);

    consoleSpy.mockRestore();
  });
});
