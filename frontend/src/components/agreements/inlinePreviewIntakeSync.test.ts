import { describe, expect, it } from "vitest";
import { buildLiveDraftPreview, mergeLivePreviewInlineOverrides } from "./liveDraftHeuristics";
import { upsertLabeledIntakeLine } from "./inlinePreviewIntakeSync";

describe("upsertLabeledIntakeLine", () => {
  it("appends a labeled line when missing", () => {
    expect(upsertLabeledIntakeLine("Hello world", "Parties", "A and B")).toBe("Hello world\nParties: A and B");
  });

  it("replaces a same-label line case-insensitively", () => {
    expect(upsertLabeledIntakeLine("Parties: old\nMore", "Parties", "new")).toBe("Parties: new\nMore");
    expect(upsertLabeledIntakeLine("parties: old", "Parties", "X")).toBe("Parties: X");
  });
});

describe("mergeLivePreviewInlineOverrides", () => {
  it("overrides schedule when parse misses payment wording", () => {
    const base = buildLiveDraftPreview("Do the thing soon.");
    const merged = mergeLivePreviewInlineOverrides(base, { Payment: "$500 on delivery" });
    expect(merged.scheduleLine).toBe("$500 on delivery");
  });
});
