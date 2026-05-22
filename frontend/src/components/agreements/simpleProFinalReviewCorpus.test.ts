import { describe, expect, it, vi } from "vitest";
import {
  logFinalReviewAuthoritativeRender,
  resolveSimpleProFinalReviewCorpus,
} from "./simpleProFinalReviewCorpus";

describe("resolveSimpleProFinalReviewCorpus", () => {
  it("final review authority only uses authoritative when authoritativeLen > renderedPreviewLen", () => {
    const authoritative = "A".repeat(9493);
    const rendered = "B".repeat(7530);
    const result = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: authoritative,
      renderedPreviewPlain: rendered,
      appliedAnswerCount: 5,
      finalReviewAuthorityOnly: true,
    });
    expect(result.plainText.length).toBe(9493);
    expect(result.source).not.toBe("rendered_preview");
    expect(result.overriddenPreview).toBe(true);
    expect(result.authoritativeLen).toBeGreaterThan(result.renderedLen);
  });

  it("picks longest authoritative candidate over shorter picker", () => {
    const result = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "x".repeat(9000),
      pickerPlain: "y".repeat(7530),
      renderedPreviewPlain: "z".repeat(7530),
      finalReviewAuthorityOnly: true,
    });
    expect(result.plainText.length).toBe(9000);
  });

  it("logs final-review-authoritative-render", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "body",
      finalReviewAuthorityOnly: true,
    });
    logFinalReviewAuthoritativeRender({
      authoritativeLen: 4,
      renderedLen: 0,
      source: "authoritative_hydrated",
      displayLen: 4,
      authorityOnly: true,
    });
    info.mockRestore();
  });
});
