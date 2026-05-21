import { describe, expect, it } from "vitest";
import { buildSourceComparisonView, filterSourceComparisonSections } from "./sourceComparisonReview";

describe("sourceComparisonReview", () => {
  it("groups changed sections and supports changed-only filter", () => {
    const source = [
      "1. SERVICES",
      "Provider will deliver migration services.",
      "",
      "2. FEES",
      "Total fee is $100,000.",
    ].join("\n");
    const revised = [
      "1. SERVICES",
      "Provider will deliver migration and support services.",
      "",
      "2. FEES",
      "Total fee is $120,000.",
    ].join("\n");
    const view = buildSourceComparisonView(source, revised);
    expect(view.summary.changedSections).toBeGreaterThan(0);
    const changedOnly = filterSourceComparisonSections(view.sections, true);
    expect(changedOnly.every((s) => s.status !== "unchanged")).toBe(true);
    expect(changedOnly.length).toBeLessThanOrEqual(view.sections.length);
  });

  it("detects unchanged sections when text matches", () => {
    const text = "1. CONFIDENTIALITY\n\nEach party will protect confidential information.";
    const view = buildSourceComparisonView(text, text);
    expect(view.summary.changedSections).toBe(0);
    expect(view.summary.unchangedSections).toBeGreaterThan(0);
  });
});
