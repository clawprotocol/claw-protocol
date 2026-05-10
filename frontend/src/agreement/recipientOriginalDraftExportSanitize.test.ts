import { describe, expect, it } from "vitest";
import { stripCompareMarkupFromOriginalDraftHtml } from "./recipientOriginalDraftExportSanitize";

describe("stripCompareMarkupFromOriginalDraftHtml", () => {
  it("unwraps ins and del to text", () => {
    const html = "<p>Fee is <del>on receipt</del><ins>Net 30</ins>.</p>";
    const out = stripCompareMarkupFromOriginalDraftHtml(html);
    expect(out).toContain("on receipt");
    expect(out).toContain("Net 30");
    expect(out).not.toContain("<del");
    expect(out).not.toContain("<ins");
  });

  it("strips data-redline hooks", () => {
    const html = '<p data-redline="insert">Clean sentence.</p>';
    const out = stripCompareMarkupFromOriginalDraftHtml(html);
    expect(out).not.toContain("data-redline");
  });
});
