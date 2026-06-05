import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPaidProReviewStabilitySnapshot,
  notePaidProReviewHashFromPlain,
  recordPaidProPreviewRecompute,
  recordPaidProReviewRender,
  resetPaidProReviewStabilityForTests,
} from "./paidProReviewStability";

const PLAIN_A = `Paid Pro agreement. ${"Clause. ".repeat(400)}`;

describe("paidProReviewStability dedup", () => {
  afterEach(() => {
    resetPaidProReviewStabilityForTests();
    vi.restoreAllMocks();
  });

  it("does not increment recompute count for repeated builder id", () => {
    recordPaidProPreviewRecompute("buildAgreementPreviewText");
    recordPaidProPreviewRecompute("buildAgreementPreviewText");
    expect(getPaidProReviewStabilitySnapshot().recomputeCount).toBe(1);
  });

  it("does not increment render count when review hash is unchanged", () => {
    recordPaidProReviewRender(PLAIN_A);
    notePaidProReviewHashFromPlain(PLAIN_A);
    recordPaidProReviewRender(PLAIN_A);
    expect(getPaidProReviewStabilitySnapshot().renderCount).toBe(1);
  });
});
