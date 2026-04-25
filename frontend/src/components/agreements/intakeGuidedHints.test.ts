import { describe, expect, it } from "vitest";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { buildIntakeGuidedHints, isUsablePartialIntakeStructure } from "./intakeGuidedHints";

describe("intakeGuidedHints", () => {
  it("treats default starter NDA phrase as usable partial structure (inferred type)", () => {
    const text = "Simple NDA between two parties";
    const model = buildLiveDraftPreview(text);
    expect(model.docTitle).not.toBe("Agreement");
    expect(isUsablePartialIntakeStructure(model, text)).toBe(true);
    const hints = buildIntakeGuidedHints(model, text);
    expect(hints.length).toBeGreaterThanOrEqual(3);
    expect(hints.some((h) => /party|names/i.test(h))).toBe(true);
  });
});
