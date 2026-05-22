import { describe, expect, it, vi } from "vitest";
import {
  logSimpleFinalReviewAuthoritativeOverride,
  resolveSimpleProFinalReviewCorpus,
} from "./simpleProFinalReviewCorpus";

describe("resolveSimpleProFinalReviewCorpus", () => {
  it("uses authoritative 12955 body when rendered preview is 8193", () => {
    const authoritative = "A".repeat(12955);
    const rendered = "B".repeat(8193);
    const warn = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: authoritative,
      renderedPreviewPlain: rendered,
      appliedAnswerCount: 5,
    });
    expect(result.plainText.length).toBe(12955);
    expect(result.overriddenPreview).toBe(true);
    expect(result.authoritativeLen).toBeGreaterThanOrEqual(12955);
    expect(result.renderedLen).toBe(8193);
    warn.mockRestore();
    logSimpleFinalReviewAuthoritativeOverride({ authoritativeLen: 12955, renderedLen: 8193 });
  });

  it("prefers authoritative over shorter rendered preview", () => {
    const result = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "x".repeat(2000),
      renderedPreviewPlain: "y".repeat(900),
    });
    expect(result.plainText.length).toBe(2000);
    expect(result.source).toBe("authoritative_hydrated");
  });
});
